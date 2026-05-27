import { useMemo, useState, useEffect } from 'react';
import { useToast } from '../../app/ToastProvider.jsx';
import { clinicalApi } from '../../services/clinicalApi.js';
import { SessionNoteEditor } from './SessionNoteEditor.jsx';

export function SessionNotesList({ notes = [], onChanged }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const { notify } = useToast();

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(handler);
  }, [query]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const sorted = [...notes].sort((a, b) => Number(b.session_number) - Number(a.session_number));
    if (!q) return sorted;
    return sorted.filter((note) =>
      [note.raw_text, note.session_date, note.eva, note.session_number]
        .filter((value) => value != null)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [notes, debouncedQuery]);

  const deleteNote = async (note) => {
    const confirmed = window.confirm(
      `¿Seguro que quieres eliminar la nota de la sesion #${note.session_number}?`
    );
    if (!confirmed) return;

    const secondConfirm = window.confirm(
      `CONFIRMACION FINAL: Esta accion borrara permanentemente el contenido clínico de la sesion #${note.session_number}. ¿Continuar?`
    );
    if (!secondConfirm) return;

    setDeletingId(note.id);
    try {
      await clinicalApi.deleteSessionNote(note.id);
      notify({ tone: 'success', message: `Sesion #${note.session_number} eliminada.` });
      onChanged?.();
    } catch (err) {
      notify({ tone: 'error', message: err.message || 'No se pudo eliminar la nota.' });
    } finally {
      setDeletingId(null);
    }
  };

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
          return (
            <article key={note.id} className="note-row">
              <button
                type="button"
                className="note-toggle"
                onClick={() => setOpenId(isOpen ? null : note.id)}
              >
                <span>
                  <strong>Sesion #{note.session_number}</strong>
                </span>
              </button>
              <div className="row wrap note-actions">
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
                  onClick={() => deleteNote(note)}
                >
                  {deletingId === note.id ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
              {isEditing && (
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
        {!filtered.length && <p className="muted">No hay notas que coincidan con la busqueda.</p>}
      </div>
    </section>
  );
}
