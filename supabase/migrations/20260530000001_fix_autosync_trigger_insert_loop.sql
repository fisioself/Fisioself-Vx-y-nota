-- Evitar el bucle INSERT: cuando google-calendar-fetch importa citas de Google,
-- las inserta con sync_status='synced'. Sin esta guarda, el trigger dispara
-- google-calendar-sync para cada cita importada, creando un bucle innecesario
-- (~80 llamadas por cada importación de calendario).
CREATE OR REPLACE FUNCTION public.handle_appointment_autosync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_secret text;
  v_url    text := 'https://ncyyjrasfzzwmfbbtlsh.supabase.co/functions/v1/google-calendar-sync';
begin
  -- No sincronizar citas explícitamente deshabilitadas
  if new.sync_status = 'disabled' then
    return new;
  end if;

  -- No re-sincronizar a Google citas que acaban de llegar DE Google.
  -- google-calendar-fetch inserta con sync_status='synced'; re-enviarlas
  -- crearía ~N llamadas redundantes por cada importación de calendario.
  if tg_op = 'INSERT' and new.sync_status = 'synced' then
    return new;
  end if;

  -- En UPDATE, solo disparar si cambió algo relevante para el evento.
  -- (La escritura de vuelta de la función toca sync_status/google_*, NO estos campos,
  --  así que esta guarda evita un bucle infinito.)
  if tg_op = 'UPDATE' then
    if (old.title, old.starts_at, old.ends_at, old.description, old.location)
       is not distinct from
       (new.title, new.starts_at, new.ends_at, new.description, new.location) then
      return new;
    end if;
  end if;

  select value into v_secret
  from public.integration_config
  where key = 'gcal_autosync_secret';

  if v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('appointment_id', new.id, 'source', 'db_trigger'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-sync-secret', v_secret
               ),
    timeout_milliseconds := 10000
  );

  return new;
end;
$$;
