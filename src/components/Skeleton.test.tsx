import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton, SkeletonList, SkeletonRow } from './Skeleton';

describe('Skeleton', () => {
  it('aplica width/height/radius', () => {
    const { container } = render(<Skeleton width={120} height={20} radius="50%" />);
    const el = container.querySelector('.skeleton') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.style.width).toBe('120px');
    expect(el.style.height).toBe('20px');
    expect(el.style.borderRadius).toBe('50%');
    // Es decorativo: oculto a lectores de pantalla.
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('usa 100% de ancho por defecto', () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('.skeleton') as HTMLElement;
    expect(el.style.width).toBe('100%');
  });

  it('SkeletonRow renderiza dos barras', () => {
    const { container } = render(<SkeletonRow />);
    expect(container.querySelectorAll('.skeleton')).toHaveLength(2);
  });

  it('SkeletonList anuncia el estado de carga y renderiza N filas', () => {
    render(<SkeletonList rows={3} label="Cargando pacientes…" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveAttribute('aria-label', 'Cargando pacientes…');
    expect(status.querySelectorAll('.skeleton-row')).toHaveLength(3);
  });
});
