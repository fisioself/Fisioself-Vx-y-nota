-- Almacenamiento de documentos clínicos por paciente (fotos de evaluación,
-- estudios, PDFs). Bucket PRIVADO + tabla de metadatos + RLS por clínica,
-- reusando los helpers existentes (can_access_clinic / can_write_clinic).
--
-- Seguridad:
--  • El bucket es privado: los archivos solo se ven con URL firmada temporal.
--  • Las policies de storage atan cada objeto a la clínica del paciente (la
--    primera carpeta de la ruta es el patient_id), de modo que solo miembros
--    activos de esa clínica pueden leer/escribir/borrar.
--  • La tabla patient_documents hereda clinic_id del paciente vía trigger, así
--    el cliente nunca lo manda (no se puede falsificar).

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Bucket privado
-- ─────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-files',
  'patient-files',
  false,
  15728640, -- 15 MB
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf'
  ]
)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Tabla de metadatos
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.patient_documents (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients(id) on delete cascade,
  clinic_id    uuid not null,
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  description  text,
  uploaded_by  uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

create index if not exists idx_patient_documents_patient_id
  on public.patient_documents (patient_id);
create index if not exists idx_patient_documents_clinic_id
  on public.patient_documents (clinic_id);

-- clinic_id siempre se toma del paciente (no del cliente) para que coincida con
-- la clínica real y RLS pueda validarlo. uploaded_by cae al usuario actual.
create or replace function public.set_patient_document_clinic()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  select clinic_id into new.clinic_id
  from public.patients
  where id = new.patient_id;

  if new.clinic_id is null then
    raise exception 'Paciente % no existe o no tiene clínica', new.patient_id;
  end if;

  if new.uploaded_by is null then
    new.uploaded_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_patient_document_clinic on public.patient_documents;
create trigger trg_set_patient_document_clinic
  before insert on public.patient_documents
  for each row execute function public.set_patient_document_clinic();

-- Auditoría: registra alta/baja de documentos clínicos (quién y cuándo).
drop trigger if exists trg_audit_patient_documents on public.patient_documents;
create trigger trg_audit_patient_documents
  after insert or update or delete on public.patient_documents
  for each row execute function public.audit_clinical_change();

-- ─────────────────────────────────────────────────────────────────────────
-- 3) RLS de la tabla (mismo patrón que patients)
-- ─────────────────────────────────────────────────────────────────────────
alter table public.patient_documents enable row level security;

drop policy if exists "patient_documents clinic read" on public.patient_documents;
create policy "patient_documents clinic read"
  on public.patient_documents
  for select
  using (public.can_access_clinic(clinic_id));

drop policy if exists "patient_documents clinic insert" on public.patient_documents;
create policy "patient_documents clinic insert"
  on public.patient_documents
  for insert
  with check (
    public.can_write_clinic(clinic_id)
    and uploaded_by = (select auth.uid())
  );

drop policy if exists "patient_documents clinic update" on public.patient_documents;
create policy "patient_documents clinic update"
  on public.patient_documents
  for update
  using (public.can_write_clinic(clinic_id))
  with check (public.can_write_clinic(clinic_id));

drop policy if exists "patient_documents clinic delete" on public.patient_documents;
create policy "patient_documents clinic delete"
  on public.patient_documents
  for delete
  using (public.can_write_clinic(clinic_id));

-- ─────────────────────────────────────────────────────────────────────────
-- 4) RLS de storage.objects para el bucket patient-files
--    La primera carpeta de la ruta es el patient_id → se resuelve la clínica.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "patient-files clinic read" on storage.objects;
create policy "patient-files clinic read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'patient-files'
    and public.can_access_clinic(
      (select clinic_id from public.patients
        where id = ((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "patient-files clinic insert" on storage.objects;
create policy "patient-files clinic insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'patient-files'
    and public.can_write_clinic(
      (select clinic_id from public.patients
        where id = ((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "patient-files clinic delete" on storage.objects;
create policy "patient-files clinic delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'patient-files'
    and public.can_write_clinic(
      (select clinic_id from public.patients
        where id = ((storage.foldername(name))[1])::uuid)
    )
  );
