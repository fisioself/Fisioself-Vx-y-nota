import { assertSupabase } from '../lib/supabaseClient';
import type { Tables, TablesInsert } from '../types/supabase';

export type Package = Tables<'packages'>;
export type PatientPackage = Tables<'patient_packages'>;
export type Payment = Tables<'payments'>;
export type Expense = Tables<'expenses'>;
export type CajaMovement = Tables<'caja_movements'>;

// Pago con nombre de paciente y tipo de sesión (vía appointments) embebidos.
// Supabase devuelve la relación como objeto o arreglo según el tipado del cliente.
export type PaymentWithPatient = Payment & {
  patients?: { full_name: string | null } | { full_name: string | null }[] | null;
  appointments?: { session_type: string | null; starts_at: string } | null;
};

// Métodos de pago/caja soportados. La transferencia entra ÍNTEGRA a la caja
// (no se le descuenta comisión; solo la tarjeta tiene comisión de terminal).
export const PAYMENT_METHODS = ['efectivo', 'tarjeta', 'transferencia'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface PatientFinanceSummary {
  totalBilled: number;
  totalPaid: number;
  balance: number;
  sessionsTotal: number;
  sessionsUsed: number;
  sessionsRemaining: number;
  packages: PatientPackage[];
  payments: Payment[];
}

export interface MonthlyPoint {
  month: string; // 'YYYY-MM'
  income: number;
  expenses: number;
  net: number;
  patients: number; // pacientes atendidos ese mes
  sessions: number; // sesiones (citas) ese mes
  newPatients: number; // pacientes nuevos convertidos (valoración + sesión)
  valoraciones: number; // valoraciones (color morado) ese mes
}

export interface PeriodSummary {
  income: number;
  expenses: number;
  net: number;
  patients: number;
  sessions: number; // sesiones cobradas (azul/naranja/amarillo/rosa), sin valoraciones
  valoraciones: number; // valoraciones (morado) — métrica aparte
}

export interface TopPatientRow {
  patientId: string;
  fullName: string;
  paid: number;
}

export interface CategoryRow {
  category: string;
  amount: number;
}

export interface GlobalFinanceSummary {
  currentMonth: PeriodSummary; // mes en curso
  last30d: PeriodSummary; // últimos 30 días
  monthly: MonthlyPoint[]; // historial mensual (neto y pacientes)
  caja: { total: number; byMethod: Record<string, number> }; // todo el tiempo
  growth: { income: number | null; patients: number | null }; // % mes en curso vs mes anterior
  topPatients: TopPatientRow[]; // por ingreso, todo el tiempo
  expensesByCategory: CategoryRow[];
}

interface ApptStats {
  monthly: Array<{
    month: string;
    patients: number;
    sessions: number;
    newPatients: number;
    valoraciones: number;
  }>;
  currentMonth: { patients: number; sessions: number; valoraciones: number };
  last30d: { patients: number; sessions: number; valoraciones: number };
  totalSessions: number;
}

const unwrap = <T>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

const sum = (rows: Array<{ amount?: number | null }>, key: 'amount' = 'amount'): number =>
  rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0);

// Toda fecha se interpreta en horario de CDMX (la base corre en UTC). Sin esto,
// los cortes mensuales se desfasan hasta 6 h respecto a la función SQL.
const CDMX_TZ = 'America/Mexico_City';
const cdmxDay = (d: Date | string): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: CDMX_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(typeof d === 'string' ? new Date(d) : d); // 'YYYY-MM-DD'

const monthKey = (isoDate: string): string => cdmxDay(isoDate).slice(0, 7); // 'YYYY-MM' en CDMX

export const financeApi = {
  // ---------- Catálogo de precios ----------
  async listPackages(): Promise<Package[]> {
    const db = assertSupabase();
    return unwrap(
      await db.from('packages').select('*').eq('active', true).order('price', { ascending: true })
    );
  },

  // ---------- Finanzas por paciente ----------
  async getPatientFinance(patientId: string): Promise<PatientFinanceSummary> {
    const db = assertSupabase();
    const [pkgRes, payRes] = await Promise.all([
      db
        .from('patient_packages')
        .select('*')
        .eq('patient_id', patientId)
        .order('purchased_at', { ascending: false }),
      db
        .from('payments')
        .select('*')
        .eq('patient_id', patientId)
        .order('paid_at', { ascending: false })
    ]);
    const packages = unwrap<PatientPackage[]>(pkgRes);
    const payments = unwrap<Payment[]>(payRes);

    const totalBilled = packages.reduce((a, p) => a + Number(p.total_amount ?? 0), 0);
    const totalPaid = sum(payments);
    const sessionsTotal = packages.reduce((a, p) => a + Number(p.sessions_total ?? 0), 0);
    const sessionsUsed = packages.reduce((a, p) => a + Number(p.sessions_used ?? 0), 0);

    return {
      totalBilled,
      totalPaid,
      balance: totalBilled - totalPaid,
      sessionsTotal,
      sessionsUsed,
      sessionsRemaining: sessionsTotal - sessionsUsed,
      packages,
      payments
    };
  },

  async addPatientPackage(input: {
    patientId: string;
    packageId?: string | null;
    name: string;
    totalAmount: number;
    sessionsTotal: number;
    purchasedAt?: string;
    notes?: string;
  }): Promise<PatientPackage> {
    const db = assertSupabase();
    const payload: TablesInsert<'patient_packages'> = {
      patient_id: input.patientId,
      package_id: input.packageId ?? null,
      name: input.name,
      total_amount: input.totalAmount,
      sessions_total: input.sessionsTotal,
      purchased_at: input.purchasedAt,
      notes: input.notes ?? null
    };
    return unwrap(await db.from('patient_packages').insert(payload).select('*').single());
  },

  async setSessionsUsed(patientPackageId: string, sessionsUsed: number): Promise<void> {
    const db = assertSupabase();
    const { error } = await db
      .from('patient_packages')
      .update({ sessions_used: Math.max(0, sessionsUsed), updated_at: new Date().toISOString() })
      .eq('id', patientPackageId);
    if (error) throw error;
  },

  async deletePatientPackage(id: string): Promise<void> {
    const db = assertSupabase();
    const { error } = await db.from('patient_packages').delete().eq('id', id);
    if (error) throw error;
  },

  // Borra un paquete del paciente JUNTO con los pagos ligados a él (abono inicial
  // y registros de sesión). Útil para deshacer un paquete asignado por error,
  // sin dejar pagos sueltos colgando en la caja.
  async deletePatientPackageFully(patientPackageId: string): Promise<void> {
    const db = assertSupabase();
    const { error: payErr } = await db
      .from('payments')
      .delete()
      .eq('patient_package_id', patientPackageId);
    if (payErr) throw payErr;
    const { error } = await db.from('patient_packages').delete().eq('id', patientPackageId);
    if (error) throw error;
  },

  async addPayment(input: {
    patientId: string;
    patientPackageId?: string | null;
    appointmentId?: string | null;
    amount: number;
    method?: string;
    paidAt?: string;
    notes?: string;
  }): Promise<Payment> {
    const db = assertSupabase();
    const payload: TablesInsert<'payments'> = {
      patient_id: input.patientId,
      patient_package_id: input.patientPackageId ?? null,
      appointment_id: input.appointmentId ?? null,
      amount: input.amount,
      method: input.method ?? 'efectivo',
      paid_at: input.paidAt,
      notes: input.notes ?? null
    };
    return unwrap(await db.from('payments').insert(payload).select('*').single());
  },

  async deletePayment(id: string): Promise<void> {
    const db = assertSupabase();
    const { error } = await db.from('payments').delete().eq('id', id);
    if (error) throw error;
  },

  // ---------- Cobro desde la cita ----------
  // Paquetes del paciente con sesiones disponibles (para cobrar "con paquete").
  async listActivePatientPackages(patientId: string): Promise<PatientPackage[]> {
    const db = assertSupabase();
    const all = unwrap<PatientPackage[]>(
      await db
        .from('patient_packages')
        .select('*')
        .eq('patient_id', patientId)
        .order('purchased_at', { ascending: false })
    );
    return all.filter((p) => Number(p.sessions_used ?? 0) < Number(p.sessions_total ?? 0));
  },

  // Cobro(s) ya registrado(s) para una cita (para saber si ya se cobró).
  async getAppointmentCharge(appointmentId: string): Promise<Payment[]> {
    const db = assertSupabase();
    return unwrap(
      await db
        .from('payments')
        .select('*')
        .eq('appointment_id', appointmentId)
        .order('created_at', { ascending: false })
    );
  },

  // Registra el cobro de una cita. Dos modalidades:
  //  • Suelta: crea un pago con monto y método (efectivo/tarjeta).
  //  • Con paquete: descuenta una sesión del paquete y deja un pago de $0
  //    con método 'paquete' (no afecta la caja; la sesión ya estaba pagada).
  async chargeAppointment(input: {
    appointmentId: string;
    patientId: string;
    usePackage: boolean;
    patientPackageId?: string | null;
    amount?: number; // sesión suelta: monto cobrado; con paquete: abono parcial (0 = sin abono ahora)
    method?: PaymentMethod;
    paidAt?: string;
    notes?: string;
  }): Promise<Payment> {
    const db = assertSupabase();

    if (input.usePackage) {
      if (!input.patientPackageId) throw new Error('Falta seleccionar el paquete.');
      const pkg = unwrap<PatientPackage>(
        await db.from('patient_packages').select('*').eq('id', input.patientPackageId).single()
      );
      const used = Number(pkg.sessions_used ?? 0);
      const total = Number(pkg.sessions_total ?? 0);
      if (used >= total) throw new Error('Ese paquete ya no tiene sesiones disponibles.');

      const { error: upErr } = await db
        .from('patient_packages')
        .update({ sessions_used: used + 1, updated_at: new Date().toISOString() })
        .eq('id', input.patientPackageId);
      if (upErr) throw upErr;

      // Registro de sesión usada (amount=0, method='paquete') — siempre.
      const tracking = await this.addPayment({
        patientId: input.patientId,
        patientPackageId: input.patientPackageId,
        appointmentId: input.appointmentId,
        amount: 0,
        method: 'paquete',
        paidAt: input.paidAt,
        notes: input.notes ?? `Sesión de paquete: ${pkg.name}`
      });

      // Abono parcial adicional (si el usuario indicó un monto > 0).
      const abono = Number(input.amount ?? 0);
      if (abono > 0) {
        await this.addPayment({
          patientId: input.patientId,
          patientPackageId: input.patientPackageId,
          appointmentId: input.appointmentId,
          amount: abono,
          method: input.method ?? 'efectivo',
          paidAt: input.paidAt,
          notes: input.notes
        });
      }

      return tracking;
    }

    return this.addPayment({
      patientId: input.patientId,
      appointmentId: input.appointmentId,
      amount: input.amount ?? 0,
      method: input.method ?? 'efectivo',
      paidAt: input.paidAt,
      notes: input.notes
    });
  },

  // Elimina el cobro de una cita; si fue con paquete, devuelve la sesión.
  async deleteAppointmentCharge(payment: Payment): Promise<void> {
    const db = assertSupabase();
    if (payment.patient_package_id && payment.method === 'paquete') {
      const pkg = unwrap<PatientPackage>(
        await db.from('patient_packages').select('*').eq('id', payment.patient_package_id).single()
      );
      const used = Number(pkg.sessions_used ?? 0);
      const { error: upErr } = await db
        .from('patient_packages')
        .update({ sessions_used: Math.max(0, used - 1), updated_at: new Date().toISOString() })
        .eq('id', payment.patient_package_id);
      if (upErr) throw upErr;
    }
    const { error } = await db.from('payments').delete().eq('id', payment.id);
    if (error) throw error;
  },

  // Sincroniza sessions_used de cada paquete del paciente con el número real de
  // citas no canceladas desde purchased_at. Se llama al abrir el modal para que
  // el contador refleje la realidad sin requerir cobro manual por sesión.
  async syncPackageSessionsUsed(patientId: string): Promise<void> {
    const db = assertSupabase();
    const pkgs = unwrap<PatientPackage[]>(
      await db.from('patient_packages').select('*').eq('patient_id', patientId)
    );
    await Promise.all(
      pkgs
        .filter((pkg) => pkg.purchased_at)
        .map(async (pkg) => {
          const { count, error } = await db
            .from('appointments')
            .select('id', { count: 'exact', head: true })
            .eq('patient_id', patientId)
            .neq('status', 'cancelled')
            .gte('starts_at', pkg.purchased_at!);
          if (error) return;
          const realUsed = Math.min(count ?? 0, Number(pkg.sessions_total ?? 0));
          if (realUsed === Number(pkg.sessions_used ?? 0)) return;
          await db
            .from('patient_packages')
            .update({ sessions_used: realUsed, updated_at: new Date().toISOString() })
            .eq('id', pkg.id);
        })
    );
  },

  // Número de sesión del paciente — cuántas SESIONES (no canceladas) tiene hasta
  // la fecha de la cita actual, inclusive. Útil para mostrar "Sesión #N".
  // Las VALORACIONES (morado: color 9 o 1) NO cuentan como sesión: son aparte,
  // igual que en finance_appt_stats. Así "Sesión #N" no se infla por la VX.
  async getPatientSessionCount(patientId: string, upToDate?: string | null): Promise<number> {
    const db = assertSupabase();
    let q = db
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patientId)
      .neq('status', 'cancelled')
      // color_id NULL (sesión clínica sin color) o cualquiera que no sea valoración.
      .or('color_id.is.null,color_id.not.in.(9,1)');
    if (upToDate) q = q.lte('starts_at', upToDate);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  },

  // Precio sugerido del catálogo según el tipo de sesión de la cita.
  async suggestPriceForSessionType(sessionType: string | null): Promise<number | null> {
    if (!sessionType) return null;
    const db = assertSupabase();
    const rows = unwrap<Array<{ price: number; sessions_included: number }>>(
      await db
        .from('packages')
        .select('price, sessions_included')
        .eq('active', true)
        .eq('session_type', sessionType)
        .eq('sessions_included', 1)
        .order('price', { ascending: true })
    );
    return rows.length ? Number(rows[0].price) : null;
  },

  // ---------- Gastos ----------
  async listExpenses(limit = 100): Promise<Expense[]> {
    const db = assertSupabase();
    return unwrap(
      await db.from('expenses').select('*').order('spent_at', { ascending: false }).limit(limit)
    );
  },

  async addExpense(input: {
    category: string;
    description?: string;
    amount: number;
    spentAt?: string;
  }): Promise<Expense> {
    const db = assertSupabase();
    const payload: TablesInsert<'expenses'> = {
      category: input.category,
      description: input.description ?? null,
      amount: input.amount,
      spent_at: input.spentAt
    };
    return unwrap(await db.from('expenses').insert(payload).select('*').single());
  },

  async deleteExpense(id: string): Promise<void> {
    const db = assertSupabase();
    const { error } = await db.from('expenses').delete().eq('id', id);
    if (error) throw error;
  },

  // Cobros recientes de pacientes (para mostrarlos como líneas en la caja).
  // Incluye nombre del paciente y tipo de sesión vía appointments (si la tiene).
  async listRecentPayments(limit = 100): Promise<PaymentWithPatient[]> {
    const db = assertSupabase();
    return unwrap(
      await db
        .from('payments')
        .select('*, patients(full_name), appointments(session_type, starts_at)')
        .gt('amount', 0)
        .order('paid_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
    );
  },

  // ---------- Movimientos manuales de caja ----------
  async listCajaMovements(limit = 100): Promise<CajaMovement[]> {
    const db = assertSupabase();
    return unwrap(
      await db
        .from('caja_movements')
        .select('*')
        .order('occurred_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
    );
  },

  async addCajaMovement(input: {
    amount: number; // + entrada, − salida
    method?: PaymentMethod;
    description?: string;
    occurredAt?: string;
  }): Promise<CajaMovement> {
    const db = assertSupabase();
    const payload: TablesInsert<'caja_movements'> = {
      amount: input.amount,
      method: input.method ?? 'efectivo',
      description: input.description ?? null,
      occurred_at: input.occurredAt
    };
    return unwrap(await db.from('caja_movements').insert(payload).select('*').single());
  },

  async deleteCajaMovement(id: string): Promise<void> {
    const db = assertSupabase();
    const { error } = await db.from('caja_movements').delete().eq('id', id);
    if (error) throw error;
  },

  // ---------- Dashboard global ----------
  async getGlobalFinance(monthsBack = 12): Promise<GlobalFinanceSummary> {
    const db = assertSupabase();

    // Estadísticas de citas (pacientes/sesiones por mes) vía función agregadora.
    // Las citas son miles de filas, así que la base las agrega por nosotros.
    const rpc = db.rpc.bind(db) as unknown as (
      name: string,
      args?: Record<string, unknown>
    ) => Promise<{ data: unknown; error: unknown }>;
    const apptRes = await rpc('finance_appt_stats', { p_months_back: monthsBack });
    if (apptRes.error) throw apptRes.error;
    const appt = (apptRes.data as ApptStats | null) ?? {
      monthly: [],
      currentMonth: { patients: 0, sessions: 0, valoraciones: 0 },
      last30d: { patients: 0, sessions: 0, valoraciones: 0 },
      totalSessions: 0
    };

    // Pagos, gastos y movimientos de caja son tablas pequeñas → todo el histórico.
    const [payRes, expRes, patRes, cajaRes] = await Promise.all([
      db.from('payments').select('amount, paid_at, patient_id, method'),
      db.from('expenses').select('amount, spent_at, category'),
      db.from('patients').select('id, full_name'),
      db.from('caja_movements').select('amount, method')
    ]);
    const payments =
      unwrap<Array<{ amount: number; paid_at: string; patient_id: string; method: string }>>(
        payRes
      );
    const expenses = unwrap<Array<{ amount: number; spent_at: string; category: string }>>(expRes);
    const patients = unwrap<Array<{ id: string; full_name: string }>>(patRes);
    const cajaMovements = unwrap<Array<{ amount: number; method: string }>>(cajaRes);
    const nameById = new Map(patients.map((p) => [p.id, p.full_name]));

    // Claves de fecha (calculadas en horario de CDMX, igual que la función SQL)
    const now = new Date();
    const curMonthKey = cdmxDay(now).slice(0, 7); // 'YYYY-MM' en CDMX
    const [cy, cm] = curMonthKey.split('-').map(Number);
    const prevMonthKey = `${cm === 1 ? cy - 1 : cy}-${String(cm === 1 ? 12 : cm - 1).padStart(2, '0')}`;
    // Últimos 30 días: comparación por instante (independiente de zona horaria).
    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Ingresos / gastos por mes
    const incomeByMonth = new Map<string, number>();
    const expenseByMonth = new Map<string, number>();
    for (const p of payments) {
      const k = monthKey(p.paid_at);
      incomeByMonth.set(k, (incomeByMonth.get(k) ?? 0) + Number(p.amount ?? 0));
    }
    for (const e of expenses) {
      const k = monthKey(e.spent_at);
      expenseByMonth.set(k, (expenseByMonth.get(k) ?? 0) + Number(e.amount ?? 0));
    }

    // Serie mensual combinada: la columna vertebral son los meses de la función,
    // más cualquier mes con pagos/gastos.
    const apptByMonth = new Map(appt.monthly.map((m) => [m.month, m]));
    const monthSet = new Set<string>([
      ...apptByMonth.keys(),
      ...incomeByMonth.keys(),
      ...expenseByMonth.keys()
    ]);
    const monthly: MonthlyPoint[] = Array.from(monthSet)
      .sort()
      .map((m) => {
        const income = incomeByMonth.get(m) ?? 0;
        const exp = expenseByMonth.get(m) ?? 0;
        const a = apptByMonth.get(m);
        return {
          month: m,
          income,
          expenses: exp,
          net: income - exp,
          patients: a?.patients ?? 0,
          sessions: a?.sessions ?? 0,
          newPatients: a?.newPatients ?? 0,
          valoraciones: a?.valoraciones ?? 0
        };
      });

    // Periodo: mes en curso
    const curIncome = payments
      .filter((p) => monthKey(p.paid_at) === curMonthKey)
      .reduce((a, p) => a + Number(p.amount ?? 0), 0);
    const curExpense = expenses
      .filter((e) => monthKey(e.spent_at) === curMonthKey)
      .reduce((a, e) => a + Number(e.amount ?? 0), 0);
    const currentMonth: PeriodSummary = {
      income: curIncome,
      expenses: curExpense,
      net: curIncome - curExpense,
      patients: appt.currentMonth?.patients ?? 0,
      sessions: appt.currentMonth?.sessions ?? 0,
      valoraciones: appt.currentMonth?.valoraciones ?? 0
    };

    // Periodo: últimos 30 días
    const d30Income = payments
      .filter((p) => new Date(p.paid_at) >= since30)
      .reduce((a, p) => a + Number(p.amount ?? 0), 0);
    const d30Expense = expenses
      .filter((e) => new Date(e.spent_at) >= since30)
      .reduce((a, e) => a + Number(e.amount ?? 0), 0);
    const last30d: PeriodSummary = {
      income: d30Income,
      expenses: d30Expense,
      net: d30Income - d30Expense,
      patients: appt.last30d?.patients ?? 0,
      sessions: appt.last30d?.sessions ?? 0,
      valoraciones: appt.last30d?.valoraciones ?? 0
    };

    // Caja (todo el tiempo) por método = cobros a pacientes + ajustes manuales.
    // Los movimientos manuales pueden ser negativos (salidas de caja).
    // Transferencia se suma al bucket de Tarjeta (ambos son pagos electrónicos;
    // la clínica solo necesita ver Efectivo vs. Tarjeta/Transferencia).
    const cajaByMethod: Record<string, number> = {};
    let cajaTotal = 0;
    for (const p of payments) {
      const amt = Number(p.amount ?? 0);
      cajaTotal += amt;
      const m = p.method === 'transferencia' ? 'tarjeta' : (p.method ?? 'otro');
      cajaByMethod[m] = (cajaByMethod[m] ?? 0) + amt;
    }
    for (const mv of cajaMovements) {
      const amt = Number(mv.amount ?? 0);
      cajaTotal += amt;
      const m = mv.method === 'transferencia' ? 'tarjeta' : (mv.method ?? 'efectivo');
      cajaByMethod[m] = (cajaByMethod[m] ?? 0) + amt;
    }

    // Crecimiento del mes en curso vs mes anterior
    const curM = monthly.find((m) => m.month === curMonthKey);
    const prevM = monthly.find((m) => m.month === prevMonthKey);
    const pct = (cur: number, prev: number): number | null =>
      prev > 0 ? ((cur - prev) / prev) * 100 : null;
    const growth = {
      income: pct(curM?.income ?? 0, prevM?.income ?? 0),
      patients: pct(curM?.patients ?? 0, prevM?.patients ?? 0)
    };

    // Top pacientes por ingreso (todo el tiempo)
    const paidByPatient = new Map<string, number>();
    for (const p of payments)
      paidByPatient.set(
        p.patient_id,
        (paidByPatient.get(p.patient_id) ?? 0) + Number(p.amount ?? 0)
      );
    const topPatients: TopPatientRow[] = Array.from(paidByPatient.entries())
      .map(([patientId, paid]) => ({
        patientId,
        fullName: nameById.get(patientId) ?? 'Paciente',
        paid
      }))
      .sort((a, b) => b.paid - a.paid)
      .slice(0, 8);

    // Gastos por categoría
    const byCat = new Map<string, number>();
    for (const e of expenses)
      byCat.set(
        e.category ?? 'otro',
        (byCat.get(e.category ?? 'otro') ?? 0) + Number(e.amount ?? 0)
      );
    const expensesByCategory: CategoryRow[] = Array.from(byCat.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    return {
      currentMonth,
      last30d,
      monthly,
      caja: { total: cajaTotal, byMethod: cajaByMethod },
      growth,
      topPatients,
      expensesByCategory
    };
  }
};
