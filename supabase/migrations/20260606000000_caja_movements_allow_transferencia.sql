-- El selector de "Ajustar caja manualmente" ofrece Efectivo/Tarjeta/Transferencia,
-- pero el CHECK solo permitía efectivo|tarjeta, rompiendo los movimientos por
-- transferencia ("No se pudo registrar el movimiento."). Alineamos el constraint
-- con los métodos reales soportados por la app (PAYMENT_METHODS).
ALTER TABLE public.caja_movements
  DROP CONSTRAINT IF EXISTS caja_movements_method_check;

ALTER TABLE public.caja_movements
  ADD CONSTRAINT caja_movements_method_check
    CHECK (method = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'transferencia'::text]));
