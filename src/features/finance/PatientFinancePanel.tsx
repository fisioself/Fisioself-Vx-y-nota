import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../../services/financeApi';
import { useToast } from '../../app/ToastProvider';
import { getErrorMessage } from '../../shared/errors';
import type { Patient } from '../../types/clinical';
import { money, netAfterCommission } from './financeUtils';

interface PatientFinancePanelProps {
  patient: Patient;
}

export function PatientFinancePanel({ patient }: PatientFinancePanelProps) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [selectedPkg, setSelectedPkg] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [initPayAmount, setInitPayAmount] = useState('');
  const [initPayMethod, setInitPayMethod] = useState('efectivo');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('efectivo');
  const [busy, setBusy] = useState(false);

  const { data: catalog = [] } = useQuery({
    queryKey: ['packages-catalog'],
    queryFn: () => financeApi.listPackages()
  });

  const { data: finance } = useQuery({
    queryKey: ['patient-finance', patient.id],
    queryFn: () => financeApi.getPatientFinance(patient.id!)
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['patient-finance', patient.id] });
    queryClient.invalidateQueries({ queryKey: ['finance-global'] });
    queryClient.invalidateQueries({ queryKey: ['caja-payments'] });
  };

  const chosen = catalog.find((c) => c.id === selectedPkg);

  const addPackage = async () => {
    if (!chosen) {
      notify({ tone: 'error', message: 'Selecciona un servicio o paquete.' });
      return;
    }
    const totalAmount = customAmount !== '' ? Number(customAmount) : Number(chosen.price);
    const initAmt = initPayAmount !== '' ? Number(initPayAmount) : totalAmount;
    setBusy(true);
    try {
      const created = await financeApi.addPatientPackage({
        patientId: patient.id!,
        packageId: chosen.id,
        name: chosen.name,
        totalAmount,
        sessionsTotal: chosen.sessions_included
      });
      if (initAmt > 0) {
        const initNet = initPayMethod === 'tarjeta' ? netAfterCommission(initAmt) : initAmt;
        await financeApi.addPayment({
          patientId: patient.id!,
          patientPackageId: created.id,
          amount: initNet,
          method: initPayMethod
        });
      }
      setSelectedPkg('');
      setCustomAmount('');
      setInitPayAmount('');
      refresh();
      notify({ tone: 'success', message: 'Servicio agregado.' });
    } catch (err) {
      notify({ tone: 'error', message: getErrorMessage(err, 'No se pudo agregar el servicio.') });
    } finally {
      setBusy(false);
    }
  };

  const registerPayment = async () => {
    const value = Number(payAmount);
    if (!Number.isFinite(value) || value <= 0) {
      notify({ tone: 'error', message: 'Indica un monto válido.' });
      return;
    }
    setBusy(true);
    try {
      const netValue = payMethod === 'tarjeta' ? netAfterCommission(value) : value;
      await financeApi.addPayment({ patientId: patient.id!, amount: netValue, method: payMethod });
      setPayAmount('');
      refresh();
      notify({ tone: 'success', message: 'Pago registrado.' });
    } catch (err) {
      notify({ tone: 'error', message: getErrorMessage(err, 'No se pudo registrar el pago.') });
    } finally {
      setBusy(false);
    }
  };

  const adjustSessions = async (id: string, used: number) => {
    try {
      await financeApi.setSessionsUsed(id, used);
      refresh();
    } catch (err) {
      notify({ tone: 'error', message: getErrorMessage(err, 'No se pudo actualizar sesiones.') });
    }
  };

  const removePackage = async (id: string) => {
    try {
      await financeApi.deletePatientPackage(id);
      refresh();
    } catch (err) {
      notify({ tone: 'error', message: getErrorMessage(err, 'No se pudo eliminar.') });
    }
  };

  return (
    <section className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
      <div className="form-header">
        <div>
          <p className="eyebrow">Finanzas del paciente</p>
          <h2>{patient.full_name}</h2>
        </div>
      </div>

      {finance && (
        <div
          className="summary-grid"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', marginTop: 12 }}
        >
          <div className="card">
            <span>Total</span>
            <strong>{money(finance.totalBilled)}</strong>
          </div>
          <div className="card" style={{ background: 'var(--bg-sunken)' }}>
            <span>Pagado</span>
            <strong style={{ color: '#1f9d57' }}>{money(finance.totalPaid)}</strong>
          </div>
          <div className="card">
            <span>Saldo</span>
            <strong style={{ color: finance.balance > 0 ? '#c0392b' : '#1f9d57' }}>
              {money(finance.balance)}
            </strong>
          </div>
          <div className="card" style={{ background: 'var(--bg-sunken)' }}>
            <span>Sesiones restantes</span>
            <strong>
              {finance.sessionsRemaining} / {finance.sessionsTotal}
            </strong>
          </div>
        </div>
      )}

      {/* Agregar servicio/paquete */}
      <div style={{ marginTop: 16 }}>
        <p className="eyebrow">Agregar servicio o paquete</p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
            marginTop: 8
          }}
        >
          <select
            value={selectedPkg}
            onChange={(e) => setSelectedPkg(e.target.value)}
            aria-label="Servicio"
          >
            <option value="">— Elegir —</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({money(Number(c.price))})
              </option>
            ))}
          </select>
          <input
            type="number"
            inputMode="decimal"
            placeholder={chosen ? `Precio total ${money(Number(chosen.price))}` : 'Precio total'}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
          />
          <input
            type="number"
            inputMode="decimal"
            placeholder={
              chosen
                ? `Pago inicial (máx ${money(customAmount !== '' ? Number(customAmount) : Number(chosen?.price ?? 0))})`
                : 'Pago inicial $'
            }
            value={initPayAmount}
            onChange={(e) => setInitPayAmount(e.target.value)}
            title="Cuánto paga ahora. Dejar vacío = paga el total. 0 = queda pendiente."
          />
          <select
            value={initPayMethod}
            onChange={(e) => setInitPayMethod(e.target.value)}
            aria-label="Método pago inicial"
          >
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
          </select>
          <button type="button" onClick={addPackage} disabled={busy}>
            Agregar
          </button>
        </div>
      </div>

      {/* Lista de paquetes con control de sesiones */}
      <ul className="list-stack" style={{ marginTop: 16, listStyle: 'none', padding: 0 }}>
        {(finance?.packages ?? []).map((p) => (
          <li
            key={p.id}
            className="note-row"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10
            }}
          >
            <div>
              <strong style={{ display: 'block' }}>{p.name}</strong>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {money(Number(p.total_amount))} · {p.purchased_at}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {p.sessions_total > 1 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => adjustSessions(p.id, p.sessions_used - 1)}
                    disabled={p.sessions_used <= 0}
                    title="Quitar sesión usada"
                  >
                    −
                  </button>
                  <span className="pill">
                    {p.sessions_used}/{p.sessions_total}
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => adjustSessions(p.id, p.sessions_used + 1)}
                    disabled={p.sessions_used >= p.sessions_total}
                    title="Marcar sesión usada"
                  >
                    +
                  </button>
                </span>
              )}
              <button
                type="button"
                className="secondary"
                onClick={() => removePackage(p.id)}
                title="Eliminar"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
        {finance && finance.packages.length === 0 && (
          <p className="muted">Sin paquetes ni servicios registrados.</p>
        )}
      </ul>

      {/* Registrar abono suelto */}
      <div
        style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <input
          type="number"
          inputMode="decimal"
          placeholder="Abono $"
          value={payAmount}
          onChange={(e) => setPayAmount(e.target.value)}
          style={{ maxWidth: 120 }}
        />
        <select
          value={payMethod}
          onChange={(e) => setPayMethod(e.target.value)}
          aria-label="Método de abono"
          style={{ maxWidth: 150 }}
        >
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia</option>
        </select>
        <button type="button" className="secondary" onClick={registerPayment} disabled={busy}>
          Registrar abono
        </button>
        {payMethod === 'tarjeta' && Number(payAmount) > 0 && (
          <span style={{ fontSize: '0.8rem', color: '#c0392b' }}>
            Recibes {money(netAfterCommission(Number(payAmount)))} (−4.06 % comisión)
          </span>
        )}
      </div>
    </section>
  );
}
