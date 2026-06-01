import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi, PAYMENT_METHODS, type PaymentMethod } from '../../services/financeApi';
import { useToast } from '../../app/ToastProvider';
import { getErrorMessage } from '../../shared/errors';
import './AppointmentChargeModal.css';

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

  // Prefill del monto sugerido y selección del primer paquete disponible.
  useEffect(() => {
    if (suggested != null && amount === '') setAmount(String(suggested));
  }, [suggested, amount]);
  useEffect(() => {
    if (packages.length && !packageId) setPackageId(packages[0].id);
  }, [packages, packageId]);

  if (!appointment) return null;

  const alreadyCharged = existing.length > 0;

  const save = async () => {
    setError('');
    if (mode === 'suelta') {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt < 0) {
        setError('Ingresa un monto válido.');
        return;
      }
    } else if (!packageId) {
      setError('Selecciona un paquete con sesiones disponibles.');
      return;
    }

    setSaving(true);
    try {
      await financeApi.chargeAppointment({
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        usePackage: mode === 'paquete',
        patientPackageId: mode === 'paquete' ? packageId : null,
        amount: mode === 'suelta' ? Number(amount) : Number(abonoAmount || 0),
        method: mode === 'suelta' ? method : (abonoAmount ? abonoMethod : undefined)
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['appt-charge', apptId] }),
        queryClient.invalidateQueries({ queryKey: ['active-packages', patientId] }),
        queryClient.invalidateQueries({ queryKey: ['finance-global'] }),
        queryClient.invalidateQueries({ queryKey: ['patient-finance', patientId] })
      ]);
      notify({ tone: 'success', message: 'Cobro registrado.' });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo registrar el cobro.'));
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
        queryClient.invalidateQueries({ queryKey: ['patient-finance', patientId] })
      ]);
      notify({ tone: 'success', message: 'Cobro eliminado.' });
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo eliminar el cobro.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="charge-backdrop" role="presentation" onClick={onClose}>
      <section
        className="charge-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="charge-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="form-header">
          <div>
            <p className="eyebrow">Cobro de sesión</p>
            <h2 id="charge-title" style={{ marginBottom: 0 }}>
              {appointment.patientName}
            </h2>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {appointment.sessionType || 'Sesión'} · {cdmxLabel(appointment.startsAt)}
            </span>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>

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
                title={packages.length === 0 ? 'Sin paquetes con sesiones disponibles' : undefined}
              >
                Con paquete
              </button>
            </div>

            {mode === 'suelta' ? (
              <>
                <label>
                  Monto
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
                  <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
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
