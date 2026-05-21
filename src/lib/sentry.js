import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const ENVIRONMENT = import.meta.env.MODE;

export const isSentryConfigured = Boolean(SENTRY_DSN);

const PHI_KEY_PATTERN =
  /(email|phone|name|patient|note|diagnos|evaluation|address|birth|dob|password|token|secret|key)/i;

function scrubObject(value, depth = 0) {
  if (depth > 4 || value == null) return value;
  if (typeof value === 'string') return value.length > 200 ? '[redacted:long-string]' : value;
  if (Array.isArray(value)) return value.map((item) => scrubObject(item, depth + 1));
  if (typeof value !== 'object') return value;

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (PHI_KEY_PATTERN.test(key)) {
      out[key] = '[redacted:phi]';
    } else {
      out[key] = scrubObject(val, depth + 1);
    }
  }
  return out;
}

export function initSentry() {
  if (!isSentryConfigured) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: [
      Sentry.browserTracingIntegration({ enableInp: false }),
      Sentry.breadcrumbsIntegration({ console: false, dom: { serializeAttribute: 'data-sentry-id' } })
    ],
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        if (event.request.data) event.request.data = scrubObject(event.request.data);
        if (event.request.query_string) event.request.query_string = '[redacted]';
      }
      if (event.user) {
        event.user = { id: event.user.id };
      }
      if (event.extra) event.extra = scrubObject(event.extra);
      if (event.contexts) event.contexts = scrubObject(event.contexts);
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'ui.input') return null;
      if (breadcrumb.data) breadcrumb.data = scrubObject(breadcrumb.data);
      return breadcrumb;
    }
  });
}

export function reportError(error, context) {
  if (!isSentryConfigured) return;
  Sentry.captureException(error, context ? { extra: scrubObject(context) } : undefined);
}
