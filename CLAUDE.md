# CLAUDE.md — Guía del repositorio (Fisioself Vx)

App clínica privada (PWA) para notas, valoraciones, citas, finanzas y expediente
del paciente. Este archivo orienta a cualquier desarrollador o agente para no
perderse. **Léelo antes de tocar el código.**

## Stack

- **Frontend:** React 18 + TypeScript (strict) + Vite, PWA.
- **Datos:** Supabase (Auth, Postgres con RLS, Storage). Multi-clínica vía
  `clinic_memberships`.
- **Estado de servidor:** TanStack Query v5 (`useQuery`/`useMutation` + invalidación).
- **Edge Functions (Deno):** IA clínica (Groq), Google Calendar (OAuth), push,
  reporte financiero mensual, transcripción de voz.
- **Observabilidad:** Sentry + PostHog.

## Comandos

```bash
npm run dev         # desarrollo
npm run build       # vite build + estampa el service worker
npm test            # vitest run (suite unitaria)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm run quality     # typecheck + lint + test + build (corre esto antes de PR)
npm run e2e         # Playwright (e2e)
```

## Arquitectura por capas

Regla de oro de dependencias: **UI → services → lib → Supabase**. Lo de abajo
nunca importa lo de arriba.

```
src/
├── app/         Shell de la app: providers, ErrorBoundary, PWA (install/SW update),
│                estado online, y su CSS. Es el "marco", no lógica de negocio.
├── features/    Una carpeta por dominio (slice). UI + lógica de esa feature.
│   ├── appointments/  auth/  calendar/  dashboard/  evaluations/  finance/
│   ├── notifications/ patients/  search/  seguimientos/  session-notes/
├── components/  UI compartida y presentacional (AppLogo, DateField, Skeleton,
│                ConfirmDialog, BodyPainMap).
├── services/    CAPA DE DATOS: toda lectura/escritura a Supabase y APIs externas
│                (clinicalApi, financeApi, authService, aiService, calendarService,
│                documentsApi, pushService, seguimientosApi, sessionColors).
├── shared/      Utilidades y hooks sin dependencia de features (dateUtils, errors,
│                clinicalValidation, consent, draftStorage, exportClinicalRecord,
│                useRole, useShortcuts, useModalA11y, useDraftAutosave).
├── lib/         Singletons de terceros (supabaseClient, sentry, analytics, offlineSync).
├── types/       Tipos compartidos: clinical.ts (dominio) y supabase.ts (GENERADO).
├── test/        setup de vitest.
└── styles.css   Sistema de diseño global (tokens + componentes).

supabase/
├── functions/   Edge Functions (Deno). Se despliegan APARTE del frontend.
└── migrations/  SQL versionado.
```

### Reglas de estructura (¡mantenerlas!)

- **Las features NO se importan entre sí.** Lo compartido va a `components/`,
  `shared/` o `services/`. Única excepción: `features/calendar` es un
  **orquestador** (la agenda) y compone los modales de `finance` y
  `appointments`; no lo imites en otras features.
- **Solo `services/` habla con Supabase.** La UI llama a un service, no a
  `supabaseClient` directo (salvo casos muy puntuales ya existentes).
- **`types/supabase.ts` es generado** — no editar a mano; regenerar.
- **TypeScript siempre.** Archivos nuevos `.ts`/`.tsx`. Tests co-locados como
  `*.test.ts(x)` (vitest + Testing Library).

### Dónde agrego cada cosa

| Necesito…                  | Va en…               |
| -------------------------- | -------------------- |
| Una pantalla/feature nueva | `features/<nombre>/` |
| Una llamada nueva a la BD  | `services/<x>Api.ts` |
| Una utilidad reutilizable  | `shared/`            |
| Un componente UI genérico  | `components/`        |
| Un tipo de dominio         | `types/clinical.ts`  |
| Configurar un tercero      | `lib/`               |

## Flujo de datos

`Componente` → `useQuery/useMutation` (TanStack Query) → `services/*` →
`lib/supabaseClient` → Postgres (RLS). Las mutaciones invalidan las query keys
afectadas. Claves comunes: `['patients']` (`'today'`, `'search'`, `'deleted'`),
`['appointments']`, `['clinic-stats']`, `['finance-global']`, `['caja-payments']`,
`['patient-finance', id]`, `['seguimientos']`, `['calendar-connection']`.

## Flujo de trabajo (git / deploy)

- Desarrollar en rama de feature → PR → **squash merge** a `main`. **Nunca**
  push directo a `main`.
- **Vercel** auto-despliega el frontend al hacer merge a `main`.
- Las **Edge Functions se despliegan aparte** (Supabase CLI/MCP), NO con Vercel.
- Antes de abrir PR: `npm run quality`.

## ⚠️ Trampas / cosas no obvias (leer para no romper nada)

- **Tipos de IA en DOS lugares.** Para agregar una acción de IA hay que editar
  `src/services/aiService.ts` (`AI_TYPES`) **y** `supabase/functions/clinical-ai/index.ts`
  (`AI_TYPES` + `prompts`), **y desplegar** la función. Si no, responde 400
  "Tipo de IA invalido". La edge function es autocontenida (CORS en línea).

- **Naming legado en valoraciones (`EvaluationForm`).** El campo `prognosis`
  del formulario guarda en realidad el **diagnóstico fisioterapéutico**
  (→ `conclusion.diagnosis` y la columna `prognosis`). El **pronóstico** real
  (expectativa de recuperación) es `recovery_prognosis` → `conclusion.prognosis`.

- **Objetivos.** Campo unificado `conclusion.objectives`. Los antiguos
  `objectives_short/mid/long` solo se leen para valoraciones viejas (el resumen
  y el PDF hacen fallback).

- **Borrado de pacientes.**
  - `clinicalApi.deletePatient` = borrado **lógico** (RLS oculta `deleted_at`), vía RPC → va a la papelera.
  - `clinicalApi.purgePatient` = borrado **permanente** (política RLS admin, cascade).
  - Trigger de BD `appointments_cleanup_empty_patient`: al borrar una cita, si el
    paciente queda sin citas ni datos clínicos, se elimina solo (no-shows).

- **Sincronización de Google Calendar.** `google-calendar-fetch` crea un paciente
  por evento importado y borra citas huérfanas cuando el evento desaparece de
  Google (luego el trigger limpia el expediente vacío).

- **Exportación a PDF** (`shared/exportClinicalRecord.ts`, `finance/exportFinancePdf.ts`):
  abre una ventana y usa `window.print()`. `@page { margin: 0 }` es **intencional**:
  evita que el navegador imprima su encabezado/pie ("about:blank", fecha, nº de
  página); los márgenes los da el padding de `.wrap`. El PDF omite secciones/campos
  vacíos y muestra los textos largos como tarjetas conservando saltos de línea.

- **Tema fijo en claro** (App.tsx); no hay cambio de tema.

- **Service worker** se estampa en el build (`scripts/stamp-sw.mjs`).

- **Estilos**: usar los tokens de `:root` (CSS custom properties), no colores
  hardcodeados.

## Documentación adicional

`README.md` (setup/env) y `docs/` (BACKUPS, DEPLOYMENT, GUIA_EQUIPO, MONITOREO,
SECURITY, etc.).
