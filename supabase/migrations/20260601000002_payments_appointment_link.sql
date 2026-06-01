-- ================================================================
-- Vincula cada pago con la cita del calendario que lo originó.
-- Columna nullable y aditiva: los pagos existentes quedan intactos
-- (appointment_id = NULL). Permite registrar el cobro desde la cita y
-- saber qué citas ya fueron cobradas.
-- ON DELETE SET NULL: si se borra la cita, el pago se conserva.
-- ================================================================
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS appointment_id uuid
  REFERENCES public.appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payments_appointment_idx
  ON public.payments (appointment_id);
