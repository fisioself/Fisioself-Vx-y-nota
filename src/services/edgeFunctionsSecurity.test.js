import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = import.meta.dirname ? resolve(import.meta.dirname, '../..') : '.';
const read = (path) => readFileSync(resolve(root, path), 'utf8');

describe('Edge Function security contracts', () => {
  it('clinical-ai requires a bearer token, active clinical profile and persistent rate limit', () => {
    const source = read('supabase/functions/clinical-ai/index.ts');

    expect(source).toContain('getBearerToken(req)');
    expect(source).toContain("return json(req, 401, { error: 'Falta autorizacion' })");
    expect(source).toContain("return json(req, 403, { error: 'Usuario clinico no autorizado' })");
    expect(source).toContain("supabase.rpc('check_ai_rate_limit'");
    expect(source).toContain('return json(');
    expect(source).toContain('429');
    expect(source).not.toContain('new Map');
  });

  it('Google Calendar connect rejects assistants', () => {
    const source = read('supabase/functions/google-calendar-connect/index.ts');

    expect(source).toContain('getBearerToken(req)');
    expect(source).toContain("!['admin', 'therapist'].includes(profile.role)");
    expect(source).toContain('Solo admin o therapist pueden conectar Google Calendar');
    expect(source).not.toContain("'assistant'].includes(profile.role)");
  });

  it('Google Calendar sync enforces clinic membership and admin/therapist role', () => {
    const source = read('supabase/functions/google-calendar-sync/index.ts');

    expect(source).toContain('clinic_memberships');
    expect(source).toContain("!['admin', 'therapist'].includes(membership.role)");
    expect(source).toContain('No tienes permiso para sincronizar esta cita');
    expect(source).toContain(
      'patients(full_name, phone, email, medical_diagnosis, functional_diagnosis, clinic_id)'
    );
  });
});
