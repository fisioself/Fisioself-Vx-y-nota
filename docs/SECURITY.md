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
```

Servidor / Supabase Edge Functions:

```text
ANTHROPIC_API_KEY
CLAUDE_MODEL
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

Politica inicial: solo usuarios autenticados pueden operar datos clinicos.

## Endurecimiento pendiente

- Separar roles reales: admin, therapist, assistant.
- Restringir actualizaciones criticas a admin.
- Bloquear delete fisico; usar estados logicos.
- Crear policies por clinica/sede si hay multi-tenant.
- Agregar rate limit a la funcion IA.
- Registrar uso de IA con paciente, tipo y usuario.
