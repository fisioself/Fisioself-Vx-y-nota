-- Función agregadora de estadísticas de citas para el panel de Finanzas.
-- Evita traer todas las filas al frontend; agrega en DB y retorna JSONB.
--
-- Mapa de colores de Google (confirmado contra el calendario real):
--   Valoración (primera visita): color_id 9 (morado) y 1 (lavanda).
--   No se cobran / se excluyen:   color_id 8 (gris, cortesías), 2 (verde salvia)
--                                 y 10 (verde albahaca, eventos/notas).
--   Sesión cobrada (todo lo demás): sin color, 7 (azul claro), 11 (rojo),
--                                 4 (rosa, dermatofuncional), 5 (descarga),
--                                 6 (domicilio).
--
-- "valoraciones" por mes = nº de citas valoración (incluye re-valoraciones).
-- "newPatients"  por mes = pacientes nuevos: su PRIMERA cita fue valoración
--   y además tomaron al menos una sesión cobrada ("se quedaron").
--
-- Nota SQL: color_id IN (...) devuelve NULL para citas sin color, por eso se
-- usa coalesce(color_id,'') para que la prueba sea TRUE/FALSE y nunca NULL.
CREATE OR REPLACE FUNCTION public.finance_appt_stats(p_months_back int DEFAULT 12)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  -- Citas que cuentan (excluye cortesías/verde/eventos sin cobro).
  WITH base AS (
    SELECT
      patient_id,
      starts_at,
      (coalesce(color_id, '') IN ('9','1')) AS is_val
    FROM public.appointments
    WHERE patient_id IS NOT NULL
      AND coalesce(color_id, 'x') NOT IN ('8','2','10')
  ),
  -- Primera cita de cada paciente y si esa primera fue valoración.
  first_appt AS (
    SELECT DISTINCT ON (patient_id)
           patient_id,
           starts_at AS first_at,
           is_val    AS first_is_val
    FROM base
    ORDER BY patient_id, starts_at
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
    SELECT to_char(date_trunc('month', starts_at), 'YYYY-MM') AS month,
           count(*)::int AS valoraciones
    FROM base
    WHERE is_val
    GROUP BY 1
  ),
  monthly AS (
    SELECT
      to_char(date_trunc('month', starts_at), 'YYYY-MM') AS month,
      count(DISTINCT patient_id)::int AS patients,
      count(*)::int                   AS sessions
    FROM base
    WHERE starts_at >= date_trunc('month', now())
                       - make_interval(months => greatest(p_months_back - 1, 0))
      AND starts_at <  date_trunc('month', now()) + interval '1 month'
    GROUP BY 1
  ),
  cur AS (
    SELECT
      count(DISTINCT patient_id)::int AS patients,
      count(*)::int                   AS sessions
    FROM base
    WHERE starts_at >= date_trunc('month', now())
      AND starts_at <  date_trunc('month', now()) + interval '1 month'
  ),
  d30 AS (
    SELECT
      count(DISTINCT patient_id)::int AS patients,
      count(*)::int                   AS sessions
    FROM base
    WHERE starts_at >= now() - interval '30 days'
      AND starts_at <  now() + interval '1 day'
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
