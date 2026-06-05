-- Alinea el conteo de sesiones/valoraciones del reporte mensual con la regla
-- canónica de finance_appt_stats (única fuente de verdad):
--   * base: status <> 'cancelled', patient_id NOT NULL, color NOT IN (8,2,10) [cortesías fuera]
--   * valoración = color IN ('9','1')
--   * sesión     = base AND NOT valoración
--   * pacientes  = distinct patient_id en base
-- Antes el reporte contaba TODAS las citas como "sessions" (incluyendo
-- valoraciones y cortesías) y valoraciones solo color '9', lo que no cuadraba
-- con el dashboard ni con Finanzas.

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
  ),
  appts AS (
    SELECT
      a.patient_id,
      (coalesce(a.color_id, '') IN ('9','1')) AS is_val
    FROM public.appointments a, bounds
    WHERE a.patient_id IS NOT NULL
      AND a.status <> 'cancelled'
      AND coalesce(a.color_id, 'x') NOT IN ('8','2','10')
      AND (a.starts_at AT TIME ZONE 'America/Mexico_City')::date >= month_start
      AND (a.starts_at AT TIME ZONE 'America/Mexico_City')::date <  month_end
  )
  SELECT jsonb_build_object(
    'month', to_char((SELECT month_start FROM bounds), 'YYYY-MM'),
    'income', COALESCE((SELECT SUM(amount) FROM public.payments, bounds
      WHERE paid_at >= month_start AND paid_at < month_end), 0),
    'expenses', COALESCE((SELECT SUM(amount) FROM public.expenses, bounds
      WHERE spent_at >= month_start AND spent_at < month_end), 0),
    'sessions', (SELECT COUNT(*) FILTER (WHERE NOT is_val) FROM appts),
    'patients', (SELECT COUNT(DISTINCT patient_id) FROM appts),
    'valoraciones', (SELECT COUNT(*) FILTER (WHERE is_val) FROM appts),
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
