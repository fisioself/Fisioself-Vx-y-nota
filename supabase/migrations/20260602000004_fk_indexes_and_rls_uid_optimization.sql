-- Advisor 0001_unindexed_foreign_keys: 24 FK columns without covering index.
-- Advisor 0003_auth_rls_initplan: auth.uid() re-evaluated per row in 18 policies.

-- ============================================================
-- PART 1: FK indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ai_consults_created_by       ON public.ai_consults (created_by);
CREATE INDEX IF NOT EXISTS idx_ai_consults_patient_id       ON public.ai_consults (patient_id);
CREATE INDEX IF NOT EXISTS idx_ai_consults_therapist_id     ON public.ai_consults (therapist_id);

CREATE INDEX IF NOT EXISTS idx_appointments_created_by      ON public.appointments (created_by);
CREATE INDEX IF NOT EXISTS idx_appointments_therapist_id    ON public.appointments (therapist_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id           ON public.audit_log (actor_id);

CREATE INDEX IF NOT EXISTS idx_caja_movements_clinic_id     ON public.caja_movements (clinic_id);

CREATE INDEX IF NOT EXISTS idx_evaluations_created_by       ON public.evaluations (created_by);
CREATE INDEX IF NOT EXISTS idx_evaluations_patient_id       ON public.evaluations (patient_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_therapist_id     ON public.evaluations (therapist_id);

CREATE INDEX IF NOT EXISTS idx_expenses_clinic_id           ON public.expenses (clinic_id);

CREATE INDEX IF NOT EXISTS idx_follow_ups_created_by        ON public.follow_ups (created_by);
CREATE INDEX IF NOT EXISTS idx_follow_ups_patient_id        ON public.follow_ups (patient_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_therapist_id      ON public.follow_ups (therapist_id);

CREATE INDEX IF NOT EXISTS idx_google_oauth_states_user_id  ON public.google_oauth_states (user_id);

CREATE INDEX IF NOT EXISTS idx_packages_clinic_id           ON public.packages (clinic_id);

CREATE INDEX IF NOT EXISTS idx_patient_packages_clinic_id   ON public.patient_packages (clinic_id);
CREATE INDEX IF NOT EXISTS idx_patient_packages_package_id  ON public.patient_packages (package_id);

CREATE INDEX IF NOT EXISTS idx_patients_assigned_therapist_id ON public.patients (assigned_therapist_id);
CREATE INDEX IF NOT EXISTS idx_patients_created_by            ON public.patients (created_by);

CREATE INDEX IF NOT EXISTS idx_payments_clinic_id           ON public.payments (clinic_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient_package_id  ON public.payments (patient_package_id);

CREATE INDEX IF NOT EXISTS idx_session_notes_created_by     ON public.session_notes (created_by);
CREATE INDEX IF NOT EXISTS idx_session_notes_therapist_id   ON public.session_notes (therapist_id);

-- ============================================================
-- PART 2: RLS InitPlan optimization
-- ============================================================
-- ALTER POLICY preserves enforcement without any gap.
-- Wrapping auth.uid() in (SELECT auth.uid()) turns per-row evaluation
-- into a once-per-statement subquery with identical semantics.

ALTER POLICY "profiles read own"   ON public.profiles USING (id = (SELECT auth.uid()));
ALTER POLICY "profiles update own" ON public.profiles
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
ALTER POLICY "profiles insert own" ON public.profiles
  WITH CHECK (id = (SELECT auth.uid()));

ALTER POLICY "audit clinical insert" ON public.audit_log
  WITH CHECK (is_active_clinical_user() AND (actor_id = (SELECT auth.uid())));

ALTER POLICY "google oauth state own read" ON public.google_oauth_states
  USING (user_id = (SELECT auth.uid()));

ALTER POLICY "clinic memberships own read" ON public.clinic_memberships
  USING ((user_id = (SELECT auth.uid())) OR is_admin());

ALTER POLICY "patients clinic clinician insert" ON public.patients
  WITH CHECK (can_write_clinic(clinic_id) AND (created_by = (SELECT auth.uid())));

ALTER POLICY "evaluations clinic clinician insert" ON public.evaluations
  WITH CHECK ((created_by = (SELECT auth.uid())) AND (EXISTS (
    SELECT 1 FROM public.patients
    WHERE patients.id = evaluations.patient_id AND can_write_clinic(patients.clinic_id)
  )));

ALTER POLICY "session notes clinic clinician insert" ON public.session_notes
  WITH CHECK ((created_by = (SELECT auth.uid())) AND (EXISTS (
    SELECT 1 FROM public.patients
    WHERE patients.id = session_notes.patient_id AND can_write_clinic(patients.clinic_id)
  )));

ALTER POLICY "follow ups clinic clinician insert" ON public.follow_ups
  WITH CHECK ((created_by = (SELECT auth.uid())) AND (EXISTS (
    SELECT 1 FROM public.patients
    WHERE patients.id = follow_ups.patient_id AND can_write_clinic(patients.clinic_id)
  )));

ALTER POLICY "ai consults clinic clinician insert" ON public.ai_consults
  WITH CHECK ((created_by = (SELECT auth.uid())) AND (patient_id IS NOT NULL) AND (EXISTS (
    SELECT 1 FROM public.patients
    WHERE patients.id = ai_consults.patient_id AND can_write_clinic(patients.clinic_id)
  )));

ALTER POLICY "appointments clinic clinician insert" ON public.appointments
  WITH CHECK ((created_by = (SELECT auth.uid())) AND (EXISTS (
    SELECT 1 FROM public.patients
    WHERE patients.id = appointments.patient_id AND can_write_clinic(patients.clinic_id)
  )));

ALTER POLICY "Users manage their own push subscriptions" ON public.push_subscriptions
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "packages clinic insert" ON public.packages
  WITH CHECK (can_write_clinic(clinic_id) AND (created_by = (SELECT auth.uid())));

ALTER POLICY "patient_packages clinic insert" ON public.patient_packages
  WITH CHECK (can_write_clinic(clinic_id) AND (created_by = (SELECT auth.uid())));

ALTER POLICY "payments clinic insert" ON public.payments
  WITH CHECK (can_write_clinic(clinic_id) AND (created_by = (SELECT auth.uid())));

ALTER POLICY "expenses clinic insert" ON public.expenses
  WITH CHECK (can_write_clinic(clinic_id) AND (created_by = (SELECT auth.uid())));

ALTER POLICY "caja_movements clinic insert" ON public.caja_movements
  WITH CHECK (can_write_clinic(clinic_id) AND (created_by = (SELECT auth.uid())));
