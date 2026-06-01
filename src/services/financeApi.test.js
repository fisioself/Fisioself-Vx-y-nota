import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock chainable de Supabase. Cada llamada `from(tabla)` devuelve un builder
// encadenable (select/insert/update/eq/order/...) que además es "thenable": al
// hacer `await` resuelve { data, error, count } según la config de esa tabla.
// `.single()` resuelve el objeto configurado para esa tabla.
function makeDb(config = {}) {
  const from = vi.fn((table) => {
    const cfg = config[table] || {};
    const result = { data: cfg.rows ?? [], error: cfg.error ?? null, count: cfg.count ?? 0 };
    const builder = {};
    const chain = [
      'select',
      'insert',
      'update',
      'delete',
      'eq',
      'neq',
      'gte',
      'lte',
      'gt',
      'lt',
      'order',
      'limit',
      'or'
    ];
    for (const m of chain) builder[m] = vi.fn(() => builder);
    builder.single = vi.fn(() =>
      Promise.resolve({ data: cfg.single ?? null, error: cfg.error ?? null })
    );
    builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
    return builder;
  });
  const rpc = vi.fn(() => Promise.resolve({ data: config.__rpc ?? null, error: null }));
  return { from, rpc };
}

const loadFinanceApi = async (db) => {
  vi.resetModules();
  vi.doMock('../lib/supabaseClient.js', () => ({
    isSupabaseConfigured: true,
    supabase: db,
    assertSupabase: () => db
  }));
  return import('./financeApi');
};

afterEach(() => {
  vi.doUnmock('../lib/supabaseClient.js');
  vi.restoreAllMocks();
});

describe('financeApi.getPatientFinance', () => {
  it('suma totales, pagos y sesiones de los paquetes del paciente', async () => {
    const db = makeDb({
      patient_packages: {
        rows: [
          { id: 'pk1', total_amount: 1000, sessions_total: 10, sessions_used: 3 },
          { id: 'pk2', total_amount: 500, sessions_total: 5, sessions_used: 1 }
        ]
      },
      payments: {
        rows: [
          { id: 'p1', amount: 800 },
          { id: 'p2', amount: 200 }
        ]
      }
    });
    const { financeApi } = await loadFinanceApi(db);

    const summary = await financeApi.getPatientFinance('patient-1');

    expect(summary.totalBilled).toBe(1500);
    expect(summary.totalPaid).toBe(1000);
    expect(summary.balance).toBe(500);
    expect(summary.sessionsTotal).toBe(15);
    expect(summary.sessionsUsed).toBe(4);
    expect(summary.sessionsRemaining).toBe(11);
  });
});

describe('financeApi.getPatientSessionCount', () => {
  it('cuenta citas no canceladas del paciente hasta la fecha', async () => {
    const db = makeDb({ appointments: { count: 12 } });
    const { financeApi } = await loadFinanceApi(db);

    const n = await financeApi.getPatientSessionCount('patient-1', '2026-06-01T10:00:00Z');

    expect(n).toBe(12);
    expect(db.from).toHaveBeenCalledWith('appointments');
  });
});

describe('financeApi.suggestPriceForSessionType', () => {
  it('devuelve null cuando no hay tipo de sesión', async () => {
    const db = makeDb({});
    const { financeApi } = await loadFinanceApi(db);
    expect(await financeApi.suggestPriceForSessionType(null)).toBeNull();
  });

  it('devuelve el precio del catálogo para el tipo de sesión', async () => {
    const db = makeDb({ packages: { rows: [{ price: 350, sessions_included: 1 }] } });
    const { financeApi } = await loadFinanceApi(db);
    expect(await financeApi.suggestPriceForSessionType('Sesión clínica')).toBe(350);
  });
});

describe('financeApi.listActivePatientPackages', () => {
  it('filtra paquetes con sesiones disponibles', async () => {
    const db = makeDb({
      patient_packages: {
        rows: [
          { id: 'pk1', sessions_total: 10, sessions_used: 10 }, // agotado
          { id: 'pk2', sessions_total: 5, sessions_used: 2 } // disponible
        ]
      }
    });
    const { financeApi } = await loadFinanceApi(db);

    const active = await financeApi.listActivePatientPackages('patient-1');

    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('pk2');
  });
});

describe('financeApi.chargeAppointment', () => {
  it('sesión suelta: crea un pago con monto y método', async () => {
    const db = makeDb({ payments: { single: { id: 'pay-1', amount: 350, method: 'efectivo' } } });
    const { financeApi } = await loadFinanceApi(db);

    const payment = await financeApi.chargeAppointment({
      appointmentId: 'appt-1',
      patientId: 'patient-1',
      usePackage: false,
      amount: 350,
      method: 'efectivo'
    });

    expect(payment).toMatchObject({ id: 'pay-1' });
    expect(db.from).toHaveBeenCalledWith('payments');
  });

  it('con paquete: descuenta una sesión y registra pago de seguimiento', async () => {
    const db = makeDb({
      patient_packages: {
        single: { id: 'pk1', name: 'Paquete 10', sessions_total: 10, sessions_used: 3 }
      },
      payments: { single: { id: 'track-1', amount: 0, method: 'paquete' } }
    });
    const { financeApi } = await loadFinanceApi(db);

    const tracking = await financeApi.chargeAppointment({
      appointmentId: 'appt-1',
      patientId: 'patient-1',
      usePackage: true,
      patientPackageId: 'pk1'
    });

    expect(tracking).toMatchObject({ id: 'track-1', method: 'paquete' });
    expect(db.from).toHaveBeenCalledWith('patient_packages');
    expect(db.from).toHaveBeenCalledWith('payments');
  });

  it('con paquete sin sesiones disponibles lanza error', async () => {
    const db = makeDb({
      patient_packages: {
        single: { id: 'pk1', name: 'Paquete', sessions_total: 5, sessions_used: 5 }
      }
    });
    const { financeApi } = await loadFinanceApi(db);

    await expect(
      financeApi.chargeAppointment({
        appointmentId: 'appt-1',
        patientId: 'patient-1',
        usePackage: true,
        patientPackageId: 'pk1'
      })
    ).rejects.toThrow();
  });
});

describe('financeApi.deleteAppointmentCharge', () => {
  it('devuelve la sesión al paquete cuando el pago era de tipo paquete', async () => {
    const db = makeDb({
      patient_packages: { single: { id: 'pk1', sessions_used: 4 } }
    });
    const { financeApi } = await loadFinanceApi(db);

    await financeApi.deleteAppointmentCharge({
      id: 'track-1',
      patient_package_id: 'pk1',
      method: 'paquete'
    });

    expect(db.from).toHaveBeenCalledWith('patient_packages');
    expect(db.from).toHaveBeenCalledWith('payments');
  });
});

describe('financeApi.getGlobalFinance', () => {
  it('agrega ingresos, gastos, caja por método y top de pacientes', async () => {
    const monthA = '2026-05-15T12:00:00Z';
    const monthB = '2026-06-15T12:00:00Z';
    const db = makeDb({
      __rpc: {
        monthly: [
          { month: '2026-05', patients: 4, sessions: 8, newPatients: 1, valoraciones: 1 },
          { month: '2026-06', patients: 6, sessions: 12, newPatients: 2, valoraciones: 2 }
        ],
        currentMonth: { patients: 6, sessions: 12 },
        last30d: { patients: 6, sessions: 12 },
        totalSessions: 20
      },
      payments: {
        rows: [
          { amount: 350, paid_at: monthA, patient_id: 'pa', method: 'efectivo' },
          { amount: 700, paid_at: monthB, patient_id: 'pb', method: 'tarjeta' },
          { amount: 150, paid_at: monthB, patient_id: 'pa', method: 'efectivo' }
        ]
      },
      expenses: {
        rows: [{ amount: 200, spent_at: monthB, category: 'material' }]
      },
      patients: {
        rows: [
          { id: 'pa', full_name: 'Ana' },
          { id: 'pb', full_name: 'Beto' }
        ]
      },
      caja_movements: {
        rows: [{ amount: 100, method: 'efectivo' }]
      }
    });
    const { financeApi } = await loadFinanceApi(db);

    const result = await financeApi.getGlobalFinance(12);

    // Caja: 350 + 700 + 150 (pagos) + 100 (ajuste) = 1300
    expect(result.caja.total).toBe(1300);
    expect(result.caja.byMethod.efectivo).toBe(350 + 150 + 100);
    expect(result.caja.byMethod.tarjeta).toBe(700);

    // Top pacientes por ingreso
    const ana = result.topPatients.find((t) => t.patientId === 'pa');
    const beto = result.topPatients.find((t) => t.patientId === 'pb');
    expect(ana.paid).toBe(500);
    expect(beto.paid).toBe(700);
    expect(ana.fullName).toBe('Ana');

    // Gastos por categoría
    expect(result.expensesByCategory).toContainEqual({ category: 'material', amount: 200 });

    // Serie mensual presente para ambos meses
    expect(result.monthly.map((m) => m.month)).toEqual(
      expect.arrayContaining(['2026-05', '2026-06'])
    );
  });
});

describe('financeApi simple writers', () => {
  it('addExpense inserta en expenses', async () => {
    const db = makeDb({ expenses: { single: { id: 'exp-1', amount: 200 } } });
    const { financeApi } = await loadFinanceApi(db);
    const expense = await financeApi.addExpense({ category: 'material', amount: 200 });
    expect(expense).toMatchObject({ id: 'exp-1' });
    expect(db.from).toHaveBeenCalledWith('expenses');
  });

  it('addCajaMovement inserta en caja_movements', async () => {
    const db = makeDb({ caja_movements: { single: { id: 'mov-1', amount: -50 } } });
    const { financeApi } = await loadFinanceApi(db);
    const mov = await financeApi.addCajaMovement({ amount: -50, method: 'efectivo' });
    expect(mov).toMatchObject({ id: 'mov-1' });
    expect(db.from).toHaveBeenCalledWith('caja_movements');
  });

  it('addPatientPackage inserta en patient_packages', async () => {
    const db = makeDb({ patient_packages: { single: { id: 'pk-1', name: 'Paquete 10' } } });
    const { financeApi } = await loadFinanceApi(db);
    const pkg = await financeApi.addPatientPackage({
      patientId: 'patient-1',
      name: 'Paquete 10',
      totalAmount: 1000,
      sessionsTotal: 10
    });
    expect(pkg).toMatchObject({ id: 'pk-1' });
    expect(db.from).toHaveBeenCalledWith('patient_packages');
  });
});

describe('financeApi listers y borradores', () => {
  it('listPackages lee el catálogo activo', async () => {
    const db = makeDb({ packages: { rows: [{ id: 'cat-1', name: 'Sesión', price: 350 }] } });
    const { financeApi } = await loadFinanceApi(db);
    const list = await financeApi.listPackages();
    expect(list).toHaveLength(1);
    expect(db.from).toHaveBeenCalledWith('packages');
  });

  it('listExpenses lee gastos', async () => {
    const db = makeDb({ expenses: { rows: [{ id: 'e1' }] } });
    const { financeApi } = await loadFinanceApi(db);
    await financeApi.listExpenses();
    expect(db.from).toHaveBeenCalledWith('expenses');
  });

  it('listCajaMovements lee movimientos', async () => {
    const db = makeDb({ caja_movements: { rows: [{ id: 'm1' }] } });
    const { financeApi } = await loadFinanceApi(db);
    await financeApi.listCajaMovements();
    expect(db.from).toHaveBeenCalledWith('caja_movements');
  });

  it('getAppointmentCharge lee pagos por cita', async () => {
    const db = makeDb({ payments: { rows: [{ id: 'p1', appointment_id: 'a1' }] } });
    const { financeApi } = await loadFinanceApi(db);
    const rows = await financeApi.getAppointmentCharge('a1');
    expect(rows).toHaveLength(1);
    expect(db.from).toHaveBeenCalledWith('payments');
  });

  it('setSessionsUsed actualiza el paquete', async () => {
    const db = makeDb({});
    const { financeApi } = await loadFinanceApi(db);
    await financeApi.setSessionsUsed('pk1', 4);
    expect(db.from).toHaveBeenCalledWith('patient_packages');
  });

  it('deletePatientPackage / deletePayment / deleteExpense / deleteCajaMovement borran su fila', async () => {
    const db = makeDb({});
    const { financeApi } = await loadFinanceApi(db);
    await financeApi.deletePatientPackage('pk1');
    await financeApi.deletePayment('p1');
    await financeApi.deleteExpense('e1');
    await financeApi.deleteCajaMovement('m1');
    expect(db.from).toHaveBeenCalledWith('patient_packages');
    expect(db.from).toHaveBeenCalledWith('payments');
    expect(db.from).toHaveBeenCalledWith('expenses');
    expect(db.from).toHaveBeenCalledWith('caja_movements');
  });

  it('addPayment inserta un pago suelto', async () => {
    const db = makeDb({ payments: { single: { id: 'p9', amount: 500 } } });
    const { financeApi } = await loadFinanceApi(db);
    const pay = await financeApi.addPayment({ patientId: 'patient-1', amount: 500 });
    expect(pay).toMatchObject({ id: 'p9' });
  });
});
