-- Comisión de tarjeta = GASTO de la clínica, NO deuda del paciente.
--
-- Antes: al cobrar con tarjeta se guardaba el monto NETO (ya restada la comisión
-- de 4.06 %) como pago. Resultado: un paciente que pagaba completo su paquete
-- (p. ej. 6 sesiones = $1800) quedaba con saldo = 1800 − 1726.92 = $73.08, como
-- si "debiera la comisión". Pero el paciente NO debe la comisión: pagó $1800.
--
-- Ahora: el pago se guarda en BRUTO (lo que el paciente entregó → liquida su
-- saldo) y la comisión de la terminal se registra como un GASTO ligado al pago
-- vía expenses.payment_id. Así:
--   • saldo del paciente   = Σ pagos (bruto)            → correcto (queda en $0)
--   • ingresos             = Σ pagos (bruto)            → $1800
--   • gastos               += comisión                  → $73.08
--   • ganancia neta        = ingresos − gastos          → $1726.92 (exacto)
-- Al borrar un pago, su gasto de comisión se borra EN CASCADA (deshacer cobro
-- sigue funcionando sin tocar más código).

-- 1) Vínculo gasto→pago: una comisión pertenece a su pago y muere con él.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_id uuid
    REFERENCES public.payments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS expenses_payment_id_idx ON public.expenses (payment_id);

-- 2) charge_appointment ahora acepta p_commission y registra el gasto de comisión
--    ligado al pago de dinero (la sesión suelta, o el abono del paquete).
DROP FUNCTION IF EXISTS public.charge_appointment(
  uuid, uuid, boolean, uuid, numeric, text, date, text
);

CREATE OR REPLACE FUNCTION public.charge_appointment(
  p_appointment_id uuid,
  p_patient_id uuid,
  p_use_package boolean,
  p_patient_package_id uuid default null,
  p_amount numeric default 0,
  p_method text default 'efectivo',
  p_paid_at date default null,
  p_notes text default null,
  p_commission numeric default 0
)
returns public.payments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pkg public.patient_packages;
  v_tracking public.payments;
  v_amount numeric := coalesce(p_amount, 0);
  v_commission numeric := coalesce(p_commission, 0);
  v_money_payment_id uuid;
begin
  -- Defensa en profundidad: nunca se registra un cobro/comisión negativos.
  if v_amount < 0 then
    raise exception 'El monto no puede ser negativo.' using errcode = 'check_violation';
  end if;
  if v_commission < 0 then
    raise exception 'La comisión no puede ser negativa.' using errcode = 'check_violation';
  end if;

  if p_use_package then
    if p_patient_package_id is null then
      raise exception 'Falta seleccionar el paquete.' using errcode = 'check_violation';
    end if;

    -- Bloqueo de la fila del paquete: serializa cobros concurrentes del mismo
    -- paquete para que no consuman la misma sesión a la vez.
    select * into v_pkg
    from public.patient_packages
    where id = p_patient_package_id
    for update;

    if not found then
      raise exception 'Paquete no encontrado.' using errcode = 'no_data_found';
    end if;

    if coalesce(v_pkg.sessions_used, 0) >= coalesce(v_pkg.sessions_total, 0) then
      raise exception 'Ese paquete ya no tiene sesiones disponibles.' using errcode = 'check_violation';
    end if;

    update public.patient_packages
    set sessions_used = coalesce(sessions_used, 0) + 1,
        updated_at = now()
    where id = p_patient_package_id;

    -- Registro de la sesión usada (amount 0, método 'paquete') — siempre.
    insert into public.payments (
      patient_id, patient_package_id, appointment_id, amount, method, paid_at, notes
    )
    values (
      p_patient_id, p_patient_package_id, p_appointment_id, 0, 'paquete',
      coalesce(p_paid_at, current_date),
      coalesce(p_notes, 'Sesión de paquete: ' || v_pkg.name)
    )
    returning * into v_tracking;

    -- Abono parcial adicional (si el usuario indicó un monto > 0).
    if v_amount > 0 then
      insert into public.payments (
        patient_id, patient_package_id, appointment_id, amount, method, paid_at, notes
      )
      values (
        p_patient_id, p_patient_package_id, p_appointment_id, v_amount,
        coalesce(p_method, 'efectivo'), coalesce(p_paid_at, current_date), p_notes
      )
      returning id into v_money_payment_id;

      -- Comisión de terminal ligada al abono (si pagó con tarjeta).
      if v_commission > 0 and v_money_payment_id is not null then
        insert into public.expenses (payment_id, amount, category, description, spent_at)
        values (
          v_money_payment_id, v_commission, 'comision',
          'Comisión terminal (tarjeta)', coalesce(p_paid_at, current_date)
        );
      end if;
    end if;

    return v_tracking;
  end if;

  -- Sesión suelta: un único pago con monto y método.
  insert into public.payments (
    patient_id, appointment_id, amount, method, paid_at, notes
  )
  values (
    p_patient_id, p_appointment_id, v_amount,
    coalesce(p_method, 'efectivo'), coalesce(p_paid_at, current_date), p_notes
  )
  returning * into v_tracking;

  -- Comisión de terminal ligada al pago (si pagó con tarjeta).
  if v_commission > 0 then
    insert into public.expenses (payment_id, amount, category, description, spent_at)
    values (
      v_tracking.id, v_commission, 'comision',
      'Comisión terminal (tarjeta)', coalesce(p_paid_at, current_date)
    );
  end if;

  return v_tracking;
end;
$$;

revoke all on function public.charge_appointment(
  uuid, uuid, boolean, uuid, numeric, text, date, text, numeric
) from public, anon;
grant execute on function public.charge_appointment(
  uuid, uuid, boolean, uuid, numeric, text, date, text, numeric
) to authenticated;

-- 3) Arreglo de datos históricos: los pagos con tarjeta se guardaron en NETO.
--    Se reconstruye el BRUTO (lo que el paciente realmente pagó) y se registra
--    la comisión como gasto ligado. Así los saldos pasados también cuadran.
--    bruto = neto / (1 - 0.0406);  comisión = bruto − neto.
DO $$
DECLARE
  r record;
  v_gross numeric;
  v_comm  numeric;
BEGIN
  FOR r IN
    SELECT p.id, p.amount AS net, p.paid_at
    FROM public.payments p
    WHERE p.method = 'tarjeta'
      AND p.amount > 0
      -- Evita re-procesar si la migración ya corrió (no hay comisión ligada aún).
      AND NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.payment_id = p.id)
  LOOP
    v_gross := round(r.net / (1 - 0.0406), 2);
    v_comm  := round(v_gross - r.net, 2);
    UPDATE public.payments SET amount = v_gross WHERE id = r.id;
    IF v_comm > 0 THEN
      INSERT INTO public.expenses (payment_id, amount, category, description, spent_at)
      VALUES (r.id, v_comm, 'comision',
              'Comisión terminal (tarjeta) — ajuste histórico', r.paid_at);
    END IF;
  END LOOP;
END $$;
