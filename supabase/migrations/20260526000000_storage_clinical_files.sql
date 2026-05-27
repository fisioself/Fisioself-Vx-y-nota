-- Migration: Configure private storage bucket for clinical files
-- Description: Creates the clinical_files bucket and applies RLS policies so only active clinical users can upload/view their clinic's files.

-- 1. Create the bucket (private by default)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinical_files',
  'clinical_files',
  false,
  10485760, -- 10MB limit
  '{image/jpeg,image/png,image/webp,application/pdf}'
) on conflict (id) do update set 
  public = false, 
  file_size_limit = 10485760,
  allowed_mime_types = '{image/jpeg,image/png,image/webp,application/pdf}';

-- 2. Enable RLS on the storage.objects table
alter table storage.objects enable row level security;

-- Helper function to extract patient_id from the file path
-- Convention: files will be stored as: clinical_files/{patient_id}/{uuid}.ext
create or replace function public.get_patient_id_from_storage_path(path_tokens text[])
returns uuid
language sql
immutable
as $$
  select case 
    when array_length(path_tokens, 1) >= 1 then nullif(path_tokens[1], '')::uuid
    else null
  end;
$$;

-- 3. RLS Policy: View files
-- A user can view a file if they have access to the patient it belongs to.
create policy "Users can view files of their patients"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'clinical_files'
  and public.is_active_clinical_user()
  and exists (
    select 1 from public.patients p
    join public.clinic_memberships m on m.clinic_id = p.clinic_id
    where p.id = public.get_patient_id_from_storage_path(string_to_array(name, '/'))
      and m.user_id = auth.uid()
      and m.active = true
  )
);

-- 4. RLS Policy: Upload files
-- A user can upload a file if they have access to the patient it belongs to.
create policy "Users can upload files for their patients"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'clinical_files'
  and public.is_active_clinical_user()
  and exists (
    select 1 from public.patients p
    join public.clinic_memberships m on m.clinic_id = p.clinic_id
    where p.id = public.get_patient_id_from_storage_path(string_to_array(name, '/'))
      and m.user_id = auth.uid()
      and m.active = true
  )
);

-- 5. RLS Policy: Delete files
-- Only admins can delete files.
create policy "Only admins can delete files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'clinical_files'
  and public.is_admin()
  and exists (
    select 1 from public.patients p
    join public.clinic_memberships m on m.clinic_id = p.clinic_id
    where p.id = public.get_patient_id_from_storage_path(string_to_array(name, '/'))
      and m.user_id = auth.uid()
      and m.active = true
  )
);
