-- Revoke EXECUTE on SECURITY DEFINER helper functions from public/anon roles.
-- These helpers are used exclusively inside RLS policies and should only be
-- callable by authenticated users and service_role, never anonymously.
--
-- Already applied to production on 2026-05-29; this file exists for versioning
-- and reproducibility only (supabase db push / branch reset).
--
-- Warnings 0028 (anon can execute security-definer function) → CLOSED.
-- Warnings 0029 (authenticated can execute) → ACCEPTED: these functions are
-- the mechanism RLS uses to enforce tenant isolation and role checks. Revoking
-- authenticated would break every policy that calls them. They are not
-- exploitable because PostgREST does not expose them as RPC endpoints (no
-- public HTTP surface), and the functions themselves rely on auth.uid() so a
-- caller gains nothing beyond what their own session already permits.

REVOKE EXECUTE ON FUNCTION public.can_access_clinic(uuid)       FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.can_write_clinic(uuid)        FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.check_ai_rate_limit(uuid, integer, integer) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.current_profile_role()        FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.default_clinic_id()           FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_active_clinical_user()     FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin()                    FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_therapist()       FROM public, anon;

-- Preserve access for the roles that legitimately need it.
GRANT EXECUTE ON FUNCTION public.can_access_clinic(uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_clinic(uuid)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_profile_role()        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.default_clinic_id()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_clinical_user()     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_therapist()       TO authenticated, service_role;
