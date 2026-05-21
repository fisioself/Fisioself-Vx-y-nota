import { describe, expect, it } from 'vitest';
import { draftStorage, getDraftKey } from './draftStorage.js';

describe('draftStorage', () => {
  it('builds stable draft keys per patient and session', () => {
    expect(getDraftKey({ patientId: 'patient-1', sessionNumber: 3 })).toBe(
      'fisioself.notas-vx.draft.patient-1.3'
    );
  });

  it('stores, reads and removes local drafts', () => {
    const key = getDraftKey({ patientId: 'patient-1', sessionNumber: 1 });

    draftStorage.set(key, 'nota borrador');
    expect(draftStorage.get(key)).toBe('nota borrador');

    draftStorage.remove(key);
    expect(draftStorage.get(key)).toBe('');
  });

  it('removes a draft when setting an empty value', () => {
    const key = getDraftKey({ patientId: 'patient-2', sessionNumber: 1 });

    draftStorage.set(key, 'contenido');
    draftStorage.set(key, '');

    expect(draftStorage.get(key)).toBe('');
  });

  it('clearAll wipes every draft but leaves unrelated keys intact', () => {
    const draftA = getDraftKey({ patientId: 'patient-a', sessionNumber: 1 });
    const draftB = getDraftKey({ patientId: 'patient-b', sessionNumber: 2 });
    draftStorage.set(draftA, 'PHI A');
    draftStorage.set(draftB, 'PHI B');
    window.localStorage.setItem('unrelated.key', 'preserve me');

    draftStorage.clearAll();

    expect(draftStorage.get(draftA)).toBe('');
    expect(draftStorage.get(draftB)).toBe('');
    expect(window.localStorage.getItem('unrelated.key')).toBe('preserve me');

    window.localStorage.removeItem('unrelated.key');
  });
});
