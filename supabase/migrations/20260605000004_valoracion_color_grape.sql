-- Las valoraciones NUEVAS pasan a usar el color morado real de Google:
-- '3' = Grape (#8e24aa). Antes la app usaba '9' = Blueberry, que en Google se ve
-- AZUL, no morado. Las valoraciones históricas ('9' y '1') se siguen contando.
--
-- Esta migración alinea las DOS funciones de conteo (única fuente de verdad) para
-- que el conjunto de "valoración" sea color IN ('9','1','3') en todos lados:
--   * finance_appt_stats     → dashboard + Finanzas
--   * monthly_finance_report → reporte mensual por correo
-- Si no se actualizan, las valoraciones nuevas (morado '3') se contarían como
-- sesiones y el conteo dejaría de cuadrar.

-- 1) finance_appt_stats: valoración = color IN ('9','1','3').
CREATE OR REPLACE FUNCTION public.finance_appt_stats(p_months_back int DEFAULT 12)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH params AS (
    SELECT (now() AT TIME ZONE 'America/Mexico_City') AS now_local
  ),
  base AS (
    SELECT
      patient_id,
      (starts_at AT TIME ZONE 'America/Mexico_City')   AS ts_local,
      (coalesce(color_id, '') IN ('9','1','3'))        AS is_val
    FROM public.appointments
    WHERE patient_id IS NOT NULL
      AND status <> 'cancelled'
      AND coalesce(color_id, 'x') NOT IN ('8','2','10')
  ),
  first_appt AS (
    SELECT DISTINCT ON (patient_id)
           patient_id,
           ts_local AS first_at,
           is_val   AS first_is_val
    FROM base
    ORDER BY patient_id, ts_local
  ),
  conv AS (
    SELECT f.patient_id,
           to_char(date_trunc('month', f.first_at), 'YYYY-MM') AS month
    FROM first_appt f
    WHERE f.first_is_val
      AND EXISTS (SELECT 1 FROM base s WHERE s.patient_id = f.patient_id AND NOT s.is_val)
  ),
  new_by_month AS (
    SELECT month, count(*)::int AS new_patients
    FROM conv
    GROUP BY month
  ),
  val_by_month AS (
    SELECT to_char(date_trunc('month', ts_local), 'YYYY-MM') AS month,
           count(*)::int AS valoraciones
    FROM base
    WHERE is_val
    GROUP BY 1
  ),
  monthly AS (
    SELECT
      to_char(date_trunc('month', ts_local), 'YYYY-MM') AS month,
      count(DISTINCT patient_id)::int          AS patients,
      count(*) FILTER (WHERE NOT is_val)::int  AS sessions
    FROM base, params
    WHERE ts_local >= date_trunc('month', now_local)
                      - make_interval(months => greatest(p_months_back - 1, 0))
      AND ts_local <  date_trunc('month', now_local) + interval '1 month'
    GROUP BY 1
  ),
  cur AS (
    SELECT
      count(DISTINCT patient_id)::int          AS patients,
      count(*) FILTER (WHERE NOT is_val)::int  AS sessions,
      count(*) FILTER (WHERE is_val)::int      AS valoraciones
    FROM base, params
    WHERE ts_local >= date_trunc('month', now_local)
      AND ts_local <  date_trunc('month', now_local) + interval '1 month'
  ),
  d30 AS (
    SELECT
      count(DISTINCT patient_id)::int          AS patients,
      count(*) FILTER (WHERE NOT is_val)::int  AS sessions,
      count(*) FILTER (WHERE is_val)::int      AS valoraciones
    FROM base, params
    WHERE ts_local >= now_local - interval '30 days'
      AND ts_local <  now_local + interval '1 day'
  ),
  tot AS (
    SELECT count(*) FILTER (WHERE NOT is_val)::int AS sessions FROM base
  )
  SELECT jsonb_build_object(
    'monthly',       coalesce(
                       (SELECT jsonb_agg(
                                 jsonb_build_object(
                                   'month',        m.month,
                                   'patients',     m.patients,
                                   'sessions',     m.sessions,
                                   'newPatients',  coalesce(n.new_patients, 0),
                                   'valoraciones', coalesce(v.valoraciones, 0)
                                 ) ORDER BY m.month
                               )
                        FROM monthly m
                        LEFT JOIN new_by_month n ON n.month = m.month
                        LEFT JOIN val_by_month v ON v.month = m.month),
                       '[]'::jsonb
                     ),
    'currentMonth',  (SELECT jsonb_build_object(
                               'patients',     patients,
                               'sessions',     sessions,
                               'valoraciones', valoraciones
                             ) FROM cur),
    'last30d',       (SELECT jsonb_build_object(
                               'patients',     patients,
                               'sessions',     sessions,
                               'valoraciones', valoraciones
                             ) FROM d30),
    'totalSessions', (SELECT sessions FROM tot)
  );
$$;

GRANT EXECUTE ON FUNCTION public.finance_appt_stats(int) TO authenticated;

-- 2) monthly_finance_report: valoración = color IN ('9','1','3').
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
      (coalesce(a.color_id, '') IN ('9','1','3')) AS is_val
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
