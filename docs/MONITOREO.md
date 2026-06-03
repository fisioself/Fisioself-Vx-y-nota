# Monitoreo de disponibilidad (uptime)

Objetivo: enterarnos **antes que los usuarios** si la app deja de responder.
Para una clínica pequeña basta con un monitor externo gratuito que revise la
URL cada pocos minutos y avise por correo si se cae.

## Opción recomendada: UptimeRobot (gratis)

[UptimeRobot](https://uptimerobot.com) ofrece 50 monitores gratis con chequeos
cada 5 minutos. No requiere tarjeta.

### Configuración (5 minutos)

1. Crea una cuenta en https://uptimerobot.com con el correo de la clínica.
2. **Add New Monitor**:
   - **Monitor Type**: `HTTPS`
   - **Friendly Name**: `Fisioself App`
   - **URL**: la URL de producción (la misma del deploy en Vercel).
   - **Monitoring Interval**: `5 minutes`
3. En **Alert Contacts**, agrega el correo (y opcionalmente un teléfono para
   SMS/WhatsApp si lo activas) donde quieres recibir los avisos.
4. Guarda. UptimeRobot empezará a vigilar la URL.

### Qué vigilar

- **App principal** (URL de Vercel): que cargue la página.
- _(Opcional)_ Un **endpoint de salud** de Supabase o de una Edge Function, si
  más adelante se expone uno.

### Cuando llega una alerta

1. Abre la URL en el navegador para confirmar la caída.
2. Revisa el estado del deploy en **Vercel** y de la base en **Supabase**
   (dashboard → Project → Health).
3. Si es Vercel: revisa el último deploy (puede que un cambio rompiera el
   build); se puede **revertir** al deploy anterior desde Vercel.
4. Si es Supabase: revisa **Logs** y **Advisors** en el dashboard.

## Alternativas

- **Better Stack (Better Uptime)**: plan gratuito con página de estado pública.
- **Cron-job.org**: gratis, útil si solo quieres "pingear" una URL.

## Nota

El monitoreo externo **no** sustituye a los **backups** (ver `BACKUPS.md`) ni a
los **Advisors** de Supabase: cada uno cubre un riesgo distinto
(disponibilidad, pérdida de datos, y seguridad/configuración respectivamente).
