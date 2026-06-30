# FISIOSELF App Notas VX

Aplicacion clinica privada para notas, valoraciones, citas y expediente del paciente.

Este repositorio es independiente de la web publica.

## Stack

- React + TypeScript + Vite, **PWA** (instalable, service worker, funciona sin conexión)
- TanStack Query v5 (estado de servidor + caché persistido en IndexedDB)
- Supabase Auth (con 2FA TOTP opcional y captcha Turnstile)
- Supabase Postgres con **Row Level Security**
- Aislamiento por clinica mediante `clinics` + `clinic_memberships`
- Dictado por voz con **Whisper** (Edge Function `whisper-transcribe`)
- IA clinica mediante Supabase Edge Function segura (`clinical-ai`)
- Google Calendar mediante OAuth y Edge Functions
- Notificaciones push (Web Push / VAPID)
- Observabilidad: Sentry + PostHog

## Arquitectura

Regla de dependencias: **UI → services → lib → Supabase** (lo de abajo nunca
importa lo de arriba). Ver `CLAUDE.md` para el detalle por capa.

```text
src/
|-- app/          Shell: providers, PWA, estado online, ErrorBoundary
|-- features/     Un slice por dominio (appointments, patients, finance, ...)
|-- components/   UI compartida y presentacional
|-- services/     Capa de datos: toda lectura/escritura a Supabase y APIs
|-- shared/       Utilidades y hooks sin dependencia de features
|-- lib/          Singletons de terceros (supabaseClient, sentry, analytics)
|-- types/        Tipos compartidos (clinical.ts; supabase.ts es generado)
`-- test/

supabase/
|-- functions/    Edge Functions (Deno): clinical-ai, whisper-transcribe, calendar, push
`-- migrations/   SQL versionado

docs/
```

## Variables de entorno

Configurar en local y en deploy.

Requeridas:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_AI_PROXY_URL=                  # URL de la Edge Function clinical-ai
```

Opcionales (según las funciones que actives):

```text
VITE_GOOGLE_CALENDAR_CONNECT_URL=  # OAuth de Google Calendar
VITE_GOOGLE_CALENDAR_SYNC_URL=     # subir citas a Google
VITE_GOOGLE_CALENDAR_FETCH_URL=    # importar eventos de Google
VITE_VAPID_PUBLIC_KEY=             # notificaciones push (Web Push)
VITE_TURNSTILE_SITE_KEY=           # captcha Cloudflare Turnstile en el login
VITE_SENTRY_DSN=                   # reporte de errores (Sentry)
VITE_POSTHOG_KEY=                  # analítica de producto (PostHog)
```

Los secretos del lado servidor (GROQ_API_KEY, GROQ_MODEL, APP_ORIGIN, claves de
Google, VAPID privada, etc.) se configuran como **secrets de las Edge Functions**
en Supabase, no aquí.

## Desarrollo local

```bash
npm install
npm run dev
```

## Supabase

1. Crear proyecto en Supabase.
2. Aplicar **todas** las migraciones de `supabase/migrations` en orden de nombre
   de archivo (primero las `00X_*`, luego las `20260..._*`). Con el CLI:

   ```bash
   supabase db push
   ```

   El repo tiene decenas de migraciones (esquema, RLS, finanzas, auditoría,
   calendario, IA, limpieza). No las apliques sueltas: el orden importa.

3. Desplegar las Edge Functions de `supabase/functions` (`clinical-ai`,
   `whisper-transcribe`, calendario, push) y configurar sus **secrets**.
4. Crear usuarios en Supabase Auth.
5. Crear `profiles` y `clinic_memberships` activos para cada usuario.
6. Configurar las variables `VITE_*` en el deploy.

## Seguridad

- RLS habilitado en tablas clinicas.
- Los expedientes quedan separados por clinica/sede con `clinics` y `clinic_memberships`.
- La funcion `clinical-ai` valida membresia activa antes de enviar texto clinico al proveedor externo.
- Google Calendar recibe eventos sin PHI: titulo generico `Cita Fisioself` y descripcion `Ver detalles en Fisioself.`.
- La auditoria clinica critica se registra con triggers SQL en `audit_log`, no desde el navegador.
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
