-- ================================================================
-- T3 — Finanzas: catálogo de precios, paquetes por paciente,
-- pagos y gastos. RLS a nivel clínica (mismo patrón que patients).
-- ================================================================

-- 1) Catálogo de servicios/paquetes (precios configurables) -------
CREATE TABLE public.packages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL DEFAULT default_clinic_id() REFERENCES public.clinics(id),
  name              text NOT NULL,
  sessions_included integer NOT NULL DEFAULT 1,
  price             numeric(10,2) NOT NULL DEFAULT 0,
  session_type      text,                 -- Valoración | Sesión clínica | Descarga muscular | Terapia a domicilio
  active            boolean NOT NULL DEFAULT true,
  created_by        uuid DEFAULT auth.uid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 2) Compra/asignación de un paquete (o sesión suelta) a un paciente
CREATE TABLE public.patient_packages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid NOT NULL DEFAULT default_clinic_id() REFERENCES public.clinics(id),
  patient_id     uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  package_id     uuid REFERENCES public.packages(id),
  name           text NOT NULL,                       -- snapshot del nombre del paquete
  total_amount   numeric(10,2) NOT NULL DEFAULT 0,     -- precio total de la compra
  sessions_total integer NOT NULL DEFAULT 1,
  sessions_used  integer NOT NULL DEFAULT 0,
  purchased_at   date NOT NULL DEFAULT current_date,
  notes          text,
  created_by     uuid DEFAULT auth.uid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 3) Pagos recibidos ----------------------------------------------
CREATE TABLE public.payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid NOT NULL DEFAULT default_clinic_id() REFERENCES public.clinics(id),
  patient_id          uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  patient_package_id  uuid REFERENCES public.patient_packages(id) ON DELETE SET NULL,
  amount              numeric(10,2) NOT NULL,
  method              text NOT NULL DEFAULT 'efectivo', -- efectivo | transferencia | tarjeta
  paid_at             date NOT NULL DEFAULT current_date,
  notes               text,
  created_by          uuid DEFAULT auth.uid(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 4) Gastos del negocio -------------------------------------------
CREATE TABLE public.expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL DEFAULT default_clinic_id() REFERENCES public.clinics(id),
  category    text NOT NULL DEFAULT 'otro',  -- renta | material | servicios | nomina | otro
  description text,
  amount      numeric(10,2) NOT NULL,
  spent_at    date NOT NULL DEFAULT current_date,
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX patient_packages_patient_idx ON public.patient_packages (patient_id);
CREATE INDEX payments_patient_idx         ON public.payments (patient_id);
CREATE INDEX payments_paid_at_idx         ON public.payments (paid_at);
CREATE INDEX expenses_spent_at_idx        ON public.expenses (spent_at);

-- RLS — mismo patrón que patients (can_access/can_write)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['packages','patient_packages','payments','expenses'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format($p$
      CREATE POLICY "%1$s clinic read" ON public.%1$I
        FOR SELECT TO authenticated
        USING (can_access_clinic(clinic_id));
    $p$, t);

    EXECUTE format($p$
      CREATE POLICY "%1$s clinic insert" ON public.%1$I
        FOR INSERT TO authenticated
        WITH CHECK (can_write_clinic(clinic_id) AND created_by = auth.uid());
    $p$, t);

    EXECUTE format($p$
      CREATE POLICY "%1$s clinic update" ON public.%1$I
        FOR UPDATE TO authenticated
        USING (can_write_clinic(clinic_id))
        WITH CHECK (can_write_clinic(clinic_id));
    $p$, t);

    EXECUTE format($p$
      CREATE POLICY "%1$s clinic delete" ON public.%1$I
        FOR DELETE TO authenticated
        USING (can_write_clinic(clinic_id));
    $p$, t);
  END LOOP;
END $$;

-- Catálogo inicial de precios (tarifas confirmadas por el dueño)
INSERT INTO public.packages (clinic_id, name, sessions_included, price, session_type) VALUES
  (default_clinic_id(), 'Valoración (sin costo)',            1,    0, 'Valoración'),
  (default_clinic_id(), 'Sesión individual',                 1,  350, 'Sesión clínica'),
  (default_clinic_id(), 'Paquete 6 sesiones',                6, 1800, 'Sesión clínica'),
  (default_clinic_id(), 'Paquete 10 sesiones',              10, 2700, 'Sesión clínica'),
  (default_clinic_id(), 'Descarga muscular medio cuerpo (1h)',   1, 400, 'Descarga muscular'),
  (default_clinic_id(), 'Descarga muscular completa (1.5h)',     1, 600, 'Descarga muscular');
