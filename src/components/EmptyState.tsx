interface EmptyStateProps {
  /** Emoji o glifo que resume el estado (p. ej. "📭", "🗓️", "💸"). */
  icon: string;
  /** Título corto y claro. */
  title: string;
  /** Texto de apoyo opcional que orienta sobre qué hacer. */
  hint?: string;
  /** Acción opcional (botón, enlace) renderizada bajo el texto. */
  children?: React.ReactNode;
}

/**
 * Estado vacío ilustrado y consistente en toda la app.
 * Sustituye al "<p class=muted>No hay…</p>" plano por un bloque centrado
 * con icono en círculo. El icono es decorativo (aria-hidden).
 */
export function EmptyState({ icon, title, hint, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="empty-state__title">{title}</p>
      {hint && <p className="empty-state__hint">{hint}</p>}
      {children}
    </div>
  );
}
