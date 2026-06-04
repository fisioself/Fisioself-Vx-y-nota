-- Cobro de cita ATÓMICO: una sola función transaccional en lugar de 2-3
-- escrituras separadas desde el cliente.
--
-- Antes, financeApi.chargeAppointment hacía: (1) UPDATE patient_packages
-- (sessions_used+1), (2) INSERT payment de seguimiento, (3) opcional INSERT del
-- abono. Si fallaba a la mitad (red, RLS, etc.) quedaba una sesión consumida sin
-- su pago, o viceversa: inconsistencia contable.
--
-- Esta función agrupa todo en UNA transacción (atómica) y bloquea la fila del
-- paquete (FOR UPDATE) para evitar que dos cobros concurrentes consuman la misma
-- sesión. Es SECURITY INVOKER: respeta RLS, así que el usuario solo puede cobrar
-- dentro de su clínica (las policies de payments/patient_packages se aplican).

create or replace function public.charge_appointment(
  p_appointment_id uuid,
  p_patient_id uuid,
  p_use_package boolean,
  p_patient_package_id uuid default null,
  p_amount numeric default 0,
  p_method text default 'efectivo',
  p_paid_at date default null,
  p_notes text default null
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
begin
  -- Defensa en profundidad: nunca se registra un cobro negativo.
  if v_amount < 0 then
    raise exception 'El monto no puede ser negativo.' using errcode = 'check_violation';
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
      );
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

  return v_tracking;
end;
$$;

-- Solo usuarios autenticados pueden cobrar; RLS hace el resto (clínica + rol).
revoke all on function public.charge_appointment(
  uuid, uuid, boolean, uuid, numeric, text, date, text
) from public, anon;
grant execute on function public.charge_appointment(
  uuid, uuid, boolean, uuid, numeric, text, date, text
) to authenticated;
