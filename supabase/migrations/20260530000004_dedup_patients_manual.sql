-- Manual dedup of the ambiguous short-name patients that were intentionally
-- left out of 20260530000003_dedup_patients.sql.  Clinic owner confirmed:
--   • "Iker"        ≡ "Iker Juárez"          (same person)
--   • "Iker Antonio" is a DIFFERENT person   (left untouched)
--   • "Fernanda"     ≡ "Fernanda Rauch"      (same person)
--   • "Ma. Fernanda" ≡ "Ma. Fernanda Ortiz"  (same person)
-- Net result among this group: 4 distinct patients.
--
-- For each merge the surviving row keeps the FULLER, more identifying name;
-- the other row's appointments (and any clinical data) are reassigned first,
-- then the redundant row is deleted.

BEGIN;

-- Helper: reassign all child rows from p_dup to p_canon, then delete p_dup.
DO $$
DECLARE
  merges CONSTANT jsonb := '[
    {"canon": "182b1afd-17da-405e-a67e-001661a2e39a", "dup": "66605e36-887c-4228-894b-29b4bde37362"},
    {"canon": "cd3b0dea-194e-4721-90a4-f3c9b467652e", "dup": "52677c56-86b4-4f8d-8c62-e1539d22a555"},
    {"canon": "4834b8e0-b471-421d-9a83-8da21a9d9375", "dup": "eac336ac-1b8b-443d-9c85-7c544168ee10"}
  ]';
  m       jsonb;
  v_canon uuid;
  v_dup   uuid;
BEGIN
  FOR m IN SELECT * FROM jsonb_array_elements(merges)
  LOOP
    v_canon := (m->>'canon')::uuid;
    v_dup   := (m->>'dup')::uuid;

    IF EXISTS (SELECT 1 FROM patients WHERE id = v_dup)
       AND EXISTS (SELECT 1 FROM patients WHERE id = v_canon) THEN
      UPDATE appointments  SET patient_id = v_canon, updated_at = NOW() WHERE patient_id = v_dup;
      UPDATE session_notes SET patient_id = v_canon WHERE patient_id = v_dup;
      UPDATE evaluations   SET patient_id = v_canon WHERE patient_id = v_dup;
      UPDATE ai_consults   SET patient_id = v_canon WHERE patient_id = v_dup;
      UPDATE follow_ups    SET patient_id = v_canon WHERE patient_id = v_dup;
      DELETE FROM patients WHERE id = v_dup;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
