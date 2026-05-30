-- Cerrar vector: notify_appointment_reminders no debe ser invocable por anon vía RPC.
-- El cron (pg_cron) la ejecuta como superuser internamente — no necesita permisos de anon/public.
REVOKE EXECUTE ON FUNCTION public.notify_appointment_reminders() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_appointment_reminders() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_appointment_reminders() FROM authenticated;
