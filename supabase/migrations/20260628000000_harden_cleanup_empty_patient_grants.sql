-- Endurecimiento de permisos: cleanup_empty_patient() es una función de TRIGGER
-- (returns trigger), no una RPC de la app. Supabase concede EXECUTE por defecto
-- a los roles `anon` y `authenticated` sobre TODAS las funciones de `public`, por
-- lo que el linter de seguridad la marcaba como ejecutable por usuarios (incluso
-- anónimos) vía /rest/v1/rpc/cleanup_empty_patient.
--
-- Un trigger se ejecuta con los privilegios del owner SIN necesidad de ese grant,
-- así que revocar EXECUTE no afecta al trigger AFTER DELETE en `appointments`:
-- solo deja de estar accesible por la API REST.
revoke all on function public.cleanup_empty_patient() from public, anon, authenticated;
