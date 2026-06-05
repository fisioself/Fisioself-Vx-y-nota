-- Cron del reporte financiero mensual por correo.
--
-- El día 1 de cada mes (09:00 CDMX = 15:00 UTC) llama a la edge function
-- monthly-finance-report vía pg_net. La función calcula el mes anterior y lo
-- envía con Resend. Mismo patrón seguro que appointment_push_reminders:
-- el secreto compartido se genera en la BD (gen_random_bytes), NO se commitea.

-- 1) Secreto compartido DB → Edge Function (se autentica con x-report-secret)
INSERT INTO public.integration_config (key, value)
VALUES ('monthly_report_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- 2) Función que dispara el envío
CREATE OR REPLACE FUNCTION public.notify_monthly_finance_report()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_secret text;
  v_url    text := 'https://ncyyjrasfzzwmfbbtlsh.supabase.co/functions/v1/monthly-finance-report';
BEGIN
  SELECT value INTO v_secret
  FROM public.integration_config
  WHERE key = 'monthly_report_secret';

  IF v_secret IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
                 'Content-Type',    'application/json',
                 'x-report-secret', v_secret
               ),
    timeout_milliseconds := 20000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_monthly_finance_report() FROM PUBLIC, anon, authenticated;

-- 3) Programar: día 1 de cada mes, 15:00 UTC (09:00 CDMX). Reprograma si ya existe.
SELECT cron.unschedule('monthly-finance-report')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-finance-report');

SELECT cron.schedule(
  'monthly-finance-report',
  '0 15 1 * *',
  'SELECT public.notify_monthly_finance_report();'
);
