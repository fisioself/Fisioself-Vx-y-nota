import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clinicalApi } from '../../services/clinicalApi';
import { useModalA11y } from '../../shared/useModalA11y';
import type { Patient } from '../../types/clinical';
import './GlobalSearch.css';

interface QuickAction {
  id: string;
  icon: string;
  name: string;
  sub: string;
  onSelect: () => void;
}

interface GlobalSearchProps {
  onSelectPatient: (patient: Patient) => void;
  onNavigate: (view: 'dashboard' | 'finance') => void;
  onClose: () => void;
}

export function GlobalSearch({ onSelectPatient, onNavigate, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useModalA11y<HTMLDivElement>(onClose);

  // autoFocus via ref evita el warning de a11y del linter (jsx-a11y/no-autofocus).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Reset cursor whenever results change.
  useEffect(() => setActiveIdx(0), [debouncedQuery]);

  const { data: patients = [], isFetching } = useQuery({
    queryKey: ['global-search', debouncedQuery],
    queryFn: () => clinicalApi.searchPatients(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 2
  });

  const QUICK_ACTIONS: QuickAction[] = [
    {
      id: 'dashboard',
      icon: '📋',
      name: 'Panel principal',
      sub: 'Ir al calendario y resumen',
      onSelect: () => onNavigate('dashboard')
    },
    {
      id: 'finance',
      icon: '💰',
      name: 'Finanzas',
      sub: 'Ver métricas y cobros',
      onSelect: () => onNavigate('finance')
    }
  ];

  const isSearching = debouncedQuery.trim().length >= 2;

  // Flattened list of selectable items for keyboard navigation.
  type Item = { type: 'patient'; patient: Patient } | { type: 'action'; action: QuickAction };
  const items: Item[] = isSearching
    ? patients.map((p) => ({ type: 'patient' as const, patient: p }))
    : QUICK_ACTIONS.map((a) => ({ type: 'action' as const, action: a }));

  const selectItem = (item: Item) => {
    if (item.type === 'patient') {
      onSelectPatient(item.patient);
    } else {
      item.action.onSelect();
    }
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && items[activeIdx]) {
      e.preventDefault();
      selectItem(items[activeIdx]);
    }
  };

  return (
    <div
      className="gs-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="gs-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda global"
        ref={panelRef}
      >
        <div className="gs-input-row">
          <span aria-hidden="true" style={{ color: 'var(--muted)', fontSize: '1rem' }}>
            🔍
          </span>
          <input
            ref={inputRef}
            type="search"
            placeholder="Buscar paciente o ir a…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Buscar"
            aria-autocomplete="list"
            aria-controls="gs-listbox"
          />
          {isFetching && (
            <span className="muted" style={{ fontSize: '0.78rem' }}>
              …
            </span>
          )}
          <span className="gs-kbd">Esc</span>
        </div>

        <div className="gs-results" id="gs-listbox" role="listbox">
          {!isSearching && (
            <>
              <p className="gs-section-label">Acciones rápidas</p>
              {QUICK_ACTIONS.map((action, i) => (
                <button
                  key={action.id}
                  type="button"
                  className="gs-item"
                  data-active={activeIdx === i}
                  role="option"
                  aria-selected={activeIdx === i}
                  onClick={() => {
                    action.onSelect();
                    onClose();
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  <span className="gs-item-icon" aria-hidden="true">
                    {action.icon}
                  </span>
                  <span className="gs-item-text">
                    <span className="gs-item-name">{action.name}</span>
                    <span className="gs-item-sub">{action.sub}</span>
                  </span>
                </button>
              ))}
            </>
          )}

          {isSearching && patients.length > 0 && (
            <>
              <p className="gs-section-label">Pacientes</p>
              {patients.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className="gs-item"
                  data-active={activeIdx === i}
                  role="option"
                  aria-selected={activeIdx === i}
                  onClick={() => {
                    onSelectPatient(p);
                    onClose();
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  <span className="gs-item-icon" aria-hidden="true">
                    👤
                  </span>
                  <span className="gs-item-text">
                    <span className="gs-item-name">{p.full_name}</span>
                    {p.phone && <span className="gs-item-sub">{p.phone}</span>}
                  </span>
                </button>
              ))}
            </>
          )}

          {isSearching && !isFetching && patients.length === 0 && (
            <p className="gs-empty">Sin resultados para «{debouncedQuery}»</p>
          )}
        </div>

        <div className="gs-footer" aria-hidden="true">
          <span>
            <kbd>↑↓</kbd> navegar
          </span>
          <span>
            <kbd>↵</kbd> abrir
          </span>
          <span>
            <kbd>Esc</kbd> cerrar
          </span>
        </div>
      </div>
    </div>
  );
}
