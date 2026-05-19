-- Role-aware RLS hardening for FISIOSELF App Notas VX
-- Run after 001_initial_schema.sql.

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and active = true
  limit 1
$$;

create or replace function public.is_active_clinical_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and role in ('admin', 'therapist', 'assistant')
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_profile_role() = 'admin'
$$;

create or replace function public.is_admin_or_therapist()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_profile_role() in ('admin', 'therapist')
$$;

-- Replace broad first-pass policies with role-aware policies.
drop policy if exists "therapists authenticated insert" on therapists;
drop policy if exists "therapists authenticated update" on therapists;
drop policy if exists "patients authenticated read" on patients;
drop policy if exists "patients authenticated insert" on patients;
drop policy if exists "patients authenticated update" on patients;
drop policy if exists "evaluations authenticated read" on evaluations;
drop policy if exists "evaluations authenticated insert" on evaluations;
drop policy if exists "evaluations authenticated update" on evaluations;
drop policy if exists "session notes authenticated read" on session_notes;
drop policy if exists "session notes authenticated insert" on session_notes;
drop policy if exists "session notes authenticated update" on session_notes;
drop policy if exists "follow ups authenticated read" on follow_ups;
drop policy if exists "follow ups authenticated insert" on follow_ups;
drop policy if exists "follow ups authenticated update" on follow_ups;
drop policy if exists "ai consults authenticated read" on ai_consults;
drop policy if exists "ai consults authenticated insert" on ai_consults;
drop policy if exists "ai consults authenticated update" on ai_consults;
drop policy if exists "audit authenticated read" on audit_log;
drop policy if exists "audit authenticated insert" on audit_log;

create policy "therapists admin insert" on therapists
  for insert to authenticated
  with check (public.is_admin());

create policy "therapists admin update" on therapists
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "patients clinical read" on patients
  for select to authenticated
  using (public.is_active_clinical_user());

create policy "patients clinician insert" on patients
  for insert to authenticated
  with check (public.is_admin_or_therapist() and created_by = auth.uid());

create policy "patients clinician update" on patients
  for update to authenticated
  using (public.is_admin_or_therapist())
  with check (public.is_admin_or_therapist());

create policy "evaluations clinical read" on evaluations
  for select to authenticated
  using (public.is_active_clinical_user());

create policy "evaluations clinician insert" on evaluations
  for insert to authenticated
  with check (public.is_admin_or_therapist() and created_by = auth.uid());

create policy "evaluations clinician update" on evaluations
  for update to authenticated
  using (public.is_admin_or_therapist())
  with check (public.is_admin_or_therapist());

create policy "session notes clinical read" on session_notes
  for select to authenticated
  using (public.is_active_clinical_user());

create policy "session notes clinician insert" on session_notes
  for insert to authenticated
  with check (public.is_admin_or_therapist() and created_by = auth.uid());

create policy "session notes clinician update" on session_notes
  for update to authenticated
  using (public.is_admin_or_therapist())
  with check (public.is_admin_or_therapist());

create policy "follow ups clinical read" on follow_ups
  for select to authenticated
  using (public.is_active_clinical_user());

create policy "follow ups clinician insert" on follow_ups
  for insert to authenticated
  with check (public.is_admin_or_therapist() and created_by = auth.uid());

create policy "follow ups clinician update" on follow_ups
  for update to authenticated
  using (public.is_admin_or_therapist())
  with check (public.is_admin_or_therapist());

create policy "ai consults clinical read" on ai_consults
  for select to authenticated
  using (public.is_active_clinical_user());

create policy "ai consults clinician insert" on ai_consults
  for insert to authenticated
  with check (public.is_admin_or_therapist() and created_by = auth.uid());

create policy "ai consults clinician update" on ai_consults
  for update to authenticated
  using (public.is_admin_or_therapist())
  with check (public.is_admin_or_therapist());

create policy "audit admin read" on audit_log
  for select to authenticated
  using (public.is_admin());

create policy "audit clinical insert" on audit_log
  for insert to authenticated
  with check (public.is_active_clinical_user() and actor_id = auth.uid());

-- No delete policies by design. Use status fields for logical deactivation.
