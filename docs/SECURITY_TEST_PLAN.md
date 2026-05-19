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

Casos esperados:

- Usuario sin profile no debe leer datos clinicos.
- Usuario inactive no debe leer datos clinicos.
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

## 3. Google Calendar OAuth

Casos:

- No iniciar OAuth sin sesion Supabase.
- State expira despues de 10 minutos.
- State usado no puede reutilizarse.
- Callback sin code/state falla.
- Sync sin conexion Google falla de forma controlada.
- Sync con cita `disabled` no intenta llamar Google.
- Error de Google deja `sync_status = failed` y `sync_error`.

## 4. IA clinica

Casos:

- No enviar IA sin texto.
- Tipo de IA invalido falla.
- IA trazable exige validacion clinica en modal.
- Uso de IA queda en `ai_consults`.
- Rate limit responde 429 si se excede.
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

## Go / No-Go para datos reales

No usar datos reales hasta cumplir:

- CI verde.
- RLS probado con perfiles reales.
- OAuth Google probado en entorno staging.
- APP_ORIGIN configurado en Edge Functions.
- Tokens Google no legibles por frontend.
- MFA activado para admin.
- Backups y plan de baja/exportacion definidos.
