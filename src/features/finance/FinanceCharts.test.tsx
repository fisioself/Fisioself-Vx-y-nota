import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarChart, GroupedBarChart, GrowthBadge } from './FinanceCharts';

describe('GrowthBadge', () => {
  it('renders nothing for null value', () => {
    const { container } = render(<GrowthBadge value={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows an up arrow for a positive value', () => {
    render(<GrowthBadge value={12} />);
    expect(screen.getByText(/▲/)).toBeInTheDocument();
    expect(screen.getByText(/12%/)).toBeInTheDocument();
  });

  it('shows a down arrow for a negative value', () => {
    render(<GrowthBadge value={-8} />);
    expect(screen.getByText(/▼/)).toBeInTheDocument();
    expect(screen.getByText(/8%/)).toBeInTheDocument();
  });

  it('treats zero as positive (up arrow)', () => {
    render(<GrowthBadge value={0} />);
    expect(screen.getByText(/▲/)).toBeInTheDocument();
  });
});

describe('BarChart', () => {
  it('shows empty state when data is empty', () => {
    render(<BarChart data={[]} format={(n) => `$${n}`} />);
    expect(screen.getByText(/Aún no hay datos/)).toBeInTheDocument();
  });

  it('renders a bar for each data point using the tooltip', () => {
    const data = [
      { month: '2026-01', value: 5000 },
      { month: '2026-02', value: 3000 }
    ];
    const { container } = render(<BarChart data={data} format={(n) => `$${n}`} />);
    const bars = container.querySelectorAll('[title]');
    expect(bars.length).toBe(2);
    expect(bars[0].getAttribute('title')).toContain('Ene');
    expect(bars[1].getAttribute('title')).toContain('Feb');
  });

  it('handles negative values without crashing', () => {
    const data = [
      { month: '2026-01', value: 1000 },
      { month: '2026-02', value: -500 }
    ];
    const { container } = render(<BarChart data={data} format={(n) => `$${n}`} />);
    expect(container.querySelectorAll('[title]').length).toBe(2);
  });
});

describe('GroupedBarChart', () => {
  const seriesA = { label: 'Atendidos', color: '#2980b9' };
  const seriesB = { label: 'Nuevos', color: '#8e44ad' };

  it('shows empty state when data is empty', () => {
    render(<GroupedBarChart data={[]} seriesA={seriesA} seriesB={seriesB} />);
    expect(screen.getByText(/Aún no hay datos/)).toBeInTheDocument();
  });

  it('renders the legend for both series', () => {
    const data = [{ month: '2026-01', a: 10, b: 3 }];
    render(<GroupedBarChart data={data} seriesA={seriesA} seriesB={seriesB} />);
    expect(screen.getByText('Atendidos')).toBeInTheDocument();
    expect(screen.getByText('Nuevos')).toBeInTheDocument();
  });

  it('renders a grouped bar for each month with a tooltip', () => {
    const data = [
      { month: '2026-01', a: 8, b: 2 },
      { month: '2026-02', a: 12, b: 4 }
    ];
    const { container } = render(
      <GroupedBarChart data={data} seriesA={seriesA} seriesB={seriesB} />
    );
    const bars = container.querySelectorAll('[title]');
    expect(bars.length).toBe(2);
    expect(bars[0].getAttribute('title')).toContain('Atendidos 8');
  });
});
