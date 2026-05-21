import { afterEach, describe, expect, it } from 'vitest';
import { consent, CONSENT_KEYS } from './consent.js';

afterEach(() => {
  consent.revoke(CONSENT_KEYS.DICTATION);
  consent.revoke(CONSENT_KEYS.AI);
});

describe('consent', () => {
  it('returns false for a key that has never been granted', () => {
    expect(consent.has(CONSENT_KEYS.DICTATION)).toBe(false);
  });

  it('grant and has round-trip a single key', () => {
    consent.grant(CONSENT_KEYS.DICTATION);
    expect(consent.has(CONSENT_KEYS.DICTATION)).toBe(true);
    expect(consent.has(CONSENT_KEYS.AI)).toBe(false);
  });

  it('revoke clears a granted consent', () => {
    consent.grant(CONSENT_KEYS.AI);
    consent.revoke(CONSENT_KEYS.AI);
    expect(consent.has(CONSENT_KEYS.AI)).toBe(false);
  });

  it('namespaces keys under fisioself.consent. so it does not collide with drafts', () => {
    consent.grant(CONSENT_KEYS.DICTATION);
    expect(window.localStorage.getItem('fisioself.consent.dictation.v1')).toBe('granted');
  });
});
