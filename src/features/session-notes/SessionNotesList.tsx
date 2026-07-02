import { useMemo, useState, useEffect, useCallback } from 'react';
import { useToast } from '../../app/ToastProvider';
import { clinicalApi } from '../../services/clinicalApi';
import { SessionNoteEditor } from './SessionNoteEditor';
import type { SessionNote } from '../../types/clinical';
import { getErrorMessage } from '../../shared/errors';
import { offlineNotes } from '../../shared/offlineNotes';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';

interface SessionNotesListProps {
  notes?: SessionNote[];
  patientId?: string;
  onChanged?: () => void;
}

// Marcas que añade la cola offline a una nota para la UI.
type ListNote = SessionNote & { _pending?: boolean; _pendingEdit?: boolean };

const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

export function SessionNotesList({ notes = [], patientId, onChanged }: SessionNotesListProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // IDs que ya se eliminaron optimistamente: desaparecen al instante del DOM
  // sin esperar el refetch, y reaparecen si la petición falla.
  const [optimisticDeleted, setOptimisticDeleted] = useState<ReadonlySet<string>>(new Set());
  // Nota pendiente de confirmar su borrado permanente (null = sin diálogo).
  const [confirmNote, setConfirmNote] = useState<SessionNote | null>(null);
  // Se incrementa cuando cambia la cola offline (encolar/sincronizar/descartar)
  // para recalcular qué notas están pendientes de crear/editar/borrar.
  const [pendingTick, setPendingTick] = useState(0);
  const { notify } = useToast();

  useEffect(() => offlineNotes.subscribe(() => setPendingTick((t) => t + 1)), []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(handler);
  }, [query]);

  const filtered = useMemo<ListNote[]>(() => {
    void pendingTick; // recalcula cuando cambia la cola offline
    const creates = patientId ? offlineNotes.pendingCreates(patientId) : [];
    const updates = patientId
      ? offlineNotes.pendingUpdates(patientId)
      : new Map<string, SessionNote>();
    const deletes = patientId ? offlineNotes.pendingDeletes(patientId) : new Set<string>();

    // Notas del servidor: ocultamos las que tienen borrado pendiente y aplicamos
    // las ediciones pendientes sobre su contenido (marcándolas).
    const serverView: ListNote[] = notes
      .filter((n) => !deletes.has(n.id))
      .map((n) => (updates.has(n.id) ? { ...n, ...updates.get(n.id), _pendingEdit: true } : n));

    // Notas nuevas pendientes que aún no llegaron del servidor (dedupe por id).
    const freshCreates = creates.filter((c) => !notes.some((n) => n.id === c.id));

    const q = debouncedQuery.trim().toLowerCase();
    const sorted = [...freshCreates, ...serverView]
      .filter((n) => !optimisticDeleted.has(n.id))
      .sort((a, b) => Number(b.session_number) - Number(a.session_number));
    if (!q) return sorted;
    return sorted.filter((note) =>
      [note.raw_text, note.session_date, note.eva, note.session_number]
        .filter((value) => value != null)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [notes, patientId, pendingTick, debouncedQuery, optimisticDeleted]);

  const deleteNote = useCallback(
    async (note: SessionNote) => {
      setConfirmNote(null);
      // Sin conexión: encolamos el borrado y lo aplicamos al reconectar.
      if (isOffline() && patientId) {
        offlineNotes.enqueueDelete(note.id, patientId);
        notify({
          tone: 'success',
          message: 'Eliminación guardada sin conexión. Se aplicará al reconectar.'
        });
        return;
      }
      setDeletingId(note.id);
      // Optimistic: remove immediately from the visible list.
      setOptimisticDeleted((prev) => new Set([...prev, note.id]));
      try {
        await clinicalApi.deleteSessionNote(note.id);
        notify({ tone: 'success', message: `Sesion #${note.session_number} eliminada.` });
        onChanged?.();
      } catch (err) {
        // Roll back: re-show the note.
        setOptimisticDeleted((prev) => {
          const next = new Set(prev);
          next.delete(note.id);
          return next;
        });
        notify({ tone: 'error', message: getErrorMessage(err, 'No se pudo eliminar la nota.') });
      } finally {
        setDeletingId(null);
      }
    },
    [notify, onChanged, patientId]
  );

  return (
    <section className="card">
      <div className="form-header">
        <div>
          <p className="eyebrow">Historial</p>
          <h2>Notas de sesion</h2>
        </div>
        <span className="pill">{filtered.length}</span>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar en notas, fecha o EVA..."
        aria-label="Buscar en notas de sesion"
      />

      <div className="list-stack">
        {filtered.map((note) => {
          const isOpen = openId === note.id;
          const isEditing = editingId === note.id;
          const pendingCreate = note._pending === true;
          const pendingEdit = note._pendingEdit === true;
          const pendingAny = pendingCreate || pendingEdit;
          return (
            <article key={note.id} className={`note-row${pendingAny ? ' note-pending' : ''}`}>
              <button
                type="button"
                className="note-toggle"
                onClick={() => setOpenId(isOpen ? null : note.id)}
              >
                <span>
                  <strong>Sesion #{note.session_number}</strong>
                  {pendingCreate && <span className="pill alert">Pendiente de sincronizar</span>}
                  {pendingEdit && <span className="pill alert">Edición pendiente</span>}
                </span>
              </button>
              <div className="row wrap note-actions">
                {pendingCreate ? (
                  // Nota nueva aún no subida: solo se puede descartar (quitarla de
                  // la cola local). Al reconectar se crea en el servidor.
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      offlineNotes.removeForNote(note.id);
                      notify({ tone: 'success', message: 'Nota pendiente descartada.' });
                    }}
                  >
                    Descartar
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setEditingId(isEditing ? null : note.id)}
                    >
                      {isEditing ? 'Cerrar edicion' : 'Editar'}
                    </button>
                    {pendingEdit && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          offlineNotes.removeForNote(note.id);
                          notify({ tone: 'success', message: 'Edición pendiente descartada.' });
                        }}
                      >
                        Descartar cambios
                      </button>
                    )}
                    <button
                      type="button"
                      className="danger"
                      disabled={deletingId === note.id}
                      onClick={() => setConfirmNote(note)}
                    >
                      {deletingId === note.id ? 'Eliminando...' : 'Eliminar'}
                    </button>
                  </>
                )}
              </div>
              {isEditing && !pendingCreate && (
                <SessionNoteEditor
                  patientId={note.patient_id}
                  therapistId={note.therapist_id}
                  sessionNumber={note.session_number}
                  note={note}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => {
                    setEditingId(null);
                    onChanged?.();
                  }}
                />
              )}
              {isOpen && (
                <div className="note-details">
                  <div className="row wrap muted">
                    <span>Fecha: {note.session_date || 'Sin fecha'}</span>
                    <span>{note.eva != null ? `EVA ${note.eva}/10` : 'Sin EVA'}</span>
                  </div>
                  <pre>{note.raw_text}</pre>
                </div>
              )}
            </article>
          );
        })}
        {!filtered.length &&
          (debouncedQuery.trim() ? (
            <p className="muted">Sin coincidencias para «{debouncedQuery.trim()}».</p>
          ) : (
            <EmptyState
              icon="🌱"
              title="El inicio del proceso"
              hint="Aún no hay notas de evolución. Registra la primera sesión y aquí crecerá la historia del paciente."
            />
          ))}
      </div>

      {confirmNote && (
        <ConfirmDialog
          title={`Eliminar nota de la sesión #${confirmNote.session_number}`}
          message="Esta acción borrará permanentemente el contenido clínico de esta sesión. No se puede deshacer."
          confirmLabel="Eliminar permanentemente"
          busy={deletingId === confirmNote.id}
          onConfirm={() => deleteNote(confirmNote)}
          onCancel={() => setConfirmNote(null)}
        />
      )}
    </section>
  );
}
