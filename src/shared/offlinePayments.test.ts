import { describe, expect, it, beforeEach } from 'vitest';
import { offlinePayments, type ChargeInput } from './offlinePayments';

const makeInput = (over: Partial<ChargeInput> = {}): ChargeInput => ({
  appointmentId: over.appointmentId ?? 'appt-1',
  patientId: over.patientId ?? 'p1',
  usePackage: false,
  amount: 350,
  method: 'efectivo',
  ...over
});

describe('offlinePayments outbox', () => {
  beforeEach(() => localStorage.clear());

  it('encola y cuenta cobros', () => {
    expect(offlinePayments.count()).toBe(0);
    offlinePayments.enqueue(makeInput(), 'Juan');
    expect(offlinePayments.count()).toBe(1);
    expect(offlinePayments.all()[0].patientName).toBe('Juan');
  });

  it('detecta si una cita ya tiene cobro en cola (anti-doble)', () => {
    offlinePayments.enqueue(makeInput({ appointmentId: 'a1' }));
    expect(offlinePayments.hasForAppointment('a1')).toBe(true);
    expect(offlinePayments.hasForAppointment('a2')).toBe(false);
  });

  it('remove quita por outboxId', () => {
    offlinePayments.enqueue(makeInput());
    const op = offlinePayments.all()[0];
    offlinePayments.remove(op.outboxId);
    expect(offlinePayments.count()).toBe(0);
  });

  it('clearAll vacía la cola (logout)', () => {
    offlinePayments.enqueue(makeInput({ appointmentId: 'a1' }));
    offlinePayments.enqueue(makeInput({ appointmentId: 'a2' }));
    offlinePayments.clearAll();
    expect(offlinePayments.count()).toBe(0);
  });

  it('notifica a los suscriptores', () => {
    let calls = 0;
    const unsub = offlinePayments.subscribe(() => (calls += 1));
    offlinePayments.enqueue(makeInput());
    expect(calls).toBe(1);
    unsub();
    offlinePayments.enqueue(makeInput());
    expect(calls).toBe(1);
  });

  it('sobrevive a JSON corrupto', () => {
    localStorage.setItem('fisioself-offline-payments', 'no-json{');
    expect(offlinePayments.all()).toEqual([]);
  });
});
