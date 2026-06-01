-- Deduplication of patients created by google-calendar-fetch.
-- Each Google Calendar event title (e.g. "Eufemia Sánchez #5") was
-- being stored as a separate patient row.  This migration:
--   1. Strips the "#N" session counter and embedded phone numbers from
--      every patient's full_name, writing extracted phones to the phone column.
--   2. Merges duplicate rows (same person after normalisation) so that
--      all appointments point at one canonical patient (oldest row).
--   3. Handles the special case Alicia cuevas ≡ Alicia cuevas Alarcón
--      (confirmed identical by the clinic owner).
--   4. Adds a normalization helper function and a unique index on
--      (clinic_id, patient_name_norm(full_name)) to prevent future duplicates.
--
-- DRY-RUN was run before this file was applied and reviewed — 25 groups,
-- 0 session_notes / 0 evaluations on any duplicate row (only appointments).

BEGIN;

-- ================================================================
-- 1. patient_name_norm()  — immutable, usable in indexes
-- ================================================================
CREATE OR REPLACE FUNCTION public.patient_name_norm(n text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(
            translate(n,
              'áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙâêîôûÂÊÎÔÛäëïöüÄËÏÖÜãõñÃÕÑçÇ',
              'aeiouaeiouaeiouaeiouaeiouaeiouaeiouaonaonocc'
            )
          ),
          '\s*#\s*[0-9]+\s*$', '', 'g'
        ),
        '[0-9]{7,}', '', 'g'
      ),
      '\s+', ' ', 'g'
    )
  )
$$;

-- ================================================================
-- 2. Clean ALL patient full_names in place
--    • Extract phone number embedded in the name → phone column
--    • Strip "  #N" session counter suffix
--    • Strip phone digit sequences from name
--    • btrim
-- ================================================================
UPDATE patients
SET
  phone      = COALESCE(phone, (regexp_match(full_name, '([0-9]{7,})'))[1]),
  full_name  = btrim(
                 regexp_replace(
                   regexp_replace(full_name, '\s*#\s*[0-9]+\s*$', '', 'g'),
                   '[0-9]{7,}', '', 'g'
                 )
               ),
  updated_at = NOW()
WHERE full_name ~ '\s*#\s*[0-9]+\s*$'
   OR full_name ~ '[0-9]{7,}';

-- ================================================================
-- 3. Build dedup map — one row per (dup_id, canon_id) pair.
--    Canonical = oldest row (lowest created_at, ties broken by id).
-- ================================================================
CREATE TEMP TABLE _dedup_map AS
WITH ranked AS (
  SELECT
    id,
    clinic_id,
    patient_name_norm(full_name) AS norm_key,
    ROW_NUMBER() OVER (
      PARTITION BY clinic_id, patient_name_norm(full_name)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM patients
  WHERE full_name IS NOT NULL
)
SELECT
  r.id  AS dup_id,
  c.id  AS canon_id
FROM ranked r
JOIN ranked c
  ON  c.clinic_id = r.clinic_id
  AND c.norm_key  = r.norm_key
  AND c.rn        = 1
WHERE r.rn > 1;

-- ================================================================
-- 4. Remap all clinical data from duplicates → canonical
-- ================================================================
UPDATE appointments  SET patient_id = d.canon_id, updated_at = NOW()
  FROM _dedup_map d WHERE patient_id = d.dup_id;

UPDATE session_notes SET patient_id = d.canon_id
  FROM _dedup_map d WHERE patient_id = d.dup_id;

UPDATE evaluations   SET patient_id = d.canon_id
  FROM _dedup_map d WHERE patient_id = d.dup_id;

UPDATE ai_consults   SET patient_id = d.canon_id
  FROM _dedup_map d WHERE patient_id = d.dup_id;

UPDATE follow_ups    SET patient_id = d.canon_id
  FROM _dedup_map d WHERE patient_id = d.dup_id;

-- ================================================================
-- 5. Delete duplicate patient rows (CASCADE removes any stragglers)
-- ================================================================
DELETE FROM patients WHERE id IN (SELECT dup_id FROM _dedup_map);

DROP TABLE _dedup_map;

-- ================================================================
-- 6. Special-case merge: "Alicia cuevas" ≡ "Alicia cuevas Alarcón"
--    Confirmed by clinic owner — same patient, full surname omitted
--    in many calendar events.  Canonical = db43d4ad (oldest overall).
-- ================================================================
DO $$
DECLARE
  v_canon UUID := 'db43d4ad-58bc-4bf9-bdab-ff139a2b0eb1';  -- Alicia cuevas Alarcón
  v_dup   UUID := '11046b7b-2ea7-4a3a-8b73-5a3e9a9152d7';  -- Alicia cuevas
BEGIN
  IF EXISTS (SELECT 1 FROM patients WHERE id = v_dup) THEN
    UPDATE appointments  SET patient_id = v_canon, updated_at = NOW() WHERE patient_id = v_dup;
    UPDATE session_notes SET patient_id = v_canon WHERE patient_id = v_dup;
    UPDATE evaluations   SET patient_id = v_canon WHERE patient_id = v_dup;
    UPDATE ai_consults   SET patient_id = v_canon WHERE patient_id = v_dup;
    UPDATE follow_ups    SET patient_id = v_canon WHERE patient_id = v_dup;
    DELETE FROM patients WHERE id = v_dup;
  END IF;
END;
$$;

-- ================================================================
-- 7. Unique index on (clinic_id, norm_name) to prevent future dups
-- ================================================================
CREATE UNIQUE INDEX IF NOT EXISTS patients_clinic_norm_name_key
  ON patients (clinic_id, patient_name_norm(full_name));

COMMIT;
