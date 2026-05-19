-- Prevent duplicate clinical session numbers per patient.
-- Run after 001_initial_schema.sql.

create unique index if not exists session_notes_patient_session_number_key
  on session_notes(patient_id, session_number);
