# Notas de migraciones — decisiones diferidas

## Deferido: mover pg_net fuera del schema public (lint 0014 `extension_in_public`)

**Estado: NO aplicar. Aceptado/diferido conscientemente.**

### Razón

- Las funciones de pg_net (`net.http_post`, `net.http_get`, ...) ya viven en el
  schema `net`, NO en `public`. El lint salta solo porque la EXTENSIÓN está
  registrada con namespace public; no hay exposición real en la API pública.
- Dependencias en producción: `handle_appointment_autosync`,
  `handle_appointment_unsync` y `retry_pending_appointment_syncs`
  (SECURITY DEFINER, `search_path=""`) llaman a `net.http_post` calificado;
  además pg_cron está activo.
- `ALTER EXTENSION pg_net SET SCHEMA extensions` es problemático y arriesga
  romper la autosincronización de citas con Google Calendar.

### Si algún día se retoma

Probar SIEMPRE en una Supabase branch, validar que los 3 triggers/cron sigan
ejecutando `net.http_post`, y solo entonces aplicar a prod.

> Nota: originalmente se creó un placeholder
> `20260529000001_pg_net_to_extensions_schema.sql` con un `ALTER EXTENSION`.
> Se eliminó porque dejar SQL ejecutable de un cambio "no aplicar" es peligroso
> (un `supabase db push` lo correría). Este registro lo reemplaza.
