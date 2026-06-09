# Deploy: Vercel + Supabase

## Objetivo

Desplegar FISIOSELF App Notas VX como aplicacion clinica privada independiente.

## 1. Supabase

1. Crear un proyecto nuevo en Supabase.
2. Ejecutar las migraciones en orden:

```text
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_roles_rls_hardening.sql
supabase/migrations/003_google_calendar.sql
supabase/migrations/004_google_oauth_states.sql
supabase/migrations/005_google_oauth_token_hardening.sql
supabase/migrations/006_session_number_integrity.sql
supabase/migrations/007_clinic_tenancy_hardening.sql
supabase/migrations/008_google_oauth_state_cleanup.sql
supabase/migrations/009_ai_rate_limit_persistence.sql
supabase/migrations/010_clinical_audit_triggers.sql
```

3. Crear usuarios en Supabase Auth.
4. Crear el registro correspondiente en `profiles` para cada usuario activo.

Ejemplo de perfil inicial:

```sql
insert into profiles (id, full_name, role, active)
values ('USER_ID_DE_SUPABASE_AUTH', 'Nombre del fisioterapeuta', 'admin', true);
```

## 2. Funcion segura de IA

La funcion vive en:

```text
supabase/functions/clinical-ai/index.ts
```

Configurar secretos en Supabase, no en el frontend:

```text
ANTHROPIC_API_KEY
CLAUDE_MODEL
```

`CLAUDE_MODEL` puede quedar como opcional si se usa el valor default definido en la funcion.

La funcion valida `clinic_memberships.active = true` antes de enviar texto clinico al proveedor de IA. Confirmar que el modelo de clinicas/membresias exista y tenga al usuario activo antes de habilitar IA.

## 3. Google Calendar

Funciones Supabase Edge:

```text
supabase/functions/google-calendar-connect/index.ts
supabase/functions/google-calendar-callback/index.ts
supabase/functions/google-calendar-sync/index.ts
```

Crear OAuth Client en Google Cloud Console tipo Web Application.

Configurar Redirect URI con la URL publica de:

```text
google-calendar-callback
```

Configurar secretos en Supabase Edge Functions:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
SUPABASE_SERVICE_ROLE_KEY
```

La app usa el scope:

```text
https://www.googleapis.com/auth/calendar.events
```

## 4. Vercel

1. Crear nuevo proyecto en Vercel.
2. Conectar el repo `fisioself/APP---Notas-Fisioself-`.
3. Framework preset: Vite.
4. Build command:

```text
npm run build
```

5. Output directory:

```text
dist
```

## 5. Variables publicas en Vercel

Configurar en Vercel, no en el codigo:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_AI_PROXY_URL
VITE_GOOGLE_CALENDAR_CONNECT_URL
VITE_GOOGLE_CALENDAR_SYNC_URL
```

`VITE_AI_PROXY_URL` debe apuntar a la URL publica de la Supabase Edge Function `clinical-ai`.

Las variables de Google Calendar deben apuntar a las funciones:

```text
google-calendar-connect
google-calendar-sync
```

## 6. Verificacion

Antes de usar con pacientes reales:

```text
npm run quality
```

En GitHub Actions debe pasar:

```text
format:check
lint
test:coverage
build
```

## 7. Notas de seguridad

- No guardar claves privadas en Vercel como variables expuestas al navegador.
- La clave de Claude solo vive como secret de Supabase Edge Function.
- Los secretos de Google OAuth solo viven en Supabase Edge Functions.
- Google Calendar no debe recibir nombre, telefono, correo, diagnosticos ni notas del paciente.
- Aplicar `010_clinical_audit_triggers.sql` para que la auditoria ocurra en base de datos.
- RLS debe permanecer habilitado.
- La app requiere usuarios autenticados.
- No usar datos reales hasta validar Auth, RLS, IA, Calendar y auditoria.
