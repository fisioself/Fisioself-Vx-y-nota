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

Algunas Edge Functions usan `Access-Control-Allow-Origin: *`.

Riesgo:

Aunque se requiere token Supabase, CORS abierto aumenta superficie de abuso desde origenes no esperados.

Recomendacion:

- Usar allowlist por variable `APP_ORIGIN`.
- En desarrollo permitir localhost.
- En produccion permitir solo dominio Vercel/app oficial.

Prioridad: alta.

### 3. Multi-tenant / separacion por clinica no implementada

Estado actual:

RLS permite que usuarios clinicos activos lean datos clinicos en general. La funcion `clinical-ai` ya exige `clinic_memberships.active = true` antes de enviar texto clinico al proveedor externo, pero el modelo multi-tenant completo aun debe aterrizarse en todas las tablas clinicas.

Riesgo:

Si en el futuro hay mas terapeutas, sedes o cuentas separadas, todos los usuarios activos podrian leer toda la clinica.

Recomendacion:

- Crear `clinics` y `clinic_memberships`.
- Asociar pacientes/citas/notas a `clinic_id`.
- RLS por membresia.

Prioridad: alta antes de crecer a mas usuarios.

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
- IA bloqueada para usuarios sin membresia clinica activa.
- IA trazable y validacion clinica obligatoria.
- Rate limit basico de IA.
- Google Calendar recibe eventos sin PHI del paciente.
- Errores de Google Calendar e IA se devuelven sanitizados al usuario.
- Auditoria de inserts/updates clinicos movida a triggers SQL.
- Headers de seguridad en Vercel.
- CSP inicial.
- GitHub Actions configurado.
- Tests unitarios y de UI iniciales.
- PWA/offline basico con borradores locales.

## Recomendacion ejecutiva

Antes de usar datos reales de pacientes:

1. Cerrar CORS con allowlist.
2. Proteger tokens OAuth de Google.
3. Aplicar `010_clinical_audit_triggers.sql` junto con el flujo normal de despliegue.
4. Completar modelo `clinics`/`clinic_memberships` en tablas clinicas si habra mas de un usuario/sede.
5. Ejecutar CI y corregir fallos.
6. Probar RLS con usuarios reales: admin, therapist, assistant, usuario inactivo.
7. Auditar exportaciones e impresiones.
8. Activar MFA para cuentas administrativas.
