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
  raw_text: over.raw_text ?? 'Nota offline',
  ...over
});

describe('offlineNotes outbox — crear/editar/borrar', () => {
  beforeEach(() => localStorage.clear());

  it('encola creaciones y las expone como pendientes por paciente', () => {
    offlineNotes.enqueueCreate(makeNote({ patient_id: 'p1' }));
    offlineNotes.enqueueCreate(makeNote({ patient_id: 'p2' }));
    expect(offlineNotes.count()).toBe(2);
    const p1 = offlineNotes.pendingCreates('p1');
    expect(p1).toHaveLength(1);
    expect(p1[0]._pending).toBe(true);
    expect(p1[0].created_at).toBeTruthy();
  });

  it('editar una creación aún no subida actualiza el create en lugar de añadir update', () => {
    const note = makeNote({ id: 'n1', raw_text: 'v1' });
    offlineNotes.enqueueCreate(note);
    offlineNotes.enqueueUpdate({ ...note, raw_text: 'v2' });
    expect(offlineNotes.count()).toBe(1); // sigue siendo solo el create
    expect(offlineNotes.pendingCreates('p1')[0].raw_text).toBe('v2');
  });

  it('editar una nota del servidor registra un update (coalesce del más reciente)', () => {
    const note = makeNote({ id: 'srv1' });
    offlineNotes.enqueueUpdate({ ...note, raw_text: 'edit1' });
    offlineNotes.enqueueUpdate({ ...note, raw_text: 'edit2' });
    expect(offlineNotes.count()).toBe(1);
    expect(offlineNotes.pendingUpdates('p1').get('srv1')?.raw_text).toBe('edit2');
  });

  it('borrar una creación en cola la elimina sin dejar delete', () => {
    const note = makeNote({ id: 'n1' });
    offlineNotes.enqueueCreate(note);
    offlineNotes.enqueueDelete('n1', 'p1');
    expect(offlineNotes.count()).toBe(0);
    expect(offlineNotes.pendingDeletes('p1').has('n1')).toBe(false);
  });

  it('borrar una nota del servidor encola un delete (y descarta updates previos)', () => {
    const note = makeNote({ id: 'srv1' });
    offlineNotes.enqueueUpdate({ ...note, raw_text: 'edit' });
    offlineNotes.enqueueDelete('srv1', 'p1');
    expect(offlineNotes.pendingUpdates('p1').has('srv1')).toBe(false);
    expect(offlineNotes.pendingDeletes('p1').has('srv1')).toBe(true);
    expect(offlineNotes.count()).toBe(1);
  });

  it('removeForNote descarta todas las ops de una nota', () => {
    offlineNotes.enqueueCreate(makeNote({ id: 'n1' }));
    offlineNotes.removeForNote('n1');
    expect(offlineNotes.count()).toBe(0);
  });

  it('remove(outboxId) quita una entrada concreta tras sincronizar', () => {
    offlineNotes.enqueueCreate(makeNote({ id: 'n1' }));
    const op = offlineNotes.all()[0];
    offlineNotes.remove(op.outboxId);
    expect(offlineNotes.count()).toBe(0);
  });

  it('clearAll vacía la cola (logout)', () => {
    offlineNotes.enqueueCreate(makeNote({ patient_id: 'p1' }));
    offlineNotes.enqueueCreate(makeNote({ patient_id: 'p2' }));
    offlineNotes.clearAll();
    expect(offlineNotes.count()).toBe(0);
  });

  it('notifica a los suscriptores al cambiar la cola', () => {
    let calls = 0;
    const unsub = offlineNotes.subscribe(() => (calls += 1));
    offlineNotes.enqueueCreate(makeNote());
    expect(calls).toBe(1);
    unsub();
    offlineNotes.enqueueCreate(makeNote());
    expect(calls).toBe(1);
  });

  it('sobrevive a JSON corrupto en localStorage', () => {
    localStorage.setItem('fisioself-offline-notes', '{no es json');
    expect(offlineNotes.all()).toEqual([]);
    expect(offlineNotes.count()).toBe(0);
  });
});
