# Seguridad

## Principios

- La app clinica es privada y requiere Supabase Auth.
- Supabase Postgres es la fuente unica de verdad.
- RLS debe estar habilitado en todas las tablas clinicas.
- La API key de Claude nunca debe vivir en frontend.
- La IA se consume mediante una funcion segura (`supabase/functions/clinical-ai`).
- `clinical-ai` exige una fila activa en `clinic_memberships` antes de llamar al proveedor externo.
- Google Calendar solo recibe metadatos no clinicos: `Cita Fisioself` y `Ver detalles en Fisioself.`.
- Los eventos clinicos sensibles deben registrarse en `audit_log`.
- La auditoria de inserts/updates clinicos ocurre con triggers SQL, no desde el navegador.

## Variables sensibles

Frontend publico:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_CLAUDE_PROXY_URL
```

Servidor / Supabase Edge Functions:

```text
ANTHROPIC_API_KEY
CLAUDE_MODEL
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
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
- `appointments`

Politica inicial: solo usuarios autenticados pueden operar datos clinicos. El endurecimiento por roles y la auditoria de base de datos deben aplicarse antes de usar datos reales.

## Endurecimiento pendiente

- Restringir actualizaciones criticas a admin.
- Bloquear delete fisico; usar estados logicos.
- Crear policies por clinica/sede si hay multi-tenant.
- Registrar uso de IA con paciente, tipo y usuario.
