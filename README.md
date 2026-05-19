# FISIOSELF App Notas VX

Aplicacion clinica privada para notas, valoraciones y expediente del paciente.

Este repositorio es independiente de la web publica.

## Stack

- React + Vite
- Supabase Auth
- Supabase Postgres
- Row Level Security
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
```

`VITE_CLAUDE_PROXY_URL` es opcional hasta conectar el proxy seguro de IA.

## Desarrollo local

```bash
npm install
npm run dev
```

## Supabase

1. Crear proyecto en Supabase.
2. Ejecutar `supabase/migrations/001_initial_schema.sql`.
3. Crear usuarios en Supabase Auth.
4. Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

## Seguridad

- RLS habilitado en tablas clinicas.
- Solo usuarios autenticados pueden leer y escribir datos clinicos.
- Validacion de paciente y nota en cliente.
- La IA no debe usar API keys en frontend; debe conectarse por proxy seguro.
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
