# FISIOSELF App Notas VX

Aplicacion clinica privada para notas, valoraciones, citas y expediente del paciente.

Este repositorio es independiente de la web publica.

## Stack

- React + Vite
- Supabase Auth
- Supabase Postgres
- Row Level Security
- Aislamiento por clinica mediante `clinic_memberships`
- Dictado por voz con Web Speech API
- IA clinica mediante Supabase Edge Function segura
- Google Calendar mediante OAuth y Edge Functions

## Arquitectura

```text
src/
|-- app/
|-- features/
|   |-- appointments/
|   |-- auth/
|   |-- evaluations/
|   |-- patients/
|   `-- session-notes/
|-- lib/
|-- services/
|-- shared/
`-- test/

supabase/
|-- functions/
`-- migrations/

docs/
```

## Variables de entorno

Configurar en local y en deploy:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_CLAUDE_PROXY_URL=
VITE_GOOGLE_CALENDAR_CONNECT_URL=
VITE_GOOGLE_CALENDAR_SYNC_URL=
```

`VITE_CLAUDE_PROXY_URL` debe apuntar a la Edge Function `clinical-ai`.

## Desarrollo local

```bash
npm install
npm run dev
```

## Supabase

1. Crear proyecto en Supabase.
2. Ejecutar las migraciones de `supabase/migrations` en este orden:

```text
001_initial_schema.sql
002_roles_rls_hardening.sql
003_google_calendar.sql
004_google_oauth_states.sql
005_google_oauth_token_hardening.sql
006_session_number_integrity.sql
007_clinic_tenancy_hardening.sql
008_google_oauth_state_cleanup.sql
```

3. Crear usuarios en Supabase Auth.
4. Crear `profiles` y `clinic_memberships` activos para cada usuario.
5. Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

## Seguridad

- RLS habilitado en tablas clinicas.
- Solo usuarios autenticados pueden leer y escribir datos clinicos.
- Los expedientes quedan separados por clinica/sede con `clinics` y `clinic_memberships`.
- Validacion de paciente y nota en cliente.
- La IA no usa API keys en frontend y la Edge Function valida JWT Supabase.
- Google Calendar guarda tokens solo desde Edge Functions con service role.
- Google Calendar solo puede conectarse/sincronizarse por usuarios `admin` o `therapist`.
- Configurar `APP_ORIGIN` en Edge Functions para cerrar CORS en produccion.
- Las notas de sesion tienen integridad por paciente y numero de sesion.
- Este repo no usa Notion.

## Calidad

```bash
npm run format:check
npm run lint
npm run test:coverage
npm run build
npm run quality
```

## Deploy

Preparado para Vercel como proyecto independiente.

Build command:

```bash
npm run build
```

Output directory:

```text
dist
```

## Documentacion

- [Deploy](./DEPLOYMENT.md)
- [Seguridad](./SECURITY.md)
- [Auditoria de seguridad](./SECURITY_AUDIT.md)
- [Plan de pruebas de seguridad](./SECURITY_TEST_PLAN.md)
