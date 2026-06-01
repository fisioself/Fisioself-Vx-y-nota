-- Recalcula finance_appt_stats usando la zona horaria de CDMX (America/Mexico_City)
-- en lugar de UTC. La base corre en UTC, así que sin esta conversión el "mes en
-- curso" y los cortes mensuales se desfasan hasta 6 h (p. ej. a las 23:46 CDMX del
-- 31-may la base ya cree que es junio).
--
-- ts_local = starts_at AT TIME ZONE 'America/Mexico_City' → hora de pared en CDMX.
-- now_local = now()   AT TIME ZONE 'America/Mexico_City' → "ahora" en CDMX.
-- Todos los date_trunc('month', ...) y comparaciones usan estos valores locales.
--
-- Mapa de colores (sin cambios):
--   Valoración: 9 (morado), 1 (lavanda).  Excluidos (cortesía/evento): 8, 2, 10.
--   Sesión cobrada: el resto (sin color, 7, 11, 4, 5, 6).
CREATE OR REPLACE FUNCTION public.finance_appt_stats(p_months_back int DEFAULT 12)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH params AS (
    SELECT (now() AT TIME ZONE 'America/Mexico_City') AS now_local
  ),
  -- Citas que cuentan, con su hora de pared en CDMX.
  base AS (
    SELECT
      patient_id,
      (starts_at AT TIME ZONE 'America/Mexico_City')   AS ts_local,
      (coalesce(color_id, '') IN ('9','1'))            AS is_val
    FROM public.appointments
    WHERE patient_id IS NOT NULL
      AND coalesce(color_id, 'x') NOT IN ('8','2','10')
  ),
  -- Primera cita de cada paciente y si esa primera fue valoración.
  first_appt AS (
    SELECT DISTINCT ON (patient_id)
           patient_id,
           ts_local AS first_at,
           is_val   AS first_is_val
    FROM base
    ORDER BY patient_id, ts_local
  ),
  -- Nuevos: su primera cita fue valoración y además tomaron una sesión cobrada.
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
      count(DISTINCT patient_id)::int AS patients,
      count(*)::int                   AS sessions
    FROM base, params
    WHERE ts_local >= date_trunc('month', now_local)
                      - make_interval(months => greatest(p_months_back - 1, 0))
      AND ts_local <  date_trunc('month', now_local) + interval '1 month'
    GROUP BY 1
  ),
  cur AS (
    SELECT
      count(DISTINCT patient_id)::int AS patients,
      count(*)::int                   AS sessions
    FROM base, params
    WHERE ts_local >= date_trunc('month', now_local)
      AND ts_local <  date_trunc('month', now_local) + interval '1 month'
  ),
  d30 AS (
    SELECT
      count(DISTINCT patient_id)::int AS patients,
      count(*)::int                   AS sessions
    FROM base, params
    WHERE ts_local >= now_local - interval '30 days'
      AND ts_local <  now_local + interval '1 day'
  ),
  tot AS (
    SELECT count(*)::int AS sessions FROM base
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
