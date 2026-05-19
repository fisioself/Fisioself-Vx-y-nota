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
```

3. Crear usuarios en Supabase Auth.
4. Crear el registro correspondiente en `profiles` para cada usuario activo.
5. Verificar que `clinic_memberships` tenga un registro activo para cada usuario que usara la app.

Ejemplo de perfil inicial:

```sql
insert into profiles (id, full_name, role, active)
values ('USER_ID_DE_SUPABASE_AUTH', 'Nombre del fisioterapeuta', 'admin', true);
```

La migracion `007_clinic_tenancy_hardening.sql` crea una clinica `FISIOSELF` por default,
asocia los perfiles existentes a esa clinica y endurece RLS por membresia.

## 2. Funcion segura de IA

La funcion vive en:

```text
supabase/functions/clinical-ai/index.ts
```

Configurar secretos en Supabase, no en el frontend:

```text
ANTHROPIC_API_KEY
CLAUDE_MODEL
SUPABASE_SERVICE_ROLE_KEY
APP_ORIGIN
ENVIRONMENT
```

`CLAUDE_MODEL` puede quedar como opcional si se usa el valor default definido en la funcion.
`APP_ORIGIN` debe contener el dominio de la app en produccion. Ejemplo:
`https://app.fisioself.com`.

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
APP_ORIGIN
ENVIRONMENT
```

La app usa el scope:

```text
https://www.googleapis.com/auth/calendar.events
```

Solo usuarios con rol `admin` o `therapist` deben conectar y sincronizar Google Calendar.
Para limpiar states OAuth antiguos desde un contexto seguro con service role:

```sql
select public.cleanup_google_oauth_states();
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
VITE_CLAUDE_PROXY_URL
VITE_GOOGLE_CALENDAR_CONNECT_URL
VITE_GOOGLE_CALENDAR_SYNC_URL
```

`VITE_CLAUDE_PROXY_URL` debe apuntar a la URL publica de la Supabase Edge Function `clinical-ai`.

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
- Solo `admin` y `therapist` pueden conectar/sincronizar Google Calendar.
- RLS debe permanecer habilitado.
- La app requiere usuarios autenticados.
- Las Edge Functions deben validar JWT Supabase y usar `APP_ORIGIN` para CORS.
- `session_notes` tiene indice unico por `patient_id` + `session_number`; corregir duplicados antes de aplicar la migracion si ya existen datos.
- `patients` y `therapists` quedan asociados a una clinica. Los datos clinicos se filtran por `clinic_memberships`.
- No usar datos reales hasta validar Auth, RLS, IA, Calendar y auditoria.
