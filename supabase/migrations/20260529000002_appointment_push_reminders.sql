-- Appointment push reminders (30 minutes before start_at)
--
-- Adds:
--   1. reminder_30min_sent_at column on appointments (prevents double-send)
--   2. push_reminder_secret in integration_config (shared secret for x-push-secret auth)
--   3. notify_appointment_reminders() — reads upcoming appointments, calls send-push via pg_net
--   4. pg_cron job every minute

-- Step 1: Track which appointments already had the reminder sent
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_30min_sent_at TIMESTAMPTZ;

-- Step 2: Shared secret for authenticating DB → Edge Function calls
INSERT INTO public.integration_config (key, value)
VALUES ('push_reminder_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- Step 3: The notification function
CREATE OR REPLACE FUNCTION public.notify_appointment_reminders()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_secret text;
  v_url    text := 'https://ncyyjrasfzzwmfbbtlsh.supabase.co/functions/v1/send-push';
  v_appt   RECORD;
BEGIN
  SELECT value INTO v_secret
  FROM public.integration_config
  WHERE key = 'push_reminder_secret';

  IF v_secret IS NULL THEN
    RETURN;
  END IF;

  FOR v_appt IN
    SELECT
      a.id,
      a.title,
      a.starts_at,
      t.user_id AS therapist_user_id
    FROM public.appointments  a
    JOIN public.therapists    t ON t.id = a.therapist_id
    WHERE
      a.starts_at BETWEEN (NOW() + INTERVAL '28 minutes') AND (NOW() + INTERVAL '32 minutes')
      AND a.status        NOT IN ('cancelled', 'no_show')
      AND a.reminder_30min_sent_at IS NULL
      AND t.user_id  IS NOT NULL
      AND t.active   = true
  LOOP
    -- Mark first to prevent double-send even if http_post fails
    UPDATE public.appointments
    SET reminder_30min_sent_at = NOW()
    WHERE id = v_appt.id;

    PERFORM net.http_post(
      url     := v_url,
      body    := jsonb_build_object(
                   'user_ids', jsonb_build_array(v_appt.therapist_user_id::text),
                   'title',    'Cita en 30 minutos',
                   'body',     v_appt.title,
                   'url',      '/agenda'
                 ),
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'x-push-secret', v_secret
                 ),
      timeout_milliseconds := 10000
    );
  END LOOP;
END;
$$;

-- Step 4: pg_cron job — every minute
SELECT cron.schedule(
  'appointment-reminders-30min',
  '* * * * *',
  'SELECT public.notify_appointment_reminders();'
);
