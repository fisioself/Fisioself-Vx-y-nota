-- Función agregadora de estadísticas de citas para el panel de Finanzas.
-- Evita traer todas las filas al frontend; agrega en DB y retorna JSONB.
CREATE OR REPLACE FUNCTION public.finance_appt_stats(p_months_back int DEFAULT 12)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH monthly AS (
    SELECT
      to_char(date_trunc('month', starts_at), 'YYYY-MM') AS month,
      count(DISTINCT patient_id)::int AS patients,
      count(*)::int                   AS sessions
    FROM public.appointments
    WHERE starts_at >= date_trunc('month', now())
                       - make_interval(months => greatest(p_months_back - 1, 0))
      AND starts_at <  date_trunc('month', now()) + interval '1 month'
    GROUP BY 1
  ),
  cur AS (
    SELECT
      count(DISTINCT patient_id)::int AS patients,
      count(*)::int                   AS sessions
    FROM public.appointments
    WHERE starts_at >= date_trunc('month', now())
      AND starts_at <  date_trunc('month', now()) + interval '1 month'
  ),
  d30 AS (
    SELECT
      count(DISTINCT patient_id)::int AS patients,
      count(*)::int                   AS sessions
    FROM public.appointments
    WHERE starts_at >= now() - interval '30 days'
      AND starts_at <  now() + interval '1 day'
  ),
  tot AS (
    SELECT count(*)::int AS sessions FROM public.appointments
  )
  SELECT jsonb_build_object(
    'monthly',       coalesce(
                       (SELECT jsonb_agg(
                                 jsonb_build_object(
                                   'month',    month,
                                   'patients', patients,
                                   'sessions', sessions
                                 ) ORDER BY month
                               )
                        FROM monthly),
                       '[]'::jsonb
                     ),
    'currentMonth',  (SELECT jsonb_build_object(
                               'patients', patients,
                               'sessions', sessions
                             ) FROM cur),
    'last30d',       (SELECT jsonb_build_object(
                               'patients', patients,
                               'sessions', sessions
                             ) FROM d30),
    'totalSessions', (SELECT sessions FROM tot)
  );
$$;

GRANT EXECUTE ON FUNCTION public.finance_appt_stats(int) TO authenticated;
