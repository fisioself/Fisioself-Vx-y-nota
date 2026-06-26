import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clinicalApi } from '../../services/clinicalApi';
import { useToast } from '../../app/ToastProvider';
import { useRole } from '../../shared/useRole';
import { SkeletonList } from '../../components/Skeleton';

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

  // Borrado PERMANENTE de un paciente de la papelera (irreversible).
  const purge = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Eliminar definitivamente a "${name}" y todo su expediente. Esta acción NO se puede deshacer. ¿Continuar?`
      )
    ) {
      return;
    }
    try {
      await clinicalApi.purgePatient(id);
      queryClient.invalidateQueries({ queryKey: ['patients', 'deleted'] });
      notify({ tone: 'success', message: `"${name}" eliminado definitivamente.` });
    } catch {
      notify({ tone: 'error', message: 'No se pudo eliminar el paciente.' });
    }
  };

  // Vacía la papelera: borra de forma permanente todos los pacientes borrados.
  const emptyTrash = async () => {
    if (
      !window.confirm(
        `Vaciar la papelera elimina definitivamente ${deleted.length} expediente(s). Esta acción NO se puede deshacer. ¿Continuar?`
      )
    ) {
      return;
    }
    try {
      await Promise.all(deleted.map((p) => clinicalApi.purgePatient(p.id)));
      queryClient.invalidateQueries({ queryKey: ['patients', 'deleted'] });
      notify({ tone: 'success', message: 'Papelera vaciada.' });
    } catch {
      notify({ tone: 'error', message: 'No se pudieron eliminar todos los pacientes.' });
    }
  };

  // No-admins no ven la papelera en absoluto.
  if (!isAdmin) return null;

  return (
    <div className="patient-trash">
      <button
        type="button"
        className="trash-ghost-link"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? 'Ocultar papelera' : '🗑️ Ver papelera de pacientes'}
      </button>

      {open && (
        <div className="list-stack" style={{ marginTop: 12 }}>
          {isLoading && <SkeletonList rows={2} label="Cargando papelera…" />}

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
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => restore(patient.id, patient.full_name ?? 'Paciente')}
                  title="Restaurar paciente"
                >
                  Restaurar
                </button>
                <button
                  type="button"
                  className="secondary btn-sm trash-purge-btn"
                  onClick={() => purge(patient.id, patient.full_name ?? 'Paciente')}
                  title="Eliminar definitivamente"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}

          {!isLoading && deleted.length > 0 && (
            <button
              type="button"
              className="secondary btn-sm trash-purge-btn"
              onClick={emptyTrash}
              style={{ marginTop: 4 }}
            >
              Vaciar papelera ({deleted.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
