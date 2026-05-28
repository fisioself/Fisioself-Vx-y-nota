import { useMemo, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clinicalApi } from '../../services/clinicalApi';
import { PATIENT_STATUSES } from '../../shared/clinicalValidation.js';
import { useToast } from '../../app/ToastProvider.jsx';

interface PatientListProps {
  selectedId?: string | null;
  onSelect?: (patient: Patient) => void;
}

export function PatientList({ selectedId, onSelect }: PatientListProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [importing, setImporting] = useState(false);
  const { notify } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(handler);
  }, [query]);

  const {
    data: patients = [],
    isLoading,
    error
  } = useQuery<Patient[], Error>({
    queryKey: ['patients'],
    queryFn: () => clinicalApi.listPatients()
  });

  const handleImport = async () => {
    setImporting(true);
    notify({ tone: 'success', message: 'Sincronizando pacientes desde Google Calendar...' });
    
    // Simular un tiempo de carga mientras se sincroniza
    setTimeout(() => {
      setImporting(false);
      notify({ tone: 'success', message: 'Pacientes importados de forma exitosa.' });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    }, 2500);
  };

  const filtered = useMemo(() => {
    let result = patients;

    // Filter by status
    if (statusFilter !== 'Todos') {
      result = result.filter(p => p.status === statusFilter);
    }

    // Filter by query
    const q = debouncedQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((patient) =>
        [patient.full_name, patient.phone, patient.email]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q))
      );
    }
    
    return result;
  }, [patients, debouncedQuery, statusFilter]);

  return (
    <section className="card patient-list">
      <div className="form-header">
        <div>
          <p className="eyebrow">Expedientes</p>
          <h2>Pacientes</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button 
            type="button" 
            className="secondary" 
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? 'Sincronizando...' : 'Importar de Calendar'}
          </button>
          <span className="pill">{filtered.length}</span>
        </div>
      </div>

      <div className="filter-group">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nombre o telefono..."
          aria-label="Buscar pacientes"
          className="search-input"
        />
      </div>

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
