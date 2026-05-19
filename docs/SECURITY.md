# Seguridad

## Principios

- La app clinica es privada y requiere Supabase Auth.
- Supabase Postgres es la fuente unica de verdad.
- RLS debe estar habilitado en todas las tablas clinicas.
- La API key de Claude nunca debe vivir en frontend.
- La IA se consume mediante una funcion segura (`supabase/functions/clinical-ai`).
- Los eventos clinicos sensibles deben registrarse en `audit_log`.

## Variables sensibles

Frontend publico:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_CLAUDE_PROXY_URL
VITE_GOOGLE_CALENDAR_CONNECT_URL
VITE_GOOGLE_CALENDAR_SYNC_URL
```

Servidor / Supabase Edge Functions:

```text
ANTHROPIC_API_KEY
CLAUDE_MODEL
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
APP_ORIGIN
ENVIRONMENT
```

## RLS

La migracion inicial habilita RLS en:

- `profiles`
- `therapists`
- `patients`
- `evaluations`
- `session_notes`
- `follow_ups`
- `ai_consults`
- `audit_log`
- `clinics`
- `clinic_memberships`

Las migraciones de endurecimiento limitan los datos clinicos por rol y por membresia activa en `clinic_memberships`.

## Endurecimiento pendiente

- Bloquear delete fisico; usar estados logicos.
- Mantener `clinic_memberships` sincronizado con `profiles`.
- Probar RLS con usuarios de distintas clinicas antes de abrir multi-sede.
- Agregar rate limit persistente a la funcion IA.
- Registrar uso de IA con paciente, tipo y usuario.
- Programar limpieza periodica de `google_oauth_states` usando `cleanup_google_oauth_states()`.
