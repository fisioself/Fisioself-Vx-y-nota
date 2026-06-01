-- Función agregadora de estadísticas de citas para el panel de Finanzas.
-- Evita traer todas las filas al frontend; agrega en DB y retorna JSONB.
--
-- Reglas de negocio (confirmadas contra el calendario real):
--   * Valoración (primera visita)  = color_id = '9'  (morado/Blueberry en Google).
--     La duración varía (normalmente 30 min, a veces 60), por eso el color manda.
--   * Sesión normal / tratamiento  = cualquier cita que NO sea valoración.
--   * Paciente nuevo (convertido)  = tuvo una valoración Y además al menos una
--     sesión normal -> "se quedó". Se cuenta en el mes de su valoración.
CREATE OR REPLACE FUNCTION public.finance_appt_stats(p_months_back int DEFAULT 12)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH a AS (
    SELECT
      patient_id,
      starts_at,
      (color_id = '9')             AS is_val,
      (color_id IS DISTINCT FROM '9') AS is_sesion
    FROM public.appointments
    WHERE patient_id IS NOT NULL
  ),
  -- Primera valoración (morada) de cada paciente.
  val AS (
    SELECT patient_id, min(starts_at) AS first_val
    FROM a
    WHERE is_val
    GROUP BY patient_id
  ),
  -- Convertidos: valorados que además tienen una sesión normal.
  conv AS (
    SELECT v.patient_id,
           to_char(date_trunc('month', v.first_val), 'YYYY-MM') AS month
    FROM val v
    WHERE EXISTS (SELECT 1 FROM a s WHERE s.patient_id = v.patient_id AND s.is_sesion)
  ),
  new_by_month AS (
    SELECT month, count(*)::int AS new_patients
    FROM conv
    GROUP BY month
  ),
  val_by_month AS (
    SELECT to_char(date_trunc('month', starts_at), 'YYYY-MM') AS month,
           count(*)::int AS valoraciones
    FROM a
    WHERE is_val
    GROUP BY 1
  ),
  monthly AS (
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
