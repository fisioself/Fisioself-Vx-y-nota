-- RPC del reporte financiero mensual (solo lectura, agregados).
--
-- Devuelve un JSON con las cifras del mes indicado por p_month_offset
-- (1 = mes anterior, 0 = mes en curso). NO incluye ningún dato personal del
-- paciente: solo totales. La usa la edge function monthly-finance-report.
--
-- Seguridad: SECURITY DEFINER para leer agregados sin depender de RLS, pero el
-- EXECUTE se revoca de anon/authenticated y solo se concede a service_role
-- (la edge function corre con service role). Así no aparece en el linter como
-- función SECURITY DEFINER ejecutable por usuarios firmados.

CREATE OR REPLACE FUNCTION public.monthly_finance_report(p_month_offset int DEFAULT 1)
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  WITH bounds AS (
    SELECT
      (date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City'))
        - (p_month_offset || ' month')::interval)::date AS month_start,
      (date_trunc('month', (now() AT TIME ZONE 'America/Mexico_City'))
        - ((p_month_offset - 1) || ' month')::interval)::date AS month_end
  )
  SELECT jsonb_build_object(
    'month', to_char((SELECT month_start FROM bounds), 'YYYY-MM'),
    'income', COALESCE((SELECT SUM(amount) FROM public.payments, bounds
      WHERE paid_at >= month_start AND paid_at < month_end), 0),
    'expenses', COALESCE((SELECT SUM(amount) FROM public.expenses, bounds
      WHERE spent_at >= month_start AND spent_at < month_end), 0),
    'sessions', (SELECT COUNT(*) FROM public.appointments, bounds
      WHERE (starts_at AT TIME ZONE 'America/Mexico_City')::date >= month_start
        AND (starts_at AT TIME ZONE 'America/Mexico_City')::date < month_end),
    'patients', (SELECT COUNT(DISTINCT patient_id) FROM public.appointments, bounds
      WHERE (starts_at AT TIME ZONE 'America/Mexico_City')::date >= month_start
        AND (starts_at AT TIME ZONE 'America/Mexico_City')::date < month_end),
    'valoraciones', (SELECT COUNT(*) FROM public.appointments, bounds
      WHERE color_id = '9'
        AND (starts_at AT TIME ZONE 'America/Mexico_City')::date >= month_start
        AND (starts_at AT TIME ZONE 'America/Mexico_City')::date < month_end),
    'income_by_method', COALESCE((
      SELECT jsonb_object_agg(method, s) FROM (
        SELECT method, SUM(amount) s FROM public.payments, bounds
        WHERE paid_at >= month_start AND paid_at < month_end
        GROUP BY method
      ) t), '{}'::jsonb),
    'expenses_by_category', COALESCE((
      SELECT jsonb_object_agg(category, s) FROM (
        SELECT category, SUM(amount) s FROM public.expenses, bounds
        WHERE spent_at >= month_start AND spent_at < month_end
        GROUP BY category
      ) t), '{}'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.monthly_finance_report(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.monthly_finance_report(int) TO service_role;
