import { assertSupabase } from '../lib/supabaseClient';
import type { Tables, TablesInsert } from '../types/supabase';

export type Package = Tables<'packages'>;
export type PatientPackage = Tables<'patient_packages'>;
export type Payment = Tables<'payments'>;
export type Expense = Tables<'expenses'>;

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
}

export interface ReceivableRow {
  patientId: string;
  fullName: string;
  billed: number;
  paid: number;
  balance: number;
}

export interface GlobalFinanceSummary {
  totalIncome: number;
  totalExpenses: number;
  net: number;
  totalBilled: number;
  pendingReceivables: number;
  monthly: MonthlyPoint[];
  receivables: ReceivableRow[];
  incomeByMethod: Record<string, number>;
}

const unwrap = <T>({ data, error }: { data: unknown; error: unknown }): T => {
  if (error) throw error;
  return data as T;
};

const sum = (rows: Array<{ amount?: number | null }>, key: 'amount' = 'amount'): number =>
  rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0);

const monthKey = (isoDate: string): string => isoDate.slice(0, 7); // 'YYYY-MM'

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

  async addPayment(input: {
    patientId: string;
    patientPackageId?: string | null;
    amount: number;
    method?: string;
    paidAt?: string;
    notes?: string;
  }): Promise<Payment> {
    const db = assertSupabase();
    const payload: TablesInsert<'payments'> = {
      patient_id: input.patientId,
      patient_package_id: input.patientPackageId ?? null,
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

  // ---------- Dashboard global ----------
  async getGlobalFinance(monthsBack = 12): Promise<GlobalFinanceSummary> {
    const db = assertSupabase();
    const since = new Date();
    since.setMonth(since.getMonth() - (monthsBack - 1));
    since.setDate(1);
    const sinceStr = since.toISOString().slice(0, 10);

    const [payRes, expRes, pkgRes, patRes] = await Promise.all([
      db.from('payments').select('amount, paid_at, patient_id, method').gte('paid_at', sinceStr),
      db.from('expenses').select('amount, spent_at').gte('spent_at', sinceStr),
      db.from('patient_packages').select('total_amount, patient_id'),
      db.from('patients').select('id, full_name')
    ]);
    const payments = unwrap<Array<{ amount: number; paid_at: string; patient_id: string; method: string }>>(payRes);
    const expenses = unwrap<Array<{ amount: number; spent_at: string }>>(expRes);
    const packages = unwrap<Array<{ total_amount: number; patient_id: string }>>(pkgRes);
    const patients = unwrap<Array<{ id: string; full_name: string }>>(patRes);

    // Serie mensual ingresos vs gastos
    const months: string[] = [];
    for (let i = 0; i < monthsBack; i += 1) {
      const d = new Date(since);
      d.setMonth(d.getMonth() + i);
      months.push(d.toISOString().slice(0, 7));
    }
    const incomeByMonth = new Map<string, number>();
    const expenseByMonth = new Map<string, number>();
    const incomeByMethod: Record<string, number> = {};
    for (const p of payments) {
      const k = monthKey(p.paid_at);
      incomeByMonth.set(k, (incomeByMonth.get(k) ?? 0) + Number(p.amount ?? 0));
      const m = p.method ?? 'otro';
      incomeByMethod[m] = (incomeByMethod[m] ?? 0) + Number(p.amount ?? 0);
    }
    for (const e of expenses) {
      const k = monthKey(e.spent_at);
      expenseByMonth.set(k, (expenseByMonth.get(k) ?? 0) + Number(e.amount ?? 0));
    }
    const monthly: MonthlyPoint[] = months.map((m) => ({
      month: m,
      income: incomeByMonth.get(m) ?? 0,
      expenses: expenseByMonth.get(m) ?? 0
    }));

    // Totales globales (todo el histórico de facturación vs pagos para por-cobrar)
    const allPaymentsRes = await db.from('payments').select('amount, patient_id');
    const allPayments =
      unwrap<Array<{ amount: number; patient_id: string }>>(allPaymentsRes);

    const totalIncome = monthly.reduce((a, m) => a + m.income, 0);
    const totalExpenses = monthly.reduce((a, m) => a + m.expenses, 0);

    const billedByPatient = new Map<string, number>();
    for (const p of packages)
      billedByPatient.set(p.patient_id, (billedByPatient.get(p.patient_id) ?? 0) + Number(p.total_amount ?? 0));
    const paidByPatient = new Map<string, number>();
    for (const p of allPayments)
      paidByPatient.set(p.patient_id, (paidByPatient.get(p.patient_id) ?? 0) + Number(p.amount ?? 0));

    const nameById = new Map(patients.map((p) => [p.id, p.full_name]));
    const totalBilled = Array.from(billedByPatient.values()).reduce((a, b) => a + b, 0);

    const receivables: ReceivableRow[] = [];
    for (const [pid, billed] of billedByPatient.entries()) {
      const paid = paidByPatient.get(pid) ?? 0;
      const balance = billed - paid;
      if (balance > 0.5) {
        receivables.push({
          patientId: pid,
          fullName: nameById.get(pid) ?? 'Paciente',
          billed,
          paid,
          balance
        });
      }
    }
    receivables.sort((a, b) => b.balance - a.balance);
    const pendingReceivables = receivables.reduce((a, r) => a + r.balance, 0);

    return {
      totalIncome,
      totalExpenses,
      net: totalIncome - totalExpenses,
      totalBilled,
      pendingReceivables,
      monthly,
      receivables,
      incomeByMethod
    };
  }
};
