# Deploy: Vercel + Supabase

## Objetivo

Desplegar FISIOSELF App Notas VX como aplicacion clinica privada independiente.

## 1. Supabase

1. Crear un proyecto nuevo en Supabase.
2. Ejecutar las migraciones en orden:

```text
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_roles_rls_hardening.sql
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

## 3. Vercel

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

## 4. Variables publicas en Vercel

Configurar en Vercel, no en el codigo:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_CLAUDE_PROXY_URL
```

`VITE_CLAUDE_PROXY_URL` debe apuntar a la URL publica de la Supabase Edge Function `clinical-ai`.

## 5. Verificacion

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

## 6. Notas de seguridad

- No guardar claves privadas en Vercel como variables expuestas al navegador.
- La clave de Claude solo vive como secret de Supabase Edge Function.
- RLS debe permanecer habilitado.
- La app requiere usuarios autenticados.
- No usar datos reales hasta validar Auth, RLS, IA y auditoria.
