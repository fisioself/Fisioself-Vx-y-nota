import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clinicalApi } from '../../services/clinicalApi.js';

export function PatientList({ selectedId, onSelect }) {
  const [query, setQuery] = useState('');

  const { data: patients = [], isLoading, error } = useQuery({
    queryKey: ['patients'],
    queryFn: () => clinicalApi.listPatients()
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((patient) =>
      [patient.full_name, patient.phone, patient.status]
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
        placeholder="Buscar paciente o telefono..."
      />

      {isLoading && <p className="muted">Cargando pacientes...</p>}
      {error && (
        <p className="error" role="alert">
          {error.message || 'No se pudieron cargar pacientes.'}
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
            <small>{patient.phone || 'Sin telefono'}</small>
          </button>
        ))}
        {!isLoading && !filtered.length && <p className="muted">No hay pacientes para mostrar.</p>}
      </div>
    </section>
  );
}
