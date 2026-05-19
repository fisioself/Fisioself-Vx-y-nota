# FISIOSELF App Notas VX

Aplicacion clinica privada para notas, valoraciones y expediente del paciente.

Este repositorio es independiente de la web publica.

## Stack

- React + Vite
- Supabase Auth
- Supabase Postgres
- Row Level Security
- Aislamiento por clinica mediante `clinic_memberships`
- Dictado por voz con Web Speech API
- IA clinica mediante proxy seguro configurable

## Arquitectura

```text
src/
├─ features/
│  ├─ auth/
│  ├─ patients/
│  └─ session-notes/
├─ services/
│  ├─ authService.js
│  ├─ clinicalApi.js
│  └─ aiService.js
├─ lib/
│  └─ supabaseClient.js
└─ shared/
   └─ clinicalValidation.js

supabase/
└─ migrations/
   └─ 001_initial_schema.sql
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

`VITE_CLAUDE_PROXY_URL` es opcional hasta conectar el proxy seguro de IA.

## Desarrollo local

```bash
npm install
npm run dev
```

## Supabase

1. Crear proyecto en Supabase.
2. Ejecutar las migraciones de `supabase/migrations` en orden.
3. Crear usuarios en Supabase Auth.
4. Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

## Seguridad

- RLS habilitado en tablas clinicas.
- Solo usuarios autenticados pueden leer y escribir datos clinicos.
- Los expedientes quedan separados por clinica/sede con `clinics` y `clinic_memberships`.
- Validacion de paciente y nota en cliente.
- La IA no usa API keys en frontend y la Edge Function debe validar JWT Supabase.
- Configurar `APP_ORIGIN` en Edge Functions para cerrar CORS en produccion.
- Las notas de sesion tienen integridad por paciente y numero de sesion.
- Este repo no usa Notion.

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
