import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
  breadcrumbsIntegration: vi.fn(() => ({ name: 'Breadcrumbs' }))
}));

async function loadSentryModule(dsn) {
  vi.resetModules();
  vi.stubEnv('VITE_SENTRY_DSN', dsn);
  const module = await import('./sentry.js');
  const sentry = await import('@sentry/react');
  return { module, sentry };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('sentry', () => {
  it('does not initialise without a DSN', async () => {
    const { module, sentry } = await loadSentryModule('');
    module.initSentry();
    expect(module.isSentryConfigured).toBe(false);
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('initialises with PHI-safe defaults when a DSN is present', async () => {
    const { module, sentry } = await loadSentryModule('https://key@example.ingest.sentry.io/1');
    module.initSentry();
    expect(module.isSentryConfigured).toBe(true);
    expect(sentry.init).toHaveBeenCalledTimes(1);

    const config = sentry.init.mock.calls[0][0];
    expect(config.sendDefaultPii).toBe(false);
    expect(config.tracesSampleRate).toBe(0);
    expect(config.replaysSessionSampleRate).toBe(0);
    expect(typeof config.beforeSend).toBe('function');
    expect(typeof config.beforeBreadcrumb).toBe('function');
  });

  it('redacts PHI-like fields and drops cookies/headers in beforeSend', async () => {
    const { module, sentry } = await loadSentryModule('https://key@example.ingest.sentry.io/1');
    module.initSentry();
    const { beforeSend } = sentry.init.mock.calls[0][0];

    const event = {
      request: {
        cookies: 'session=abc',
        headers: { Authorization: 'Bearer x' },
        data: { patient_name: 'Ana Lopez', payload: { email: 'a@b.com', ok: true } },
        query_string: 'q=secret'
      },
      user: { id: 'u1', email: 'a@b.com', ip_address: '1.2.3.4' },
      extra: { diagnosis: 'cervicalgia', count: 3 }
    };

    const result = beforeSend(event);
    expect(result.request.cookies).toBeUndefined();
    expect(result.request.headers).toBeUndefined();
    expect(result.request.query_string).toBe('[redacted]');
    expect(result.request.data.patient_name).toBe('[redacted:phi]');
    expect(result.request.data.payload.email).toBe('[redacted:phi]');
    expect(result.request.data.payload.ok).toBe(true);
    expect(result.user).toEqual({ id: 'u1' });
    expect(result.extra.diagnosis).toBe('[redacted:phi]');
    expect(result.extra.count).toBe(3);
  });

  it('drops ui.input breadcrumbs so typed PHI never leaves the browser', async () => {
    const { module, sentry } = await loadSentryModule('https://key@example.ingest.sentry.io/1');
    module.initSentry();
    const { beforeBreadcrumb } = sentry.init.mock.calls[0][0];
    expect(beforeBreadcrumb({ category: 'ui.input', message: 'something' })).toBeNull();
    expect(beforeBreadcrumb({ category: 'ui.click', message: 'btn' })).not.toBeNull();
  });

  it('reportError is a no-op without a DSN', async () => {
    const { module, sentry } = await loadSentryModule('');
    module.reportError(new Error('boom'));
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('reportError forwards scrubbed extras when configured', async () => {
    const { module, sentry } = await loadSentryModule('https://key@example.ingest.sentry.io/1');
    module.initSentry();
    module.reportError(new Error('boom'), { patient_id: 'p1', step: 'save' });
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    const [, options] = sentry.captureException.mock.calls[0];
    expect(options.extra.patient_id).toBe('[redacted:phi]');
    expect(options.extra.step).toBe('save');
  });
});
