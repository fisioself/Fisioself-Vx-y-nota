-- Add clinic-level tenancy while preserving the current single-clinic setup.
-- Run after 006_session_number_integrity.sql.

create table if not exists clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinic_memberships (
  clinic_id uuid not null references clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'therapist', 'assistant')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);

alter table clinics enable row level security;
alter table clinic_memberships enable row level security;

insert into clinics (name)
values ('FISIOSELF')
on conflict (name) do nothing;

create or replace function public.default_clinic_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id
  from public.clinics
  where active = true
  order by created_at asc
  limit 1
$$;

insert into clinic_memberships (clinic_id, user_id, role, active)
select public.default_clinic_id(), profiles.id, profiles.role, profiles.active
from profiles
where public.default_clinic_id() is not null
on conflict (clinic_id, user_id) do update
set role = excluded.role,
    active = excluded.active,
    updated_at = now();

alter table therapists add column if not exists clinic_id uuid references clinics(id);
alter table patients add column if not exists clinic_id uuid references clinics(id);

update therapists
set clinic_id = public.default_clinic_id()
where clinic_id is null;

update patients
set clinic_id = public.default_clinic_id()
where clinic_id is null;

alter table therapists alter column clinic_id set default public.default_clinic_id();
alter table patients alter column clinic_id set default public.default_clinic_id();
alter table therapists alter column clinic_id set not null;
alter table patients alter column clinic_id set not null;

create index if not exists clinic_memberships_user_id_idx on clinic_memberships(user_id);
create index if not exists therapists_clinic_id_idx on therapists(clinic_id);
create index if not exists patients_clinic_id_idx on patients(clinic_id);

create or replace function public.can_access_clinic(target_clinic_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_active_clinical_user()
    and exists (
      select 1
      from public.clinic_memberships
      where clinic_id = target_clinic_id
        and user_id = auth.uid()
        and active = true
    )
$$;

create or replace function public.can_write_clinic(target_clinic_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin_or_therapist()
    and exists (
      select 1
      from public.clinic_memberships
      where clinic_id = target_clinic_id
        and user_id = auth.uid()
        and active = true
        and role in ('admin', 'therapist')
    )
$$;

drop policy if exists "clinics member read" on clinics;
drop policy if exists "clinics admin insert" on clinics;
drop policy if exists "clinics admin update" on clinics;
drop policy if exists "clinic memberships own read" on clinic_memberships;
drop policy if exists "clinic memberships admin read" on clinic_memberships;
drop policy if exists "clinic memberships admin insert" on clinic_memberships;
drop policy if exists "clinic memberships admin update" on clinic_memberships;

create policy "clinics member read" on clinics
  for select to authenticated
  using (public.can_access_clinic(id));

create policy "clinics admin insert" on clinics
  for insert to authenticated
  with check (public.is_admin());

create policy "clinics admin update" on clinics
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "clinic memberships own read" on clinic_memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "clinic memberships admin insert" on clinic_memberships
  for insert to authenticated
  with check (public.is_admin());

create policy "clinic memberships admin update" on clinic_memberships
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "therapists authenticated read" on therapists;
drop policy if exists "therapists admin insert" on therapists;
drop policy if exists "therapists admin update" on therapists;
drop policy if exists "patients clinical read" on patients;
drop policy if exists "patients clinician insert" on patients;
drop policy if exists "patients clinician update" on patients;
drop policy if exists "evaluations clinical read" on evaluations;
drop policy if exists "evaluations clinician insert" on evaluations;
drop policy if exists "evaluations clinician update" on evaluations;
drop policy if exists "session notes clinical read" on session_notes;
drop policy if exists "session notes clinician insert" on session_notes;
drop policy if exists "session notes clinician update" on session_notes;
drop policy if exists "follow ups clinical read" on follow_ups;
drop policy if exists "follow ups clinician insert" on follow_ups;
drop policy if exists "follow ups clinician update" on follow_ups;
drop policy if exists "ai consults clinical read" on ai_consults;
drop policy if exists "ai consults clinician insert" on ai_consults;
drop policy if exists "ai consults clinician update" on ai_consults;
drop policy if exists "appointments clinical read" on appointments;
drop policy if exists "appointments clinician insert" on appointments;
drop policy if exists "appointments clinician update" on appointments;

create policy "therapists clinic read" on therapists
  for select to authenticated
  using (public.can_access_clinic(clinic_id));

create policy "therapists clinic admin insert" on therapists
  for insert to authenticated
  with check (public.is_admin() and public.can_access_clinic(clinic_id));

create policy "therapists clinic admin update" on therapists
  for update to authenticated
  using (public.is_admin() and public.can_access_clinic(clinic_id))
  with check (public.is_admin() and public.can_access_clinic(clinic_id));

create policy "patients clinic read" on patients
  for select to authenticated
  using (public.can_access_clinic(clinic_id));

create policy "patients clinic clinician insert" on patients
  for insert to authenticated
  with check (public.can_write_clinic(clinic_id) and created_by = auth.uid());

create policy "patients clinic clinician update" on patients
  for update to authenticated
  using (public.can_write_clinic(clinic_id))
  with check (public.can_write_clinic(clinic_id));

create policy "evaluations clinic read" on evaluations
  for select to authenticated
  using (
    exists (
      select 1 from patients
      where patients.id = evaluations.patient_id
        and public.can_access_clinic(patients.clinic_id)
    )
  );

create policy "evaluations clinic clinician insert" on evaluations
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from patients
      where patients.id = evaluations.patient_id
        and public.can_write_clinic(patients.clinic_id)
    )
  );

create policy "evaluations clinic clinician update" on evaluations
  for update to authenticated
  using (
    exists (
      select 1 from patients
      where patients.id = evaluations.patient_id
        and public.can_write_clinic(patients.clinic_id)
    )
  )
  with check (
    exists (
      select 1 from patients
      where patients.id = evaluations.patient_id
        and public.can_write_clinic(patients.clinic_id)
    )
  );

create policy "session notes clinic read" on session_notes
  for select to authenticated
  using (
    exists (
      select 1 from patients
      where patients.id = session_notes.patient_id
        and public.can_access_clinic(patients.clinic_id)
    )
  );

create policy "session notes clinic clinician insert" on session_notes
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from patients
      where patients.id = session_notes.patient_id
        and public.can_write_clinic(patients.clinic_id)
    )
  );

create policy "session notes clinic clinician update" on session_notes
  for update to authenticated
  using (
    exists (
      select 1 from patients
      where patients.id = session_notes.patient_id
        and public.can_write_clinic(patients.clinic_id)
    )
  )
  with check (
    exists (
      select 1 from patients
      where patients.id = session_notes.patient_id
        and public.can_write_clinic(patients.clinic_id)
    )
  );

create policy "follow ups clinic read" on follow_ups
  for select to authenticated
  using (
    exists (
      select 1 from patients
      where patients.id = follow_ups.patient_id
        and public.can_access_clinic(patients.clinic_id)
    )
  );

create policy "follow ups clinic clinician insert" on follow_ups
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from patients
      where patients.id = follow_ups.patient_id
        and public.can_write_clinic(patients.clinic_id)
    )
  );

create policy "follow ups clinic clinician update" on follow_ups
  for update to authenticated
  using (
    exists (
      select 1 from patients
      where patients.id = follow_ups.patient_id
        and public.can_write_clinic(patients.clinic_id)
    )
  )
  with check (
    exists (
      select 1 from patients
      where patients.id = follow_ups.patient_id
        and public.can_write_clinic(patients.clinic_id)
    )
  );

create policy "ai consults clinic read" on ai_consults
  for select to authenticated
  using (
    patient_id is not null
    and exists (
      select 1 from patients
      where patients.id = ai_consults.patient_id
        and public.can_access_clinic(patients.clinic_id)
    )
  );

create policy "ai consults clinic clinician insert" on ai_consults
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and patient_id is not null
    and exists (
      select 1 from patients
      where patients.id = ai_consults.patient_id
        and public.can_write_clinic(patients.clinic_id)
    )
  );

create policy "ai consults clinic clinician update" on ai_consults
  for update to authenticated
  using (
    patient_id is not null
    and exists (
      select 1 from patients
      where patients.id = ai_consults.patient_id
        and public.can_write_clinic(patients.clinic_id)
    )
  )
  with check (
    patient_id is not null
    and exists (
      select 1 from patients
      where patients.id = ai_consults.patient_id
        and public.can_write_clinic(patients.clinic_id)
    )
  );

create policy "appointments clinic read" on appointments
  for select to authenticated
  using (
    exists (
      select 1 from patients
      where patients.id = appointments.patient_id
        and public.can_access_clinic(patients.clinic_id)
    )
  );

create policy "appointments clinic clinician insert" on appointments
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from patients
      where patients.id = appointments.patient_id
        and public.can_write_clinic(patients.clinic_id)
    )
  );

create policy "appointments clinic clinician update" on appointments
  for update to authenticated
  using (
    exists (
      select 1 from patients
      where patients.id = appointments.patient_id
        and public.can_write_clinic(patients.clinic_id)
    )
  )
  with check (
    exists (
      select 1 from patients
      where patients.id = appointments.patient_id
        and public.can_write_clinic(patients.clinic_id)
    )
  );

-- OAuth tokens must be written only by Edge Functions using the service role.
drop policy if exists "calendar connections own insert" on calendar_connections;
drop policy if exists "calendar connections own update" on calendar_connections;

create or replace function public.sync_default_clinic_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_clinic_id uuid;
begin
  target_clinic_id := public.default_clinic_id();

  if target_clinic_id is null then
    return new;
  end if;

  insert into public.clinic_memberships (clinic_id, user_id, role, active)
  values (target_clinic_id, new.id, new.role, new.active)
  on conflict (clinic_id, user_id) do update
  set role = excluded.role,
      active = excluded.active,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists profiles_sync_default_clinic_membership on profiles;
create trigger profiles_sync_default_clinic_membership
after insert or update of role, active on profiles
for each row
execute function public.sync_default_clinic_membership();
