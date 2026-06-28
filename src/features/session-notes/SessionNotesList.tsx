import { useMemo, useState, useEffect, useCallback } from 'react';
import { useToast } from '../../app/ToastProvider';
import { clinicalApi } from '../../services/clinicalApi';
import { SessionNoteEditor } from './SessionNoteEditor';
import type { SessionNote } from '../../types/clinical';
import { getErrorMessage } from '../../shared/errors';
import { offlineNotes } from '../../shared/offlineNotes';
import { ConfirmDialog } from '../../components/ConfirmDialog';

interface SessionNotesListProps {
  notes?: SessionNote[];
  patientId?: string;
  onChanged?: () => void;
}

// ¿Es una nota pendiente de sincronizar (escrita sin conexión)?
const isPendingNote = (note: SessionNote): boolean =>
  (note as SessionNote & { _pending?: boolean })._pending === true;

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
  // Notas escritas sin conexión, pendientes de sincronizar (cola local).
  const [pending, setPending] = useState<SessionNote[]>(() =>
    patientId ? offlineNotes.forPatient(patientId) : []
  );
  const { notify } = useToast();

  // Mantener `pending` al día: cambia al encolar/sincronizar una nota offline.
  useEffect(() => {
    if (!patientId) return;
    setPending(offlineNotes.forPatient(patientId));
    return offlineNotes.subscribe(() => setPending(offlineNotes.forPatient(patientId)));
  }, [patientId]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(handler);
  }, [query]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    // Pendientes que aún no llegan del servidor (dedupe por id), arriba del todo.
    const freshPending = pending.filter((p) => !notes.some((n) => n.id === p.id));
    const sorted = [...freshPending, ...notes]
      .filter((n) => !optimisticDeleted.has(n.id))
      .sort((a, b) => Number(b.session_number) - Number(a.session_number));
    if (!q) return sorted;
    return sorted.filter((note) =>
      [note.raw_text, note.session_date, note.eva, note.session_number]
        .filter((value) => value != null)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [notes, pending, debouncedQuery, optimisticDeleted]);

  const deleteNote = useCallback(
    async (note: SessionNote) => {
      setConfirmNote(null);
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
    [notify, onChanged]
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
          const pendingNote = isPendingNote(note);
          return (
            <article key={note.id} className={`note-row${pendingNote ? ' note-pending' : ''}`}>
              <button
                type="button"
                className="note-toggle"
                onClick={() => setOpenId(isOpen ? null : note.id)}
              >
                <span>
                  <strong>Sesion #{note.session_number}</strong>
                  {pendingNote && <span className="pill alert">Pendiente de sincronizar</span>}
                </span>
              </button>
              <div className="row wrap note-actions">
                {pendingNote ? (
                  // Pendiente: aún no está en el servidor. Solo se puede descartar
                  // (quitarla de la cola local); editar/borrar exige conexión.
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      offlineNotes.remove(note.id);
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
              {isEditing && !pendingNote && (
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
        {!filtered.length && (
          <p className="muted">
            {debouncedQuery.trim()
              ? `Sin coincidencias para «${debouncedQuery.trim()}».`
              : 'Aún no hay notas de sesión registradas.'}
          </p>
        )}
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
