import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clinicalApi } from '../../services/clinicalApi';
import { useToast } from '../../app/ToastProvider';
import { useRole } from '../../shared/useRole';

// Papelera de pacientes borrados. Solo visible para administradores.
// Permite recuperar un paciente eliminado por error (el borrado es lógico:
// deleted_at, no se pierde el expediente).
export function PatientTrash() {
  const { data: role } = useRole();
  const isAdmin = role === 'admin';
  const [open, setOpen] = useState(false);
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const { data: deleted = [], isLoading } = useQuery({
    queryKey: ['patients', 'deleted'],
    queryFn: () => clinicalApi.listDeletedPatients(),
    enabled: isAdmin && open
  });

  const restore = async (id: string, name: string) => {
    try {
      await clinicalApi.restorePatient(id);
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      notify({ tone: 'success', message: `Paciente "${name}" restaurado.` });
    } catch {
      notify({ tone: 'error', message: 'No se pudo restaurar el paciente.' });
    }
  };

  // No-admins no ven la papelera en absoluto.
  if (!isAdmin) return null;

  return (
    <section className="card patient-trash">
      <button
        type="button"
        className="secondary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? 'Ocultar papelera' : '🗑️ Papelera de pacientes'}
      </button>

      {open && (
        <div className="list-stack" style={{ marginTop: 12 }}>
          {isLoading && <p className="muted">Cargando…</p>}

          {!isLoading && deleted.length === 0 && (
            <p className="muted">No hay pacientes borrados.</p>
          )}

          {deleted.map((patient) => (
            <div
              key={patient.id}
              className="note-row"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10
              }}
            >
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block' }}>{patient.full_name ?? 'Sin nombre'}</strong>
                <span className="muted" style={{ fontSize: '0.8rem' }}>
                  Borrado: {patient.deleted_at ? patient.deleted_at.slice(0, 10) : '—'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => restore(patient.id, patient.full_name ?? 'Paciente')}
                title="Restaurar paciente"
              >
                Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
