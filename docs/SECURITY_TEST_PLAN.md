# Security Test Plan

## Objetivo

Validar que la app pueda manejar datos clinicos con controles minimos razonables antes de usar pacientes reales.

## 1. Supabase Auth

Probar usuarios:

- admin activo
- therapist activo
- assistant activo
- usuario sin profile
- usuario inactive
- usuario activo sin `clinic_memberships`
- usuarios activos en dos clinicas distintas

Casos esperados:

- Usuario sin profile no debe leer datos clinicos.
- Usuario inactive no debe leer datos clinicos.
- Usuario sin membresia activa no debe leer datos clinicos.
- Usuario de clinica A no debe leer pacientes/notas/citas de clinica B.
- Assistant puede leer pero no debe crear/editar datos clinicos sensibles.
- Therapist puede crear pacientes, notas, valoraciones y citas.
- Admin puede gestionar terapeutas.

## 2. RLS

Ejecutar pruebas desde Supabase SQL Editor usando JWTs o desde la app con usuarios reales.

Tablas criticas:

- patients
- session_notes
- evaluations
- appointments
- ai_consults
- audit_log
- calendar_connections

Verificaciones:

- No existen politicas DELETE para datos clinicos.
- `audit_log` solo es legible por admin.
- `calendar_connections` no expone tokens al frontend.
- `calendar_connection_status` solo expone metadata sin tokens.
- `patients.clinic_id` se asigna por default y filtra expedientes por membresia.
- Al crear/actualizar `profiles`, el trigger sincroniza `clinic_memberships` para la clinica default.
- Notas, valoraciones, citas, seguimientos e IA heredan acceso desde el paciente.

## 3. Google Calendar OAuth

Casos:

- No iniciar OAuth sin sesion Supabase.
- State expira despues de 10 minutos.
- State usado no puede reutilizarse.
- Callback sin code/state falla.
- Sync sin conexion Google falla de forma controlada.
- Sync con cita `disabled` no intenta llamar Google.
- Error de Google deja `sync_status = failed` y `sync_error`.
- Assistant no puede iniciar conexion ni sincronizar Google Calendar.
- `cleanup_google_oauth_states()` elimina states consumidos o expirados antiguos.
- El job `cleanup-google-oauth-states-daily` existe si `pg_cron` esta disponible.

## 4. IA clinica

Casos:

- No enviar IA sin texto.
- Tipo de IA invalido falla.
- IA trazable exige validacion clinica en modal.
- Uso de IA queda en `ai_consults`.
- Rate limit responde 429 si se excede.
- Rate limit persiste por usuario en `ai_rate_limits` aunque cambie la instancia Edge.
- API key de Claude no existe en frontend.

## 5. Frontend / navegador

Validar headers en produccion:

- Content-Security-Policy
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy
- Permissions-Policy
- Cross-Origin-Opener-Policy
- Cross-Origin-Resource-Policy

## 6. Exportaciones

Casos:

- Exportar TXT no debe fallar con datos vacios.
- Imprimir/PDF no debe ejecutar HTML del expediente.
- Exportaciones deben auditarse antes de datos reales.

## 7. CI

Debe pasar:

```text
npm run format:check
npm run lint
npm run test:coverage
npm run build
```

## 8. Edge Functions

Los tests de `src/services/edgeFunctionsSecurity.test.js` verifican contratos minimos de seguridad:

- `clinical-ai` exige Bearer token.
- `clinical-ai` usa `check_ai_rate_limit`.
- Google Calendar Connect no permite `assistant`.
- Google Calendar Sync valida `clinic_memberships` y rol `admin`/`therapist`.

## Go / No-Go para datos reales

No usar datos reales hasta cumplir:

- CI verde.
- RLS probado con perfiles reales.
- OAuth Google probado en entorno staging.
- APP_ORIGIN configurado en Edge Functions.
- Tokens Google no legibles por frontend.
- MFA activado para admin.
- Backups y plan de baja/exportacion definidos.
