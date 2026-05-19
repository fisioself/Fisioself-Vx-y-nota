import { useEffect, useMemo, useState } from 'react';
import { clinicalApi } from '../../services/clinicalApi.js';

export function PatientList({ refreshKey = 0, selectedId, onSelect }) {
  const [patients, setPatients] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const rows = await clinicalApi.listPatients();
        if (!cancelled) setPatients(rows || []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'No se pudieron cargar pacientes.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((patient) =>
      [
        patient.full_name,
        patient.phone,
        patient.email,
        patient.medical_diagnosis,
        patient.functional_diagnosis,
        patient.status
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [patients, query]);

  return (
    <section className="card patient-list">
      <div className="form-header">
        <div>
          <p className="eyebrow">Expedientes</p>
          <h2>Pacientes</h2>
        </div>
        <span className="pill">{filtered.length}</span>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar paciente, telefono, diagnostico..."
      />

      {loading && <p className="muted">Cargando pacientes...</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="list-stack">
        {filtered.map((patient) => (
          <button
            key={patient.id}
            type="button"
            className={patient.id === selectedId ? 'patient-row active' : 'patient-row'}
            onClick={() => onSelect?.(patient)}
          >
            <strong>{patient.full_name}</strong>
            <span>{patient.status || 'Sin estado'}</span>
            <small>
              {patient.functional_diagnosis || patient.medical_diagnosis || 'Sin diagnostico'}
            </small>
          </button>
        ))}
        {!loading && !filtered.length && <p className="muted">No hay pacientes para mostrar.</p>}
      </div>
    </section>
  );
}
