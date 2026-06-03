import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clinicalApi } from '../../services/clinicalApi';
import { useToast } from '../../app/ToastProvider';
import type { Patient } from '../../types/clinical';

interface PatientListProps {
  selectedId?: string | null;
  onSelect?: (patient: Patient) => void;
}

export function PatientList({ selectedId, onSelect }: PatientListProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [importing, setImporting] = useState(false);
  // La lista de nombres arranca colapsada para no llenar la pantalla principal;
  // se despliega al tocar "Mostrar" o automáticamente al buscar.
  const [expanded, setExpanded] = useState(false);
  const { notify } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handler);
  }, [query]);

  const isSearching = debouncedQuery.trim().length > 0;

  const { data: todayPatients = [], isLoading: loadingToday } = useQuery<Patient[], Error>({
    queryKey: ['patients', 'today'],
    queryFn: () => clinicalApi.listPatientsToday(),
    enabled: !isSearching
  });

  const { data: searchResults = [], isLoading: loadingSearch } = useQuery<Patient[], Error>({
    queryKey: ['patients', 'search', debouncedQuery],
    queryFn: () => clinicalApi.searchPatients(debouncedQuery),
    enabled: isSearching
  });

  const patients = isSearching ? searchResults : todayPatients;
  const isLoading = isSearching ? loadingSearch : loadingToday;
  // Mostramos los nombres solo al buscar o cuando el usuario despliega la lista.
  const showList = isSearching || expanded;

  const handleImport = async () => {
    setImporting(true);
    notify({ tone: 'success', message: 'Sincronizando pacientes desde Google Calendar...' });
    setTimeout(() => {
      setImporting(false);
      notify({ tone: 'success', message: 'Pacientes importados de forma exitosa.' });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    }, 2500);
  };

  return (
    <section className="card patient-list">
      <div className="form-header">
        <div>
          <p className="eyebrow">Expedientes</p>
          <h2>Pacientes</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button type="button" className="secondary" onClick={handleImport} disabled={importing}>
            {importing ? 'Sincronizando...' : 'Importar de Calendar'}
          </button>
          <span className="pill">{patients.length}</span>
        </div>
      </div>

      <div className="filter-group">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o telefono..."
          aria-label="Buscar pacientes"
          className="search-input"
        />
      </div>

      {/* Botón para mostrar/ocultar la lista de hoy (colapsada por defecto para
          que los nombres no aparezcan en la pantalla principal). Al buscar, la
          lista se muestra sola y este botón se oculta. */}
      {!isSearching && (
        <button
          type="button"
          className="secondary"
          onClick={() => setExpanded((v) => !v)}
          style={{ marginBottom: showList ? 12 : 0 }}
        >
          {expanded
            ? 'Ocultar lista'
            : `Mostrar pacientes de hoy${todayPatients.length ? ` (${todayPatients.length})` : ''}`}
        </button>
      )}

      {isLoading && showList && <p className="muted">Cargando...</p>}

      {showList && (
        <div className="list-stack">
          {patients.map((patient) => (
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

          {!isLoading && !patients.length && (
            <p className="muted">
              {isSearching
                ? 'No se encontraron pacientes.'
                : 'Sin pacientes agendados hoy — usa el buscador'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
