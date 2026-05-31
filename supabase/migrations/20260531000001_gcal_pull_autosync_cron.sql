-- Importación automática desde Google Calendar hacia la app (pull).
--
-- Antes la importación solo corría al abrir la app (sincronización on-mount con
-- cooldown de 3 min). Esto la hace verdaderamente automática: un cron cada 15 min
-- invoca la Edge Function google-calendar-fetch (v10) con el secret del cron.
--
-- google-calendar-fetch v10:
--   • verify_jwt = false; acepta el JWT del usuario (flujo app) O el header
--     x-sync-secret == integration_config.gcal_autosync_secret (flujo cron).
--   • En modo cron procesa todas las conexiones de Google (calendar_connections).
--   • Crea/agrupa pacientes por nombre normalizado (misma persona = misma ficha,
--     sin "#N" ni teléfono) y mapea color → session_type:
--       3=Valoración · 5=Descarga muscular · 4/6=Terapia a domicilio · 1/7/9=Sesión clínica
--   • Inserta citas con sync_status='synced', evitando el trigger appointments_autosync
--     (que ignora INSERTs con sync_status='synced'), por lo que no hay bucle de sync.

CREATE OR REPLACE FUNCTION public.pull_google_calendar()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_secret text;
  v_url    text := 'https://ncyyjrasfzzwmfbbtlsh.supabase.co/functions/v1/google-calendar-fetch';
BEGIN
  SELECT value INTO v_secret
  FROM public.integration_config
  WHERE key = 'gcal_autosync_secret';

  IF v_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-sync-secret', v_secret
               ),
    timeout_milliseconds := 120000
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pull_google_calendar() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('pull-google-calendar-15min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pull-google-calendar-15min');

SELECT cron.schedule(
  'pull-google-calendar-15min',
  '*/15 * * * *',
  $$SELECT public.pull_google_calendar();$$
);
