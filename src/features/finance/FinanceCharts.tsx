import { monthLabel } from './financeUtils';

export function BarChart({
  data,
  format,
  positiveColor = '#1f9d57',
  negativeColor = '#c0392b'
}: {
  data: Array<{ month: string; value: number }>;
  format: (n: number) => string;
  positiveColor?: string;
  negativeColor?: string;
}) {
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const hasNeg = data.some((d) => d.value < 0);
  const H = 130;
  const zeroBand = hasNeg ? H / 2 : H;

  if (data.length === 0) {
    return <p className="muted">Aún no hay datos para graficar.</p>;
  }

  return (
    <div
      className="x-scroll"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 8,
        paddingBottom: 4
      }}
    >
      {data.map((d) => {
        const pos = d.value >= 0;
        const h = (Math.abs(d.value) / maxAbs) * zeroBand;
        return (
          <div
            key={d.month}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: 34,
              flex: 1
            }}
            title={`${monthLabel(d.month)}: ${format(d.value)}`}
          >
            <div
              style={{
                position: 'relative',
                height: H,
                width: 16,
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div
                style={{
                  flex: hasNeg ? 1 : 'none',
                  height: hasNeg ? undefined : H,
                  display: 'flex',
                  alignItems: 'flex-end'
                }}
              >
                {pos && (
                  <div
                    style={{
                      width: '100%',
                      height: h,
                      background: positiveColor,
                      borderRadius: '3px 3px 0 0',
                      minHeight: d.value > 0 ? 3 : 0
                    }}
                  />
                )}
              </div>
              {hasNeg && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start' }}>
                  {!pos && (
                    <div
                      style={{
                        width: '100%',
                        height: h,
                        background: negativeColor,
                        borderRadius: '0 0 3px 3px',
                        minHeight: d.value < 0 ? 3 : 0
                      }}
                    />
                  )}
                </div>
              )}
            </div>
            <span className="muted" style={{ fontSize: '0.7rem', marginTop: 4 }}>
              {monthLabel(d.month)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function GroupedBarChart({
  data,
  seriesA,
  seriesB
}: {
  data: Array<{ month: string; a: number; b: number }>;
  seriesA: { label: string; color: string };
  seriesB: { label: string; color: string };
}) {
  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.a, d.b)));
  const H = 130;

  if (data.length === 0) {
    return <p className="muted">Aún no hay datos para graficar.</p>;
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
        {[seriesA, seriesB].map((s) => (
          <span
            key={s.label}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}
          >
            <span style={{ width: 12, height: 12, borderRadius: 3, background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div
        className="x-scroll"
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 8,
          paddingBottom: 4
        }}
      >
        {data.map((d) => (
          <div
            key={d.month}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: 38,
              flex: 1
            }}
            title={`${monthLabel(d.month)}: ${seriesA.label} ${d.a} · ${seriesB.label} ${d.b}`}
          >
            <div style={{ height: H, display: 'flex', alignItems: 'flex-end', gap: 3 }}>
              <div
                style={{
                  width: 12,
                  height: (d.a / maxVal) * H,
                  background: seriesA.color,
                  borderRadius: '3px 3px 0 0',
                  minHeight: d.a > 0 ? 3 : 0
                }}
              />
              <div
                style={{
                  width: 12,
                  height: (d.b / maxVal) * H,
                  background: seriesB.color,
                  borderRadius: '3px 3px 0 0',
                  minHeight: d.b > 0 ? 3 : 0
                }}
              />
            </div>
            <span className="muted" style={{ fontSize: '0.7rem', marginTop: 4 }}>
              {monthLabel(d.month)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

export function GrowthBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <span style={{ color: up ? '#1f9d57' : '#c0392b', fontSize: '0.8rem', fontWeight: 600 }}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(0)}% vs mes pasado
    </span>
  );
}
