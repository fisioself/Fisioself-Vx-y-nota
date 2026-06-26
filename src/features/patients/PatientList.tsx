import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clinicalApi } from '../../services/clinicalApi';
import { calendarService } from '../../services/calendarService';
import { useToast } from '../../app/ToastProvider';
import { getErrorMessage } from '../../shared/errors';
import { SkeletonList } from '../../components/Skeleton';
import { PatientTrash } from './PatientTrash';
import type { Patient } from '../../types/clinical';

interface PatientListProps {
  selectedId?: string | null;
  onSelect?: (patient: Patient) => void;
  /** Callback para el botón «+ Nuevo paciente» integrado en la cabecera. */
  onNewPatient?: () => void;
  /** Indica si el formulario de nuevo paciente está activo (para alternar el label). */
  newPatientActive?: boolean;
}

export function PatientList({
  selectedId,
  onSelect,
  onNewPatient,
  newPatientActive
}: PatientListProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [importing, setImporting] = useState(false);
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
  const showList = isSearching || expanded;

  const handleImport = async () => {
    setImporting(true);
    notify({ tone: 'success', message: 'Sincronizando pacientes desde Google Calendar...' });
    try {
      await calendarService.fetchEvents();
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      notify({ tone: 'success', message: 'Pacientes importados desde Google Calendar.' });
    } catch (err) {
      notify({
        tone: 'error',
        message: getErrorMessage(err, 'No se pudo importar desde Google Calendar.')
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="card patient-list">
      {/* Cabecera: título + botón «+ Nuevo paciente» integrado */}
      <div className="form-header">
        <div>
          <p className="eyebrow">Expedientes</p>
          <h2>Pacientes</h2>
        </div>
        {onNewPatient && (
          <button
            type="button"
            className={newPatientActive ? 'secondary btn-sm' : 'btn-sm'}
            onClick={onNewPatient}
          >
            {newPatientActive ? 'Cancelar' : '+ Nuevo'}
          </button>
        )}
      </div>

      {/* Búsqueda + acción secundaria «Importar» en una sola fila */}
      <div className="patient-search-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o teléfono…"
          aria-label="Buscar pacientes"
        />
        <button
          type="button"
          className="secondary btn-sm"
          onClick={handleImport}
          disabled={importing}
          title="Importar pacientes desde Google Calendar"
        >
          {importing ? '…' : '↻ Calendar'}
        </button>
      </div>

      {/* «Mostrar pacientes de hoy» colapsado por defecto */}
      {!isSearching && (
        <button
          type="button"
          className="secondary"
          onClick={() => setExpanded((v) => !v)}
          style={{ marginBottom: showList ? 4 : 0 }}
        >
          {expanded
            ? 'Ocultar lista'
            : `Pacientes de hoy${todayPatients.length ? ` (${todayPatients.length})` : ''}`}
        </button>
      )}

      {isLoading && showList && <SkeletonList rows={4} label="Cargando pacientes…" />}

      {showList && (
        <div className="list-stack">
          {patients.map((patient) => (
            <button
              key={patient.id}
              type="button"
              className={patient.id === selectedId ? 'patient-row active' : 'patient-row'}
              aria-current={patient.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect?.(patient)}
            >
              <strong>{patient.full_name}</strong>
              <span>{patient.status || 'Sin estado'}</span>
              <small>{patient.phone || 'Sin teléfono'}</small>
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

      {/* Papelera: acción esporádica y destructiva → enlace fantasma discreto
            al pie de la tarjeta, sin caja propia que compita visualmente. */}
      <PatientTrash />
    </section>
  );
}
