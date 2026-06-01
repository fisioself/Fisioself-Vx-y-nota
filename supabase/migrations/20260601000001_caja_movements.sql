-- ================================================================
-- Movimientos manuales de caja.
-- Permiten ajustar "¿Cuánto hay en caja?" a mano (entradas/salidas que
-- no provienen de cobros a pacientes), con registro y opción de borrar.
-- El monto es positivo para entradas y negativo para salidas.
-- Métodos soportados: efectivo | tarjeta (transferencia se retiró).
-- RLS a nivel clínica (mismo patrón que payments/expenses).
-- ================================================================
CREATE TABLE public.caja_movements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL DEFAULT default_clinic_id() REFERENCES public.clinics(id),
  amount      numeric(10,2) NOT NULL,                 -- + entrada, − salida
  method      text NOT NULL DEFAULT 'efectivo' CHECK (method IN ('efectivo','tarjeta')),
  description text,
  occurred_at date NOT NULL DEFAULT current_date,
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX caja_movements_occurred_at_idx ON public.caja_movements (occurred_at);

ALTER TABLE public.caja_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "caja_movements clinic read" ON public.caja_movements
  FOR SELECT TO authenticated
  USING (can_access_clinic(clinic_id));

CREATE POLICY "caja_movements clinic insert" ON public.caja_movements
  FOR INSERT TO authenticated
  WITH CHECK (can_write_clinic(clinic_id) AND created_by = auth.uid());

CREATE POLICY "caja_movements clinic update" ON public.caja_movements
  FOR UPDATE TO authenticated
  USING (can_write_clinic(clinic_id))
  WITH CHECK (can_write_clinic(clinic_id));

CREATE POLICY "caja_movements clinic delete" ON public.caja_movements
  FOR DELETE TO authenticated
  USING (can_write_clinic(clinic_id));
