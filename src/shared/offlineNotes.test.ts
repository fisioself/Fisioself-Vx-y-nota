import { describe, expect, it, beforeEach } from 'vitest';
import { offlineNotes } from './offlineNotes';
import type { SessionNote } from '../types/clinical';

const makeNote = (over: Partial<SessionNote> = {}): SessionNote => ({
  id: over.id ?? crypto.randomUUID(),
  patient_id: over.patient_id ?? 'p1',
  therapist_id: null,
  session_number: over.session_number ?? 1,
  session_date: '2026-06-28',
  eva: 3,
  raw_text: 'Nota offline',
  ...over
});

describe('offlineNotes outbox', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('encola y cuenta notas', () => {
    expect(offlineNotes.count()).toBe(0);
    offlineNotes.enqueue(makeNote());
    offlineNotes.enqueue(makeNote());
    expect(offlineNotes.count()).toBe(2);
  });

  it('filtra por paciente y marca _pending con created_at', () => {
    offlineNotes.enqueue(makeNote({ patient_id: 'p1' }));
    offlineNotes.enqueue(makeNote({ patient_id: 'p2' }));
    const p1 = offlineNotes.forPatient('p1');
    expect(p1).toHaveLength(1);
    expect(p1[0]._pending).toBe(true);
    expect(p1[0].created_at).toBeTruthy();
    expect(offlineNotes.forPatient('p2')).toHaveLength(1);
  });

  it('elimina por outboxId (= note.id)', () => {
    const note = makeNote();
    offlineNotes.enqueue(note);
    expect(offlineNotes.count()).toBe(1);
    offlineNotes.remove(note.id);
    expect(offlineNotes.count()).toBe(0);
  });

  it('notifica a los suscriptores al cambiar la cola', () => {
    let calls = 0;
    const unsub = offlineNotes.subscribe(() => {
      calls += 1;
    });
    offlineNotes.enqueue(makeNote());
    expect(calls).toBe(1);
    unsub();
    offlineNotes.enqueue(makeNote());
    expect(calls).toBe(1); // ya no escucha tras desuscribir
  });

  it('sobrevive a JSON corrupto en localStorage', () => {
    localStorage.setItem('fisioself-offline-notes', '{no es json');
    expect(offlineNotes.all()).toEqual([]);
    expect(offlineNotes.count()).toBe(0);
  });
});
