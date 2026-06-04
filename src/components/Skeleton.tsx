import './Skeleton.css';

interface SkeletonProps {
  // Ancho CSS (ej. '100%', 120, '8rem'). Por defecto ocupa todo el ancho.
  width?: string | number;
  // Alto CSS. Por defecto una línea de texto.
  height?: string | number;
  // Radio del borde (ej. '50%' para un avatar circular).
  radius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

const toCss = (v: string | number | undefined): string | undefined =>
  typeof v === 'number' ? `${v}px` : v;

// Bloque "placeholder" animado que ocupa el espacio del contenido mientras
// carga. Sustituye al texto "Cargando..." por una silueta del contenido real,
// que se siente más rápido y evita saltos de layout. Accesible: marcado como
// aria-hidden (es decorativo) y respeta prefers-reduced-motion en el CSS.
export function Skeleton({ width, height = '1em', radius = 8, className, style }: SkeletonProps) {
  return (
    <span
      className={className ? `skeleton ${className}` : 'skeleton'}
      aria-hidden="true"
      style={{
        width: toCss(width) ?? '100%',
        height: toCss(height),
        borderRadius: toCss(radius),
        ...style
      }}
    />
  );
}

// Skeleton de una "fila" típica (título + subtítulo) dentro de una tarjeta.
// Útil para listas de pacientes, citas, documentos, etc.
export function SkeletonRow() {
  return (
    <div className="skeleton-row" aria-hidden="true">
      <Skeleton width="60%" height={14} />
      <Skeleton width="40%" height={11} />
    </div>
  );
}

// Lista de N filas skeleton. `label` da contexto a lectores de pantalla.
export function SkeletonList({ rows = 3, label = 'Cargando…' }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton-list" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
