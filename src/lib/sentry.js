// Sentry is loaded lazily so the ~45 KB gzip SDK only ships when a DSN is set.
// Without VITE_SENTRY_DSN nothing is imported, initSentry() is a no-op and
// reportError() drops calls on the floor.

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

function buildSentryConfig(Sentry) {
  return {
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: [
      Sentry.browserTracingIntegration({ enableInp: false }),
      Sentry.breadcrumbsIntegration({
        console: false,
        dom: { serializeAttribute: 'data-sentry-id' }
      })
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
  };
}

let sentryModulePromise = null;
let sentryReady = null;

function loadSentry() {
  if (!sentryModulePromise) {
    sentryModulePromise = import('@sentry/react');
  }
  return sentryModulePromise;
}

export function initSentry() {
  if (!isSentryConfigured) return;
  sentryReady = loadSentry().then((Sentry) => {
    Sentry.init(buildSentryConfig(Sentry));
    return Sentry;
  });
}

export function reportError(error, context) {
  if (!isSentryConfigured) return;
  // initSentry() was either already called or will be soon. Either way, queue
  // the report on the loader promise so we never miss an error that fires
  // during boot.
  (sentryReady || loadSentry()).then((Sentry) => {
    Sentry.captureException(error, context ? { extra: scrubObject(context) } : undefined);
  });
}

// Test-only hook to reset internal state between cases. Not part of the public
// surface; if you find yourself reaching for it in app code, that is a smell.
export function __resetSentryForTests() {
  sentryModulePromise = null;
  sentryReady = null;
}
