-- Allow clinicians to delete individual session notes with database audit logging.
-- Run after 20260520212158_patient_admin_delete_policy.sql.

drop trigger if exists session_notes_audit_clinical_change on public.session_notes;
create trigger session_notes_audit_clinical_change
after insert or update or delete on public.session_notes
for each row execute function public.audit_clinical_change();

drop policy if exists "session notes clinic clinician delete" on public.session_notes;
create policy "session notes clinic clinician delete" on public.session_notes
  for delete to authenticated
  using (
    public.is_admin_or_therapist()
    and exists (
      select 1
      from public.patients
      where patients.id = session_notes.patient_id
        and public.can_write_clinic(patients.clinic_id)
    )
  );
