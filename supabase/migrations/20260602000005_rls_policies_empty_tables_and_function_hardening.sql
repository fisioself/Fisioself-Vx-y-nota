-- Advisor 0008_rls_enabled_no_policy: three tables had RLS enabled but no policies.
-- Advisor 0029: check_ai_rate_limit was callable by authenticated with arbitrary user_id.

-- ============================================================
-- PART 1: RLS policies for previously-empty tables
-- ============================================================
-- calendar_connections: stores per-user OAuth tokens. Users can read/remove
-- their own connection; writes go through edge functions (service_role).
CREATE POLICY "Users read own calendar connection" ON public.calendar_connections
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users delete own calendar connection" ON public.calendar_connections
  FOR DELETE USING (user_id = (SELECT auth.uid()));

-- ai_rate_limits: only written by check_ai_rate_limit() SECURITY DEFINER.
-- Admins can SELECT for debugging; no other client access needed.
CREATE POLICY "Admins read ai rate limits" ON public.ai_rate_limits
  FOR SELECT USING (is_admin());

-- integration_config: server-side key/value config, no user_id column.
-- Edge functions use service_role; no authenticated user needs direct access.
CREATE POLICY "Admins read integration config" ON public.integration_config
  FOR SELECT USING (is_admin());

-- ============================================================
-- PART 2: Harden check_ai_rate_limit
-- ============================================================
-- This function takes a target_user_id parameter. Any authenticated user calling
-- it with another user's ID could increment that user's rate counter. Since only
-- edge functions (service_role) call it, revoke direct RPC access.
REVOKE EXECUTE ON FUNCTION public.check_ai_rate_limit(uuid, integer, integer)
  FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_ai_rate_limit(uuid, integer, integer)
  TO service_role;
