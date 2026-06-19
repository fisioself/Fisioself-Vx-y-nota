-- finance_money_stats: agrega del lado del servidor la parte "de dinero" del
-- dashboard global (lo que antes calculaba getGlobalFinance en el navegador
-- bajando TODOS los pagos, gastos, movimientos de caja y los 515 pacientes).
--
-- Motivación (auditoría): el cliente hacía `select *` sin límite sobre payments,
-- expenses, caja_movements y patients. Supabase corta a 1000 filas por defecto;
-- al crecer, los totales se truncaban en silencio (cifras de dinero erróneas).
-- Además enviaba al navegador todos los nombres de pacientes solo para el "top".
--
-- Reglas replicadas EXACTAMENTE de la versión JS (validadas por paridad):
--   * paid_at / spent_at / occurred_at son columnas `date` (día de calendario
--     CDMX ya escrito por la app), así que se usan tal cual, sin conversión TZ.
--   * Mes en curso / mes anterior / ventana 30 días se calculan en CDMX.
--   * monthly incluye TODO mes con algún pago o gasto (sin límite de meses; el
--     merge con finance_appt_stats lo hace el cliente).
--   * caja = pagos + ajustes manuales (transferencia se suma al bucket tarjeta;
--     método nulo de caja = efectivo), menos las comisiones de terminal
--     (expenses.category='comision' con payment_id) descontadas del bucket tarjeta.
--   * topPatients = 8 mayores por monto pagado, con su nombre.
--   * growthIncome = % del ingreso del mes en curso vs. el mes anterior
--     (null si el mes anterior fue 0, igual que en JS).
--
-- SECURITY INVOKER: respeta RLS del usuario que llama (misma visibilidad que
-- tenía el cliente). search_path fijado para evitar secuestro de resolución.
CREATE OR REPLACE FUNCTION public.finance_money_stats()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO ''
AS $$
  WITH params AS (
    SELECT
      (now() AT TIME ZONE 'America/Mexico_City')::date              AS today_cdmx,
      date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City'))::date AS month_start
  ),
  bounds AS (
    SELECT
      today_cdmx,
      month_start,
      (month_start + interval '1 month')::date AS next_month_start,
      (month_start - interval '1 month')::date AS prev_month_start,
      (today_cdmx - 30)                        AS since30
    FROM params
  ),
  -- Ingresos y gastos por mes (todos los meses con datos, sin límite).
  income_by_month AS (
    SELECT to_char(paid_at, 'YYYY-MM') AS month, sum(amount)::numeric AS income
    FROM public.payments
    GROUP BY 1
  ),
  expense_by_month AS (
    SELECT to_char(spent_at, 'YYYY-MM') AS month, sum(amount)::numeric AS expenses
    FROM public.expenses
    GROUP BY 1
  ),
  months AS (
    SELECT month FROM income_by_month
    UNION
    SELECT month FROM expense_by_month
  ),
  monthly AS (
    SELECT
      mo.month,
      round(coalesce(i.income, 0), 2)                          AS income,
      round(coalesce(e.expenses, 0), 2)                        AS expenses,
      round(coalesce(i.income, 0) - coalesce(e.expenses, 0), 2) AS net
    FROM months mo
    LEFT JOIN income_by_month i  ON i.month = mo.month
    LEFT JOIN expense_by_month e ON e.month = mo.month
  ),
  -- Periodo: mes en curso
  cur AS (
    SELECT
      coalesce((SELECT sum(amount) FROM public.payments, bounds
                WHERE paid_at >= month_start AND paid_at < next_month_start), 0)::numeric AS income,
      coalesce((SELECT sum(amount) FROM public.expenses, bounds
                WHERE spent_at >= month_start AND spent_at < next_month_start), 0)::numeric AS expenses
  ),
  -- Periodo: últimos 30 días (>= since30, sin tope superior, igual que JS)
  d30 AS (
    SELECT
      coalesce((SELECT sum(amount) FROM public.payments, bounds
                WHERE paid_at >= since30), 0)::numeric AS income,
      coalesce((SELECT sum(amount) FROM public.expenses, bounds
                WHERE spent_at >= since30), 0)::numeric AS expenses
  ),
  -- Crecimiento de ingreso: mes en curso vs mes anterior
  cur_month_income AS (
    SELECT coalesce(sum(amount), 0)::numeric AS v FROM public.payments, bounds
    WHERE paid_at >= month_start AND paid_at < next_month_start
  ),
  prev_month_income AS (
    SELECT coalesce(sum(amount), 0)::numeric AS v FROM public.payments, bounds
    WHERE paid_at >= prev_month_start AND paid_at < month_start
  ),
  -- Caja por método (transferencia -> tarjeta; nulo de caja -> efectivo)
  caja_pay AS (
    SELECT
      CASE WHEN method = 'transferencia' THEN 'tarjeta'
           ELSE coalesce(method, 'otro') END AS m,
      sum(amount)::numeric AS s
    FROM public.payments
    GROUP BY 1
  ),
  caja_mov AS (
    SELECT
      CASE WHEN method = 'transferencia' THEN 'tarjeta'
           ELSE coalesce(method, 'efectivo') END AS m,
      sum(amount)::numeric AS s
    FROM public.caja_movements
    GROUP BY 1
  ),
  -- Comisiones de terminal: se descuentan del bucket tarjeta y del total.
  comision AS (
    SELECT coalesce(sum(amount), 0)::numeric AS s
    FROM public.expenses
    WHERE payment_id IS NOT NULL AND category = 'comision'
  ),
  caja_combined AS (
    SELECT m, sum(s)::numeric AS s FROM (
      SELECT m, s FROM caja_pay
      UNION ALL
      SELECT m, s FROM caja_mov
      UNION ALL
      SELECT 'tarjeta'::text AS m, -(SELECT s FROM comision) AS s
    ) u
    GROUP BY m
  ),
  -- Top pacientes por monto pagado (con nombre, top 8)
  top_pat AS (
    SELECT
      p.patient_id,
      coalesce(pa.full_name, 'Paciente') AS full_name,
      sum(p.amount)::numeric AS paid
    FROM public.payments p
    LEFT JOIN public.patients pa ON pa.id = p.patient_id
    GROUP BY p.patient_id, pa.full_name
    ORDER BY paid DESC
    LIMIT 8
  ),
  -- Gastos por categoría
  exp_cat AS (
    SELECT coalesce(category, 'otro') AS category, sum(amount)::numeric AS amount
    FROM public.expenses
    GROUP BY 1
    ORDER BY amount DESC
  )
  SELECT jsonb_build_object(
    'monthly', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'month', month, 'income', income, 'expenses', expenses, 'net', net
      ) ORDER BY month) FROM monthly), '[]'::jsonb),
    'currentMonth', (SELECT jsonb_build_object(
        'income', income, 'expenses', expenses, 'net', income - expenses) FROM cur),
    'last30d', (SELECT jsonb_build_object(
        'income', income, 'expenses', expenses, 'net', income - expenses) FROM d30),
    'caja', jsonb_build_object(
        'total', coalesce((SELECT sum(s) FROM caja_combined), 0),
        'byMethod', coalesce((
          SELECT jsonb_object_agg(m, s) FROM caja_combined), '{}'::jsonb)),
    'growthIncome', (
      SELECT CASE WHEN (SELECT v FROM prev_month_income) > 0
        THEN (((SELECT v FROM cur_month_income) - (SELECT v FROM prev_month_income))
              / (SELECT v FROM prev_month_income)) * 100
        ELSE NULL END),
    'topPatients', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'patientId', patient_id, 'fullName', full_name, 'paid', paid)) FROM top_pat), '[]'::jsonb),
    'expensesByCategory', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'category', category, 'amount', amount)) FROM exp_cat), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.finance_money_stats() TO authenticated;
