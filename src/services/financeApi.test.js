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
  // rpc por nombre: __rpcByName mapea cada función a su respuesta; si no, cae a
  // __rpc (usado por chargeAppointment, que solo invoca un RPC).
  const rpc = vi.fn((name) => {
    const byName = config.__rpcByName;
    if (byName && Object.prototype.hasOwnProperty.call(byName, name)) {
      return Promise.resolve({ data: byName[name], error: null });
    }
    return Promise.resolve({ data: config.__rpc ?? null, error: null });
  });
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
        // Pagos de paquete: llevan patient_package_id (como en producción).
        rows: [
          { id: 'p1', amount: 800, patient_package_id: 'pk1' },
          { id: 'p2', amount: 200, patient_package_id: 'pk2' }
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

  it('los abonos sueltos (sin paquete) cuentan como facturado y pagado, sin saldo negativo', async () => {
    const db = makeDb({
      patient_packages: {
        rows: [{ id: 'pk1', total_amount: 3000, sessions_total: 10, sessions_used: 0 }]
      },
      payments: {
        rows: [
          // Liquida el paquete.
          { id: 'p1', amount: 3000, patient_package_id: 'pk1' },
          // Abono suelto por un servicio extra fuera de paquete (sin link).
          { id: 'p2', amount: 500, patient_package_id: null }
        ]
      }
    });
    const { financeApi } = await loadFinanceApi(db);

    const summary = await financeApi.getPatientFinance('patient-1');

    // Antes: totalBilled=3000, totalPaid=3500 → balance=-500 (mostrado en verde
    // como "a favor"). Ahora el abono suelto suma a ambos: balance=0.
    expect(summary.totalBilled).toBe(3500);
    expect(summary.totalPaid).toBe(3500);
    expect(summary.balance).toBe(0);
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

describe('financeApi.getPackageSessionPosition', () => {
  it('cuenta las sesiones no-valoración del paquete hasta la fecha', async () => {
    const db = makeDb({ appointments: { count: 4 } });
    const { financeApi } = await loadFinanceApi(db);

    const pos = await financeApi.getPackageSessionPosition(
      'patient-1',
      '2026-05-01T00:00:00Z',
      '2026-06-01T10:00:00Z'
    );

    expect(pos).toBe(4);
    expect(db.from).toHaveBeenCalledWith('appointments');
  });

  it('propaga el error de Supabase', async () => {
    const db = makeDb({ appointments: { error: new Error('boom') } });
    const { financeApi } = await loadFinanceApi(db);

    await expect(
      financeApi.getPackageSessionPosition('p1', '2026-05-01T00:00:00Z', '2026-06-01T00:00:00Z')
    ).rejects.toThrow('boom');
  });
});

describe('financeApi.syncPackageSessionsUsed', () => {
  it('corrige sessions_used al número real de sesiones tomadas (con tope en el total)', async () => {
    // El paquete dice 2 usadas, pero hay 5 sesiones reales tomadas; con total=10
    // debe quedar en 5. Capturamos el update para verificar el valor corregido.
    const updates = [];
    const db = {
      from: vi.fn((table) => {
        const builder = {};
        for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'or']) {
          builder[m] = vi.fn(() => builder);
        }
        if (table === 'patient_packages') {
          builder.update = vi.fn((vals) => {
            updates.push(vals);
            return builder;
          });
          // select(...).eq(...) → lista de paquetes (thenable).
          builder.then = (resolve) =>
            Promise.resolve({
              data: [
                {
                  id: 'pkg-1',
                  patient_id: 'p1',
                  purchased_at: '2026-05-01T00:00:00Z',
                  sessions_total: 10,
                  sessions_used: 2
                }
              ],
              error: null
            }).then(resolve);
          return builder;
        }
        // appointments: count head → 5 sesiones reales.
        builder.then = (resolve) =>
          Promise.resolve({ data: null, error: null, count: 5 }).then(resolve);
        return builder;
      })
    };
    const { financeApi } = await loadFinanceApi(db);

    await financeApi.syncPackageSessionsUsed('p1');

    expect(updates).toEqual([expect.objectContaining({ sessions_used: 5 })]);
  });

  it('no actualiza si sessions_used ya coincide con el conteo real', async () => {
    const updates = [];
    const db = {
      from: vi.fn((table) => {
        const builder = {};
        for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'or']) {
          builder[m] = vi.fn(() => builder);
        }
        if (table === 'patient_packages') {
          builder.update = vi.fn((vals) => {
            updates.push(vals);
            return builder;
          });
          builder.then = (resolve) =>
            Promise.resolve({
              data: [
                {
                  id: 'pkg-1',
                  patient_id: 'p1',
                  purchased_at: '2026-05-01T00:00:00Z',
                  sessions_total: 10,
                  sessions_used: 3
                }
              ],
              error: null
            }).then(resolve);
          return builder;
        }
        builder.then = (resolve) =>
          Promise.resolve({ data: null, error: null, count: 3 }).then(resolve);
        return builder;
      })
    };
    const { financeApi } = await loadFinanceApi(db);

    await financeApi.syncPackageSessionsUsed('p1');

    // El conteo real (3) == sessions_used (3): no debe escribir nada.
    expect(updates).toEqual([]);
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
  it('sesión suelta: llama al RPC atómico con monto y método', async () => {
    const db = makeDb({ __rpc: { id: 'pay-1', amount: 350, method: 'efectivo' } });
    const { financeApi } = await loadFinanceApi(db);

    const payment = await financeApi.chargeAppointment({
      appointmentId: 'appt-1',
      patientId: 'patient-1',
      usePackage: false,
      amount: 350,
      method: 'efectivo'
    });

    expect(payment).toMatchObject({ id: 'pay-1' });
    // El cobro se hace en UNA transacción del servidor (RPC), no con escrituras
    // sueltas desde el cliente.
    expect(db.rpc).toHaveBeenCalledWith(
      'charge_appointment',
      expect.objectContaining({
        p_appointment_id: 'appt-1',
        p_patient_id: 'patient-1',
        p_use_package: false,
        p_patient_package_id: null,
        p_amount: 350,
        p_method: 'efectivo'
      })
    );
  });

  it('con tarjeta: cobra el BRUTO y pasa la comisión al RPC (no se descuenta del saldo)', async () => {
    const db = makeDb({ __rpc: { id: 'pay-1', amount: 1000, method: 'tarjeta' } });
    const { financeApi } = await loadFinanceApi(db);

    await financeApi.chargeAppointment({
      appointmentId: 'appt-1',
      patientId: 'patient-1',
      usePackage: false,
      amount: 1000,
      method: 'tarjeta'
    });

    // El pago va en bruto ($1000) y la comisión (1000 * 0.0406 = 40.6) se pasa
    // aparte para registrarse como gasto ligado dentro del RPC.
    expect(db.rpc).toHaveBeenCalledWith(
      'charge_appointment',
      expect.objectContaining({ p_amount: 1000, p_method: 'tarjeta', p_commission: 40.6 })
    );
  });

  it('en efectivo no hay comisión (p_commission = 0)', async () => {
    const db = makeDb({ __rpc: { id: 'pay-1', amount: 350, method: 'efectivo' } });
    const { financeApi } = await loadFinanceApi(db);

    await financeApi.chargeAppointment({
      appointmentId: 'appt-1',
      patientId: 'patient-1',
      usePackage: false,
      amount: 350,
      method: 'efectivo'
    });

    expect(db.rpc).toHaveBeenCalledWith(
      'charge_appointment',
      expect.objectContaining({ p_commission: 0 })
    );
  });

  it('con paquete: llama al RPC con el paquete y devuelve el pago de seguimiento', async () => {
    const db = makeDb({ __rpc: { id: 'track-1', amount: 0, method: 'paquete' } });
    const { financeApi } = await loadFinanceApi(db);

    const tracking = await financeApi.chargeAppointment({
      appointmentId: 'appt-1',
      patientId: 'patient-1',
      usePackage: true,
      patientPackageId: 'pk1',
      amount: 200
    });

    expect(tracking).toMatchObject({ id: 'track-1', method: 'paquete' });
    expect(db.rpc).toHaveBeenCalledWith(
      'charge_appointment',
      expect.objectContaining({
        p_use_package: true,
        p_patient_package_id: 'pk1',
        p_amount: 200
      })
    );
  });

  it('propaga el error del RPC (p. ej. paquete sin sesiones)', async () => {
    const db = makeDb();
    db.rpc = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: new Error('Ese paquete ya no tiene sesiones disponibles.')
      })
    );
    const { financeApi } = await loadFinanceApi(db);

    await expect(
      financeApi.chargeAppointment({
        appointmentId: 'appt-1',
        patientId: 'patient-1',
        usePackage: true,
        patientPackageId: 'pk1'
      })
    ).rejects.toThrow(/sesiones disponibles/i);
  });

  it('rechaza montos negativos sin tocar la red', async () => {
    const db = makeDb();
    const { financeApi } = await loadFinanceApi(db);

    await expect(
      financeApi.chargeAppointment({
        appointmentId: 'appt-1',
        patientId: 'patient-1',
        usePackage: false,
        amount: -50
      })
    ).rejects.toThrow(/no puede ser negativo/i);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('exige paquete cuando usePackage es true', async () => {
    const db = makeDb();
    const { financeApi } = await loadFinanceApi(db);

    await expect(
      financeApi.chargeAppointment({
        appointmentId: 'appt-1',
        patientId: 'patient-1',
        usePackage: true
      })
    ).rejects.toThrow(/seleccionar el paquete/i);
    expect(db.rpc).not.toHaveBeenCalled();
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
  it('combina las series de los RPC de citas y de dinero', async () => {
    // La agregación de dinero ahora la hace el RPC finance_money_stats en SQL
    // (validada por paridad contra la BD). Aquí verificamos que getGlobalFinance
    // COMBINE correctamente ambos RPC: citas (pacientes/sesiones) + dinero.
    const db = makeDb({
      __rpcByName: {
        finance_appt_stats: {
          monthly: [
            { month: '2026-05', patients: 4, sessions: 8, newPatients: 1, valoraciones: 1 },
            { month: '2026-06', patients: 6, sessions: 12, newPatients: 2, valoraciones: 2 }
          ],
          currentMonth: { patients: 6, sessions: 12, valoraciones: 2 },
          last30d: { patients: 6, sessions: 12, valoraciones: 2 },
          totalSessions: 20
        },
        finance_money_stats: {
          monthly: [
            { month: '2026-05', income: 350, expenses: 0, net: 350 },
            { month: '2026-06', income: 850, expenses: 200, net: 650 }
          ],
          currentMonth: { income: 850, expenses: 200, net: 650 },
          last30d: { income: 850, expenses: 200, net: 650 },
          caja: { total: 1300, byMethod: { efectivo: 600, tarjeta: 700 } },
          growthIncome: null,
          topPatients: [
            { patientId: 'pb', fullName: 'Beto', paid: 700 },
            { patientId: 'pa', fullName: 'Ana', paid: 500 }
          ],
          expensesByCategory: [{ category: 'material', amount: 200 }]
        }
      }
    });
    const { financeApi } = await loadFinanceApi(db);

    const result = await financeApi.getGlobalFinance(12);

    // Caja, top pacientes y gastos por categoría vienen tal cual del RPC de dinero.
    expect(result.caja.total).toBe(1300);
    expect(result.caja.byMethod.efectivo).toBe(600);
    expect(result.caja.byMethod.tarjeta).toBe(700);
    expect(result.topPatients.find((t) => t.patientId === 'pb').paid).toBe(700);
    expect(result.expensesByCategory).toContainEqual({ category: 'material', amount: 200 });

    // Serie mensual COMBINADA: dinero + citas en la misma fila.
    const may = result.monthly.find((m) => m.month === '2026-05');
    const jun = result.monthly.find((m) => m.month === '2026-06');
    expect(may).toMatchObject({ income: 350, patients: 4, sessions: 8 });
    expect(jun).toMatchObject({
      income: 850,
      expenses: 200,
      net: 650,
      patients: 6,
      valoraciones: 2
    });

    // Mes en curso combina ingreso (dinero) + pacientes (citas).
    expect(result.currentMonth.income).toBe(850);
    expect(result.currentMonth.patients).toBe(6);
    expect(result.last30d.income).toBe(850);
    expect(result.last30d.patients).toBe(6);
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

  it('addPayment inserta un pago suelto (efectivo: sin gasto de comisión)', async () => {
    const db = makeDb({ payments: { single: { id: 'p9', amount: 500 } } });
    const { financeApi } = await loadFinanceApi(db);
    const pay = await financeApi.addPayment({
      patientId: 'patient-1',
      amount: 500,
      method: 'efectivo'
    });
    expect(pay).toMatchObject({ id: 'p9' });
    // Efectivo no genera comisión → no se toca la tabla expenses.
    expect(db.from).not.toHaveBeenCalledWith('expenses');
  });

  it('addPayment con tarjeta registra la comisión como gasto ligado al pago', async () => {
    const db = makeDb({ payments: { single: { id: 'p9', amount: 1000 } } });
    const { financeApi } = await loadFinanceApi(db);
    await financeApi.addPayment({ patientId: 'patient-1', amount: 1000, method: 'tarjeta' });
    // El pago se guarda en bruto y la comisión (40.6) entra como gasto.
    expect(db.from).toHaveBeenCalledWith('expenses');
  });

  it('deletePatientPackageFully borra los pagos del paquete y el paquete', async () => {
    const db = makeDb({});
    const { financeApi } = await loadFinanceApi(db);
    await financeApi.deletePatientPackageFully('pk1');
    expect(db.from).toHaveBeenCalledWith('payments');
    expect(db.from).toHaveBeenCalledWith('patient_packages');
  });

  it('listRecentPayments trae pagos con monto > 0', async () => {
    const db = makeDb({
      payments: { rows: [{ id: 'p1', amount: 350, patients: { full_name: 'Ana' } }] }
    });
    const { financeApi } = await loadFinanceApi(db);
    const rows = await financeApi.listRecentPayments();
    expect(rows).toHaveLength(1);
    expect(db.from).toHaveBeenCalledWith('payments');
  });
});
