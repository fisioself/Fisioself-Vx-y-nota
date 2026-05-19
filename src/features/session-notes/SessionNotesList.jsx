import { useMemo, useState } from 'react';

export function SessionNotesList({ notes = [] }) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...notes].sort((a, b) => Number(b.session_number) - Number(a.session_number));
    if (!q) return sorted;
    return sorted.filter((note) => [note.raw_text, note.session_date, note.eva, note.session_number]
      .filter((value) => value !== null && value !== undefined)
      .some((value) => String(value).toLowerCase().includes(q)));
  }, [notes, query]);

  return (
    <section className="card">
      <div className="form-header">
        <div>
          <p className="eyebrow">Historial</p>
          <h2>Notas de sesion</h2>
        </div>
        <span className="pill">{filtered.length}</span>
      </div>

      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en notas, fecha o EVA..." />

      <div className="list-stack">
        {filtered.map((note) => {
          const isOpen = openId === note.id;
          return (
            <article key={note.id} className="note-row">
              <button type="button" className="note-toggle" onClick={() => setOpenId(isOpen ? null : note.id)}>
                <span>
                  <strong>Sesion #{note.session_number}</strong>
                  <small>{note.session_date}</small>
                </span>
                <span>{note.eva !== null && note.eva !== undefined ? `EVA ${note.eva}/10` : 'Sin EVA'}</span>
              </button>
              {isOpen && <pre>{note.raw_text}</pre>}
            </article>
          );
        })}
        {!filtered.length && <p className="muted">No hay notas que coincidan con la busqueda.</p>}
      </div>
    </section>
  );
}
