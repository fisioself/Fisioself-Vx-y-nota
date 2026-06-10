-- Retención automática del audit_log.
--
-- En 3 semanas el audit_log llegó a 207k filas / 407 MB (86% del límite del plan
-- Free) por el ruido de 'appointments.updated' del sync con Google Calendar. Tras
-- limpiar ese ruido, se añade una poda automática para que la tabla no vuelva a
-- crecer sin control: se conservan 365 días de auditoría y se borra lo más viejo.

CREATE OR REPLACE FUNCTION public.prune_audit_log()
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  DELETE FROM public.audit_log
  WHERE created_at < now() - interval '365 days';
$$;

REVOKE ALL ON FUNCTION public.prune_audit_log() FROM PUBLIC, anon, authenticated;

-- Programar: cada domingo 03:00 UTC. Reprograma si ya existe.
SELECT cron.unschedule('prune-audit-log')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-audit-log');

SELECT cron.schedule(
  'prune-audit-log',
  '0 3 * * 0',
  'SELECT public.prune_audit_log();'
);
