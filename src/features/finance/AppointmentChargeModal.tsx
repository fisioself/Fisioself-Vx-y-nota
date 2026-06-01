import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi, PAYMENT_METHODS, type PaymentMethod } from '../../services/financeApi';
import { clinicalApi } from '../../services/clinicalApi';
import { useToast } from '../../app/ToastProvider';
import { getErrorMessage } from '../../shared/errors';
import './AppointmentChargeModal.css';

const CARD_COMMISSION = 0.0406; // 4.06 % comisión terminal

const netAfterCommission = (gross: number) => Math.round(gross * (1 - CARD_COMMISSION) * 100) / 100;

export interface ChargeAppointmentTarget {
  id: string;
  patientId: string;
  patientName: string;
  sessionType: string | null;
  startsAt: string | null;
}

interface AppointmentChargeModalProps {
  appointment: ChargeAppointmentTarget | null;
  onClose: () => void;
  onViewPatient?: (patientId: string) => void;
}

const money = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

const cdmxLabel = (iso: string | null) => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return '';
  }
};

export function AppointmentChargeModal({
  appointment,
  onClose,
  onViewPatient
}: AppointmentChargeModalProps) {
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<'suelta' | 'paquete'>('suelta');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [packageId, setPackageId] = useState('');
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoMethod, setAbonoMethod] = useState<PaymentMethod>('efectivo');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Asignar paquete nuevo desde la agenda
  const [showAssign, setShowAssign] = useState(false);
  const [assignPkgId, setAssignPkgId] = useState('');
  const [assignAmount, setAssignAmount] = useState('');
  const [assignInitPay, setAssignInitPay] = useState('');
  const [assignInitMethod, setAssignInitMethod] = useState<PaymentMethod>('efectivo');
  const [assigning, setAssigning] = useState(false);

  // Nota de sesión desde la agenda
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteEva, setNoteEva] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const apptId = appointment?.id ?? '';
  const patientId = appointment?.patientId ?? '';

  const { data: existing = [] } = useQuery({
    queryKey: ['appt-charge', apptId],
    queryFn: () => financeApi.getAppointmentCharge(apptId),
    enabled: !!apptId
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['active-packages', patientId],
    queryFn: () => financeApi.listActivePatientPackages(patientId),
    enabled: !!patientId
  });

  const { data: suggested } = useQuery({
    queryKey: ['suggested-price', appointment?.sessionType ?? ''],
    queryFn: () => financeApi.suggestPriceForSessionType(appointment?.sessionType ?? null),
    enabled: !!appointment
  });

  const { data: sessionNum = 0 } = useQuery({
    queryKey: ['patient-session-count', patientId, appointment?.startsAt],
    queryFn: () => financeApi.getPatientSessionCount(patientId, appointment?.startsAt),
    enabled: !!patientId && !!appointment
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ['packages-catalog'],
    queryFn: () => financeApi.listPackages(),
    enabled: !!appointment
  });

  const { data: nextNoteNum = 1 } = useQuery({
    queryKey: ['next-session-number', patientId],
    queryFn: () => clinicalApi.getNextSessionNumber(patientId),
    enabled: !!patientId && showNote
  });

  // Resumen financiero del paciente: para mostrar, si tiene paquete, cuánto ha
  // pagado y cuánto debe directamente al abrir la cita desde la agenda.
  const { data: patientFinance } = useQuery({
    queryKey: ['patient-finance', patientId],
    queryFn: () => financeApi.getPatientFinance(patientId),
    enabled: !!patientId
  });

  // Al cambiar de cita, limpia el formulario para no arrastrar datos previos.
  useEffect(() => {
    setMode('suelta');
    setAmount('');
    setMethod('efectivo');
    setPackageId('');
    setAbonoAmount('');
    setError('');
    setShowAssign(false);
    setAssignPkgId('');
    setAssignAmount('');
    setAssignInitPay('');
    setShowNote(false);
    setNoteText('');
    setNoteEva('');
    setNoteSaved(false);
  }, [apptId]);

  // Prefill del monto sugerido y selección del primer paquete disponible.
  useEffect(() => {
    if (suggested != null && amount === '') setAmount(String(suggested));
  }, [suggested, amount]);
  useEffect(() => {
    if (packages.length && !packageId) setPackageId(packages[0].id);
  }, [packages, packageId]);

  if (!appointment) return null;

  const alreadyCharged = existing.length > 0;

  // Resumen por paquete: sesiones consumidas (cuentan hacia adelante conforme se
  // cobra "con paquete") y cuánto se ha abonado / falta de cada paquete.
  const packageInfos = (patientFinance?.packages ?? [])
    .map((pkg) => {
      const paid = (patientFinance?.payments ?? [])
        .filter((p) => p.patient_package_id === pkg.id)
        .reduce((acc, p) => acc + Number(p.amount ?? 0), 0);
      const total = Number(pkg.total_amount ?? 0);
      const usedSessions = Number(pkg.sessions_used ?? 0);
      const totalSessions = Number(pkg.sessions_total ?? 0);
      return {
        id: pkg.id,
        name: pkg.name,
        paid,
        total,
        balance: total - paid,
        usedSessions,
        totalSessions
      };
    })
    // Solo paquetes vigentes: con sesiones pendientes o saldo por cobrar.
    .filter((p) => p.usedSessions < p.totalSessions || p.balance > 0.01);

  const save = async () => {
    setError('');
    if (mode === 'suelta') {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        setError('Ingresa un monto mayor a $0.');
        return;
      }
    } else if (!packageId) {
      setError('Selecciona un paquete con sesiones disponibles.');
      return;
    }

    setSaving(true);
    try {
      // Con tarjeta se guarda el monto neto (descontada la comisión de la terminal).
      const grossSuelta = Number(amount);
      const grossAbono = Number(abonoAmount || 0);
      const netSuelta = method === 'tarjeta' ? netAfterCommission(grossSuelta) : grossSuelta;
      const netAbono = abonoMethod === 'tarjeta' ? netAfterCommission(grossAbono) : grossAbono;

      await financeApi.chargeAppointment({
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        usePackage: mode === 'paquete',
        patientPackageId: mode === 'paquete' ? packageId : null,
        amount: mode === 'suelta' ? netSuelta : netAbono,
        method: mode === 'suelta' ? method : abonoAmount ? abonoMethod : undefined
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['appt-charge', apptId] }),
        queryClient.invalidateQueries({ queryKey: ['active-packages', patientId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-global'] }),
        queryClient.invalidateQueries({ queryKey: ['caja-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['patient-finance', patientId] })
      ]);
      notify({ tone: 'success', message: 'Cobro registrado.' });
      onClose();
    } catch (err) {
      console.error('[AppointmentChargeModal] chargeAppointment failed:', err);
      const raw = err as Record<string, unknown>;
      const detail =
        (raw?.message as string) ||
        (raw?.details as string) ||
        (raw?.hint as string) ||
        JSON.stringify(raw);
      setError(`No se pudo registrar el cobro. ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  const undo = async (paymentId: string) => {
    const target = existing.find((p) => p.id === paymentId);
    if (!target) return;
    setSaving(true);
    setError('');
    try {
      await financeApi.deleteAppointmentCharge(target);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['appt-charge', apptId] }),
        queryClient.invalidateQueries({ queryKey: ['active-packages', patientId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-global'] }),
        queryClient.invalidateQueries({ queryKey: ['caja-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['patient-finance', patientId] })
      ]);
      notify({ tone: 'success', message: 'Cobro eliminado.' });
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo eliminar el cobro.'));
    } finally {
      setSaving(false);
    }
  };

  const chosenCatalog = catalog.find((c) => c.id === assignPkgId);

  const assignPackage = async () => {
    setError('');
    if (!chosenCatalog) {
      setError('Selecciona un paquete del catálogo.');
      return;
    }
    const totalAmount = assignAmount !== '' ? Number(assignAmount) : Number(chosenCatalog.price);
    const initAmt = assignInitPay !== '' ? Number(assignInitPay) : 0;
    setAssigning(true);
    try {
      const created = await financeApi.addPatientPackage({
        patientId,
        packageId: chosenCatalog.id,
        name: chosenCatalog.name,
        totalAmount,
        sessionsTotal: chosenCatalog.sessions_included
      });
      if (initAmt > 0) {
        const initNet = assignInitMethod === 'tarjeta' ? netAfterCommission(initAmt) : initAmt;
        await financeApi.addPayment({
          patientId,
          patientPackageId: created.id,
          amount: initNet,
          method: assignInitMethod
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['active-packages', patientId] }),
        queryClient.invalidateQueries({ queryKey: ['patient-finance', patientId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-global'] }),
        queryClient.invalidateQueries({ queryKey: ['caja-payments'] })
      ]);
      setAssignPkgId('');
      setAssignAmount('');
      setAssignInitPay('');
      setShowAssign(false);
      setMode('paquete');
      notify({ tone: 'success', message: 'Paquete asignado al paciente.' });
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo asignar el paquete.'));
    } finally {
      setAssigning(false);
    }
  };

  const saveNote = async () => {
    setError('');
    if (!noteText.trim()) {
      setError('Escribe el contenido de la nota.');
      return;
    }
    setSavingNote(true);
    try {
      const evaVal = noteEva !== '' ? Number(noteEva) : null;
      await clinicalApi.addSessionNote({
        patient_id: patientId,
        session_number: nextNoteNum,
        session_date: appointment.startsAt ?? new Date().toISOString(),
        raw_text: noteText.trim(),
        eva: evaVal
      });
      await queryClient.invalidateQueries({ queryKey: ['next-session-number', patientId] });
      setNoteText('');
      setNoteEva('');
      setNoteSaved(true);
      setShowNote(false);
      notify({ tone: 'success', message: `Nota de sesión #${nextNoteNum} guardada.` });
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo guardar la nota.'));
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div
      className="charge-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="charge-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="charge-title"
      >
        <div className="form-header">
          <div>
            <p className="eyebrow">Cobro de sesión</p>
            <h2 id="charge-title" style={{ marginBottom: 0 }}>
              {appointment.patientName}
            </h2>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {appointment.sessionType || 'Sesión'}
              {sessionNum > 0 && ` · Sesión #${sessionNum}`}
              {' · '}
              {cdmxLabel(appointment.startsAt)}
            </span>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {packageInfos.map((pkg) => (
          <div className="charge-pkg-info" key={pkg.id}>
            <strong>{pkg.name}</strong>
            <span>
              Sesiones {pkg.usedSessions}/{pkg.totalSessions} ·{' '}
              {pkg.totalSessions - pkg.usedSessions} por tomar
            </span>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Abonado {money(pkg.paid)} de {money(pkg.total)}
              {pkg.balance > 0.01 ? ` · debe ${money(pkg.balance)}` : ' · pagado'}
            </span>
          </div>
        ))}

        {alreadyCharged ? (
          <div className="charge-paid-box">
            <strong>Esta cita ya tiene cobro registrado:</strong>
            <ul className="list-stack" style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
              {existing.map((p) => (
                <li
                  key={p.id}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span>
                    {p.method === 'paquete'
                      ? 'Sesión de paquete'
                      : `${money(Number(p.amount))} · ${p.method}`}
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => undo(p.id)}
                    disabled={saving}
                  >
                    Deshacer
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <div className="charge-segmented">
              <button
                type="button"
                className={mode === 'suelta' ? 'active' : ''}
                onClick={() => setMode('suelta')}
              >
                Sesión suelta
              </button>
              <button
                type="button"
                className={mode === 'paquete' ? 'active' : ''}
                onClick={() => setMode('paquete')}
                disabled={packages.length === 0}
                title={
                  packages.length === 0
                    ? 'Sin paquetes activos. Asigna uno desde el expediente del paciente (Finanzas).'
                    : undefined
                }
              >
                Con paquete
              </button>
            </div>
            {!showAssign ? (
              <button
                type="button"
                className="link-button"
                style={{ fontSize: '0.82rem', margin: '2px 0 0', alignSelf: 'flex-start' }}
                onClick={() => setShowAssign(true)}
              >
                {packages.length === 0
                  ? '+ Asignar un paquete a este paciente'
                  : '+ Asignar otro paquete'}
              </button>
            ) : (
              <div className="charge-subform">
                <p className="eyebrow" style={{ margin: 0 }}>
                  Nuevo paquete
                </p>
                <label>
                  Paquete del catálogo
                  <select value={assignPkgId} onChange={(e) => setAssignPkgId(e.target.value)}>
                    <option value="">— Elegir —</option>
                    {catalog.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({money(Number(c.price))} · {c.sessions_included} ses.)
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Precio total
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={assignAmount}
                    onChange={(e) => setAssignAmount(e.target.value)}
                    placeholder={chosenCatalog ? String(chosenCatalog.price) : 'Precio'}
                  />
                </label>
                <label>
                  Pago inicial (opcional)
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={assignInitPay}
                    onChange={(e) => setAssignInitPay(e.target.value)}
                    placeholder="Dejar vacío = queda pendiente"
                  />
                </label>
                {assignInitPay && Number(assignInitPay) > 0 && (
                  <>
                    <label>
                      Método del pago inicial
                      <select
                        value={assignInitMethod}
                        onChange={(e) => setAssignInitMethod(e.target.value as PaymentMethod)}
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m.charAt(0).toUpperCase() + m.slice(1)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {assignInitMethod === 'tarjeta' && (
                      <div className="charge-commission-info">
                        <span>
                          Comisión terminal (4.06 %): −
                          {money(Number(assignInitPay) - netAfterCommission(Number(assignInitPay)))}
                        </span>
                        <strong>Recibes: {money(netAfterCommission(Number(assignInitPay)))}</strong>
                      </div>
                    )}
                  </>
                )}
                <div className="actions" style={{ gap: 8 }}>
                  <button type="button" onClick={assignPackage} disabled={assigning}>
                    {assigning ? 'Asignando...' : 'Asignar paquete'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setShowAssign(false)}
                    disabled={assigning}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {mode === 'suelta' ? (
              <>
                <label>
                  Monto cobrado al paciente
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
                <label>
                  Método
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                {method === 'tarjeta' && Number(amount) > 0 && (
                  <div className="charge-commission-info">
                    <span>
                      Comisión terminal (4.06 %): −
                      {money(Number(amount) - netAfterCommission(Number(amount)))}
                    </span>
                    <strong>Recibes: {money(netAfterCommission(Number(amount)))}</strong>
                  </div>
                )}
              </>
            ) : (
              <>
                <label>
                  Paquete
                  <select value={packageId} onChange={(e) => setPackageId(e.target.value)}>
                    {packages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — quedan {Number(p.sessions_total) - Number(p.sessions_used)} de{' '}
                        {p.sessions_total}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Abono ahora (opcional)
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={abonoAmount}
                    onChange={(e) => setAbonoAmount(e.target.value)}
                    placeholder="Dejar vacío si ya está cubierto o paga después"
                  />
                </label>
                {abonoAmount && Number(abonoAmount) > 0 && (
                  <>
                    <label>
                      Método del abono
                      <select
                        value={abonoMethod}
                        onChange={(e) => setAbonoMethod(e.target.value as PaymentMethod)}
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m.charAt(0).toUpperCase() + m.slice(1)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {abonoMethod === 'tarjeta' && (
                      <div className="charge-commission-info">
                        <span>
                          Comisión terminal (4.06 %): −
                          {money(Number(abonoAmount) - netAfterCommission(Number(abonoAmount)))}
                        </span>
                        <strong>Recibes: {money(netAfterCommission(Number(abonoAmount)))}</strong>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}

            <div className="actions">
              <button type="button" onClick={save} disabled={saving}>
                {saving ? 'Guardando...' : 'Registrar cobro'}
              </button>
            </div>
          </>
        )}

        {/* Nota de sesión rápida (disponible aunque ya esté cobrada) */}
        <div className="charge-note-section">
          {!showNote ? (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setShowNote(true);
                setError('');
              }}
            >
              {noteSaved ? '✓ Nota guardada · escribir otra' : '+ Nota de sesión'}
            </button>
          ) : (
            <div className="charge-subform">
              <p className="eyebrow" style={{ margin: 0 }}>
                Nota de sesión #{nextNoteNum}
              </p>
              <label>
                ¿Qué se trabajó en la sesión?
                <textarea
                  rows={4}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Evolución, técnicas aplicadas, indicaciones…"
                />
              </label>
              <label>
                Dolor EVA (0-10, opcional)
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="1"
                  value={noteEva}
                  onChange={(e) => setNoteEva(e.target.value)}
                  placeholder="Ej. 4"
                />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="actions" style={{ gap: 8 }}>
                <button type="button" onClick={saveNote} disabled={savingNote}>
                  {savingNote ? 'Guardando...' : 'Guardar nota'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowNote(false)}
                  disabled={savingNote}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {onViewPatient && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              onViewPatient(appointment.patientId);
              onClose();
            }}
          >
            Ver expediente del paciente
          </button>
        )}
      </section>
    </div>
  );
}
