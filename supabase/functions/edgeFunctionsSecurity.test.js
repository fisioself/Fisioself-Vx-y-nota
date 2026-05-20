import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFile(resolve(root, path), 'utf8');

describe('edge function security regressions', () => {
  it('does not send patient PHI to Google Calendar events', async () => {
    const source = await read('supabase/functions/google-calendar-sync/index.ts');
    const payload = source.slice(
      source.indexOf('const eventPayload'),
      source.indexOf('const calendarId')
    );

    expect(source).not.toContain('patients(full_name');
    expect(source).toContain("const SAFE_EVENT_SUMMARY = 'Cita Fisioself'");
    expect(source).toContain("const SAFE_EVENT_DESCRIPTION = 'Ver detalles en Fisioself.'");
    expect(payload).toContain('summary: SAFE_EVENT_SUMMARY');
    expect(payload).toContain('description: SAFE_EVENT_DESCRIPTION');
    expect(payload).not.toMatch(/patient|full_name|phone|email|diagnosis|diagnostico|notes/i);
  });

  it('sanitizes raw provider errors in Calendar and clinical AI functions', async () => {
    const files = await Promise.all([
      read('supabase/functions/google-calendar-sync/index.ts'),
      read('supabase/functions/google-calendar-connect/index.ts'),
      read('supabase/functions/google-calendar-callback/index.ts'),
      read('supabase/functions/clinical-ai/index.ts')
    ]);

    for (const source of files) {
      expect(source).not.toMatch(/error instanceof Error \? error\.message/);
      expect(source).not.toMatch(/error_description \|\| tokenData\.error/);
      expect(source).not.toMatch(/data\?\.error\?\.message \|\|/);
    }
  });

  it('requires active clinic membership before clinical AI provider calls', async () => {
    const source = await read('supabase/functions/clinical-ai/index.ts');
    const membershipCheck = source.indexOf(".from('clinic_memberships')");
    const providerCall = source.indexOf("fetch('https://api.anthropic.com/v1/messages'");

    expect(membershipCheck).toBeGreaterThan(-1);
    expect(source).toContain(".eq('active', true)");
    expect(membershipCheck).toBeLessThan(providerCall);
  });

  it('keeps clinical audit writes out of browser API code', async () => {
    const source = await read('src/services/clinicalApi.js');

    expect(source).not.toContain("from('audit_log')");
    expect(source).not.toContain('before_json');
    expect(source).not.toContain('after_json');
  });
});
