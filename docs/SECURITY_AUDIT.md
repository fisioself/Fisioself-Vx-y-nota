# Auditoria de seguridad - FISIOSELF App Notas VX

Fecha: 2026-05-19

## Alcance

Revision de seguridad sobre:

- React/Vite frontend
- Supabase Auth
- Supabase RLS
- Supabase Edge Functions
- IA clinica
- Google Calendar OAuth
- Vercel deploy
- manejo de datos clinicos

## Hallazgos criticos / altos

### 1. Tokens de Google Calendar almacenados en texto plano

Estado actual:

- `calendar_connections.access_token`
- `calendar_connections.refresh_token`

Riesgo:

Si una key de servicio, backup o acceso administrativo se filtra, los tokens permitirian acceso a calendarios conectados.

Recomendacion:

- No exponer tabla al frontend.
- Restringir SELECT de tokens.
- Considerar cifrado con `pgsodium` o mover tokens a vault externo/secret manager.
- Separar metadata publica de secretos OAuth.

Prioridad: alta.

### 2. CORS abierto en Edge Functions

Estado actual:

Las Edge Functions deben usar allowlist por `APP_ORIGIN`. Revisar que todas las funciones nuevas importen `_shared/cors.ts`.

Riesgo:

Aunque se requiere token Supabase, CORS abierto aumenta superficie de abuso desde origenes no esperados.

Recomendacion:

- Usar allowlist por variable `APP_ORIGIN`.
- En desarrollo permitir localhost.
- En produccion permitir solo dominio Vercel/app oficial.

Prioridad: alta.

### 3. Multi-tenant / separacion por clinica

Estado actual:

La migracion `007_clinic_tenancy_hardening.sql` agrega `clinics`, `clinic_memberships`,
`clinic_id` en pacientes/terapeutas y politicas RLS por membresia.

Riesgo:

Si se agregan usuarios manualmente sin membresia activa, no podran operar datos clinicos.
Si se crean nuevas sedes, cada usuario debe quedar asociado explicitamente a su clinica.

Recomendacion:

- Mantener `clinic_memberships` actualizado junto con `profiles`.
- Probar RLS con usuarios de distintas clinicas antes de usar datos reales multi-sede.

Prioridad: operativa.

## Hallazgos medios

### 4. Falta rate limit persistente

La funcion de IA tiene rate limit en memoria. Es util pero no persistente entre instancias.

Recomendacion:

- Rate limit en tabla Supabase o proveedor externo.
- Registrar uso de IA por usuario.

Prioridad: media.

### 5. Falta auditoria completa de lectura

Se auditan eventos de creacion/edicion importantes, pero no lecturas de expediente.

Recomendacion:

- Auditar acciones sensibles: exportar expediente, imprimir/PDF, sincronizar Google, abrir datos completos.

Prioridad: media.

### 6. Falta expiracion/rotacion de sesiones documentada

Supabase maneja sesiones, pero falta politica operativa.

Recomendacion:

- Configurar expiracion razonable.
- Activar MFA si se usaran datos reales.
- Bloquear usuarios inactivos con `profiles.active = false`.

Prioridad: media.

### 7. Exportacion PDF/TXT sin registro de auditoria

Riesgo:

Exportar expediente es accion sensible.

Recomendacion:

- Registrar evento `record.exported` o `record.printed`.

Prioridad: media.

## Fortalezas actuales

- Repo separado de la web publica.
- Supabase Auth integrado.
- RLS habilitado.
- Politicas por rol iniciales.
- Sin delete policies fisicas.
- IA mediante Edge Function, no API key en frontend.
- IA trazable y validacion clinica obligatoria.
- Rate limit basico de IA.
- Headers de seguridad en Vercel.
- CSP inicial.
- GitHub Actions configurado.
- Tests unitarios y de UI iniciales.
- PWA/offline basico con borradores locales.

## Recomendacion ejecutiva

Antes de usar datos reales de pacientes:

1. Mantener CORS cerrado con allowlist.
2. Proteger tokens OAuth de Google.
3. Verificar `clinic_memberships` para cada usuario activo.
4. Ejecutar CI y corregir fallos.
5. Probar RLS con usuarios reales: admin, therapist, assistant, usuario inactivo.
6. Auditar exportaciones e impresiones.
7. Activar MFA para cuentas administrativas.
