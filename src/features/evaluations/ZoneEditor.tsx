import { useMemo, useState } from 'react';
import {
  ZONE_CATALOGS,
  getZoneCatalog,
  DEFAULT_TEST_OPTIONS,
  DANIELS_OPTIONS,
  ROM_RANGE_OPTIONS,
  getRomNorm,
  rangeFromDegrees,
  negativeOptionFor,
  PAIN_TYPE_OPTIONS
} from './evaluationCatalog';
import {
  emptyRomRow,
  emptyStrengthRow,
  romRowsForCatalog,
  strengthRowsForCatalog
} from './evaluationFormHelpers';
import { isRomRowAltered, isStrengthRowAltered } from '../../shared/clinicalFindings';
import type { RomRow, StrengthRow, TestResult, ZoneFormData } from './evaluationFormTypes';

// ---- Editor de una zona específica ----

interface ZoneEditorProps {
  zone: ZoneFormData;
  index: number;
  onChange: (updater: (z: ZoneFormData) => ZoneFormData) => void;
  onRemove: () => void;
}

export function ZoneEditor({ zone, index, onChange, onRemove }: ZoneEditorProps) {
  const catalog = getZoneCatalog(zone.zone_id);
  // Vista compacta por defecto (Movimiento · Grados · Dolor); "+ detalles"
  // muestra Tipo, Rango manual, lado sano y notas. Acelera la captura en móvil.
  const [showRomDetails, setShowRomDetails] = useState(false);
  const [showStrengthDetails, setShowStrengthDetails] = useState(false);

  const setZoneField = <K extends keyof ZoneFormData>(field: K, value: ZoneFormData[K]) =>
    onChange((z) => ({ ...z, [field]: value }));

  // Al cambiar de zona, recarga el desglose completo de ROM y fuerza del nuevo
  // catálogo (la batería de movimientos/músculos cambia entre zonas).
  const changeZone = (zoneId: string) =>
    onChange((z) => ({
      ...z,
      zone_id: zoneId,
      movement_ranges: romRowsForCatalog(zoneId, []),
      muscle_strength: strengthRowsForCatalog(zoneId, [])
    }));

  const setRom = (i: number, key: keyof RomRow, value: string) =>
    onChange((z) => ({
      ...z,
      movement_ranges: z.movement_ranges.map((r, ri) => (ri === i ? { ...r, [key]: value } : r))
    }));
  // Al escribir los grados, el rango se deduce solo (≥ normal → Completo; si no,
  // Limitado) cuando hay un normal de referencia para ese movimiento.
  const setRomDegrees = (i: number, value: string) =>
    onChange((z) => ({
      ...z,
      movement_ranges: z.movement_ranges.map((r, ri) => {
        if (ri !== i) return r;
        const auto = rangeFromDegrees(z.zone_id, r.movement, value);
        return { ...r, degrees: value, range: auto || r.range };
      })
    }));
  // Una fila ROM es "alterada" (se resalta en ámbar) si hay dolor o si el lado
  // afectado quedó por debajo del normal de referencia.
  const romAltered = (r: RomRow): boolean => isRomRowAltered(r.range, r.pain);
  const addRom = () =>
    onChange((z) => ({ ...z, movement_ranges: [...z.movement_ranges, { ...emptyRomRow }] }));
  const removeRom = (i: number) =>
    onChange((z) => ({
      ...z,
      movement_ranges:
        z.movement_ranges.length === 1
          ? z.movement_ranges
          : z.movement_ranges.filter((_, ri) => ri !== i)
    }));

  // Atajos "Normal": un toque deja la fila como hallazgo normal (Activo ·
  // Completo · Sin dolor para ROM; Daniels 5 · Sin dolor para fuerza). Acelera
  // la valoración: marcas todo normal y solo editas lo alterado.
  const ROM_NORMAL = { type: 'Activo', range: 'Completo', pain: 'No' } as const;
  const STRENGTH_NORMAL = { daniels: '5 - Fuerza normal', pain: 'No' } as const;

  const markRomNormal = (i: number) =>
    onChange((z) => ({
      ...z,
      movement_ranges: z.movement_ranges.map((r, ri) => (ri === i ? { ...r, ...ROM_NORMAL } : r))
    }));
  const markAllRomNormal = () =>
    onChange((z) => ({
      ...z,
      movement_ranges: z.movement_ranges.map((r) => ({ ...r, ...ROM_NORMAL }))
    }));
  const markStrengthNormal = (i: number) =>
    onChange((z) => ({
      ...z,
      muscle_strength: z.muscle_strength.map((r, ri) =>
        ri === i ? { ...r, ...STRENGTH_NORMAL } : r
      )
    }));
  const markAllStrengthNormal = () =>
    onChange((z) => ({
      ...z,
      muscle_strength: z.muscle_strength.map((r) => ({ ...r, ...STRENGTH_NORMAL }))
    }));

  const setStrength = (i: number, key: keyof StrengthRow, value: string) =>
    onChange((z) => ({
      ...z,
      muscle_strength: z.muscle_strength.map((r, ri) => (ri === i ? { ...r, [key]: value } : r))
    }));
  // Una fila de fuerza es "alterada" si hay dolor o Daniels < 5.
  const strengthAltered = (r: StrengthRow): boolean => isStrengthRowAltered(r.daniels, r.pain);
  const addStrength = () =>
    onChange((z) => ({ ...z, muscle_strength: [...z.muscle_strength, { ...emptyStrengthRow }] }));
  const removeStrength = (i: number) =>
    onChange((z) => ({
      ...z,
      muscle_strength:
        z.muscle_strength.length === 1
          ? z.muscle_strength
          : z.muscle_strength.filter((_, ri) => ri !== i)
    }));

  const setTestResult = (name: string, key: keyof TestResult, value: string) =>
    onChange((z) => {
      const prev = z.special_results[name] ?? { result: '', notes: '' };
      return {
        ...z,
        special_results: {
          ...z.special_results,
          [name]: { ...prev, [key]: value }
        }
      };
    });

  // Deja en "negativo/normal" todas las pruebas de un grupo que aún no se hayan
  // valorado (no pisa las que ya marcaste positivas). Acelera mucho: un toque
  // por grupo (ligamentos, manguito, etc.) y solo editas las positivas.
  const markGroupNegative = (groupName: string) =>
    onChange((z) => {
      const next = { ...z.special_results };
      for (const t of catalog?.specialTests ?? []) {
        if (t.group !== groupName) continue;
        const neg = negativeOptionFor(t);
        if (!neg) continue;
        const prev = next[t.name] ?? { result: '', notes: '' };
        if (prev.result) continue; // respeta lo ya valorado
        next[t.name] = { ...prev, result: neg };
      }
      return { ...z, special_results: next };
    });

  // Agrupa las pruebas del catálogo por su subtítulo, preservando el orden.
  const groupedTests = useMemo(() => {
    if (!catalog) return [];
    const groups: { group: string; tests: typeof catalog.specialTests }[] = [];
    for (const t of catalog.specialTests) {
      let g = groups.find((x) => x.group === t.group);
      if (!g) {
        g = { group: t.group, tests: [] };
        groups.push(g);
      }
      g.tests.push(t);
    }
    return groups;
  }, [catalog]);

  return (
    <div className="zone-card">
      <div className="zone-card-head">
        <label style={{ flex: 1 }}>
          Zona a evaluar
          <select value={zone.zone_id} onChange={(e) => changeZone(e.target.value)}>
            <option value="">— Seleccionar zona —</option>
            {ZONE_CATALOGS.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          onClick={onRemove}
          aria-label={`Quitar zona ${index + 1}`}
        >
          Quitar zona
        </button>
      </div>

      {!zone.zone_id ? (
        <p className="muted" style={{ margin: '4px 2px 0' }}>
          Selecciona una zona para desplegar su batería de evaluación.
        </p>
      ) : (
        <>
          {/* A. Dolor */}
          <p className="zone-subtitle">A. Valoración del dolor</p>
          <div className="form-grid">
            <label>
              Localización exacta
              <input
                value={zone.pain_location}
                onChange={(e) => setZoneField('pain_location', e.target.value)}
              />
            </label>
            <div className="eva-field span-2">
              <div className="eva-head">
                <span>
                  Intensidad del dolor (EVA 0-10):{' '}
                  <strong>
                    {zone.pain_intensity === '' ? 'Sin registrar' : `${zone.pain_intensity}/10`}
                  </strong>
                </span>
                {zone.pain_intensity !== '' && (
                  <button
                    type="button"
                    className="eva-clear"
                    onClick={() => setZoneField('pain_intensity', '')}
                  >
                    Limpiar
                  </button>
                )}
              </div>
              <input
                id={`zone-${index}-pain-intensity`}
                className="eva-range"
                type="range"
                min={0}
                max={10}
                step={1}
                value={zone.pain_intensity === '' ? 0 : Number(zone.pain_intensity)}
                onChange={(e) => setZoneField('pain_intensity', e.target.value)}
                aria-label="Intensidad del dolor de 0 a 10"
              />
            </div>
            <label>
              Tipo de dolor
              <select
                value={zone.pain_type}
                onChange={(e) => setZoneField('pain_type', e.target.value)}
              >
                <option value="">—</option>
                {PAIN_TYPE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Factores agravantes
              <input
                value={zone.aggravating_factors}
                onChange={(e) => setZoneField('aggravating_factors', e.target.value)}
              />
            </label>
            <label className="span-2">
              Factores que alivian
              <input
                value={zone.easing_factors}
                onChange={(e) => setZoneField('easing_factors', e.target.value)}
              />
            </label>
          </div>

          {/* B. ROM */}
          <p className="zone-subtitle">B. Rangos de movimiento (ROM)</p>
          <div className={`clinical-table ${showRomDetails ? 'detailed' : 'compact'}`}>
            {zone.movement_ranges.map((row, i) => {
              const norm = catalog ? getRomNorm(catalog.id, row.movement) : undefined;
              const rangeClass =
                row.range === 'Completo'
                  ? 'ok'
                  : row.range === 'Limitado'
                    ? 'warn'
                    : row.range === 'Funcional'
                      ? 'neutral'
                      : 'muted';
              return (
                <div
                  className={`clinical-table-row rom-row ${showRomDetails ? 'detailed' : 'compact'} ${
                    romAltered(row) ? 'is-altered' : ''
                  }`}
                  key={`rom-${i}`}
                >
                  <select
                    aria-label="Movimiento"
                    value={row.movement}
                    onChange={(e) => setRom(i, 'movement', e.target.value)}
                  >
                    <option value="">Movimiento…</option>
                    {catalog?.movements.map((mv) => (
                      <option key={mv} value={mv}>
                        {mv}
                      </option>
                    ))}
                  </select>
                  {showRomDetails && (
                    <select
                      aria-label="Tipo de movimiento"
                      value={row.type}
                      onChange={(e) => setRom(i, 'type', e.target.value)}
                    >
                      <option value="">Tipo…</option>
                      <option value="Activo">Activo</option>
                      <option value="Pasivo">Pasivo</option>
                    </select>
                  )}
                  <input
                    aria-label="Grados lado afectado"
                    placeholder={norm ? `Afect. (nl ${norm})` : 'Grados °'}
                    inputMode="numeric"
                    value={row.degrees}
                    onChange={(e) => setRomDegrees(i, e.target.value)}
                  />
                  {showRomDetails && (
                    <input
                      aria-label="Grados lado sano"
                      placeholder="Sano °"
                      inputMode="numeric"
                      value={row.degrees_healthy}
                      onChange={(e) => setRom(i, 'degrees_healthy', e.target.value)}
                    />
                  )}
                  {showRomDetails ? (
                    <select
                      aria-label="Rango"
                      value={row.range}
                      onChange={(e) => setRom(i, 'range', e.target.value)}
                    >
                      <option value="">Rango…</option>
                      {ROM_RANGE_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className={`rom-range-badge ${rangeClass}`}
                      title="Rango (se calcula solo con los grados)"
                    >
                      {row.range || '—'}
                    </span>
                  )}
                  <button
                    type="button"
                    className={`pain-toggle ${row.pain === 'Sí' ? 'is-pain' : ''}`}
                    onClick={() => setRom(i, 'pain', row.pain === 'Sí' ? 'No' : 'Sí')}
                    aria-pressed={row.pain === 'Sí'}
                    aria-label="Dolor en el movimiento (toca para alternar)"
                    title="Toca para alternar: sin dolor / con dolor"
                  >
                    {row.pain === 'Sí' ? '⚠ Con dolor' : 'Sin dolor'}
                  </button>
                  {showRomDetails && (
                    <input
                      aria-label="Notas del movimiento"
                      placeholder="Notas"
                      value={row.notes}
                      onChange={(e) => setRom(i, 'notes', e.target.value)}
                    />
                  )}
                  <div className="row-actions">
                    <button
                      type="button"
                      className="secondary row-normal-btn"
                      onClick={() => markRomNormal(i)}
                      title="Marcar normal (Activo · Completo · Sin dolor)"
                      aria-label={`Marcar ${row.movement || 'movimiento'} como normal`}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => removeRom(i)}
                      aria-label="Quitar movimiento"
                    >
                      −
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="zone-table-actions">
            <button type="button" className="secondary" onClick={addRom}>
              + Agregar movimiento
            </button>
            <button type="button" className="secondary" onClick={markAllRomNormal}>
              ✓ Marcar todos normales
            </button>
            <button
              type="button"
              className="link-button zone-details-toggle"
              onClick={() => setShowRomDetails((v) => !v)}
            >
              {showRomDetails ? '− Ocultar detalles' : '+ Detalles (tipo, sano, notas)'}
            </button>
          </div>

          {/* C. Fuerza */}
          <p className="zone-subtitle">C. Fuerza muscular (Daniels)</p>
          <div className={`clinical-table ${showStrengthDetails ? 'detailed' : 'compact'}`}>
            {zone.muscle_strength.map((row, i) => (
              <div
                className={`clinical-table-row strength-row ${
                  showStrengthDetails ? 'detailed' : 'compact'
                } ${strengthAltered(row) ? 'is-altered' : ''}`}
                key={`str-${i}`}
              >
                <select
                  aria-label="Músculo o grupo"
                  value={row.muscle}
                  onChange={(e) => setStrength(i, 'muscle', e.target.value)}
                >
                  <option value="">Músculo…</option>
                  {catalog?.muscles.map((mu) => (
                    <option key={mu} value={mu}>
                      {mu}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Escala de Daniels"
                  value={row.daniels}
                  onChange={(e) => setStrength(i, 'daniels', e.target.value)}
                >
                  <option value="">Daniels…</option>
                  {DANIELS_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`pain-toggle ${row.pain === 'Sí' ? 'is-pain' : ''}`}
                  onClick={() => setStrength(i, 'pain', row.pain === 'Sí' ? 'No' : 'Sí')}
                  aria-pressed={row.pain === 'Sí'}
                  aria-label="Dolor con la contracción (toca para alternar)"
                  title="Toca para alternar: sin dolor / con dolor"
                >
                  {row.pain === 'Sí' ? '⚠ Con dolor' : 'Sin dolor'}
                </button>
                {showStrengthDetails && (
                  <input
                    aria-label="Notas de fuerza"
                    placeholder="Notas"
                    value={row.notes}
                    onChange={(e) => setStrength(i, 'notes', e.target.value)}
                  />
                )}
                <div className="row-actions">
                  <button
                    type="button"
                    className="secondary row-normal-btn"
                    onClick={() => markStrengthNormal(i)}
                    title="Marcar normal (Daniels 5 · Sin dolor)"
                    aria-label={`Marcar ${row.muscle || 'músculo'} como normal`}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => removeStrength(i)}
                    aria-label="Quitar músculo"
                  >
                    −
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="zone-table-actions">
            <button type="button" className="secondary" onClick={addStrength}>
              + Agregar músculo
            </button>
            <button type="button" className="secondary" onClick={markAllStrengthNormal}>
              ✓ Marcar todos normales
            </button>
            <button
              type="button"
              className="link-button zone-details-toggle"
              onClick={() => setShowStrengthDetails((v) => !v)}
            >
              {showStrengthDetails ? '− Ocultar notas' : '+ Notas'}
            </button>
          </div>

          {/* D. Pruebas especiales (catálogo de la zona) */}
          <p className="zone-subtitle">D. Pruebas especiales / ortopédicas</p>
          {groupedTests.map((g) => (
            <div className="test-group" key={g.group}>
              <div className="test-group-head">
                <p className="test-group-title">{g.group}</p>
                {g.tests.some((t) => negativeOptionFor(t)) && (
                  <button
                    type="button"
                    className="link-button test-group-neg"
                    onClick={() => markGroupNegative(g.group)}
                    title="Marcar negativas/normales las pruebas sin valorar de este grupo"
                  >
                    Todas negativas
                  </button>
                )}
              </div>
              {g.tests.map((t) => {
                const r = zone.special_results[t.name] ?? { result: '', notes: '' };
                const options = t.options ?? [...DEFAULT_TEST_OPTIONS];
                return (
                  <div className="test-row" key={t.name}>
                    <div className="test-info">
                      <span className="test-name">{t.name}</span>
                      {t.note && <span className="test-note">{t.note}</span>}
                    </div>
                    <div className="test-inputs">
                      {t.input === 'seconds' ? (
                        <input
                          aria-label={`Segundos ${t.name}`}
                          inputMode="numeric"
                          placeholder="seg"
                          value={r.result}
                          onChange={(e) => setTestResult(t.name, 'result', e.target.value)}
                        />
                      ) : t.input === 'text' ? (
                        <input
                          aria-label={`Resultado ${t.name}`}
                          placeholder="Resultado"
                          value={r.result}
                          onChange={(e) => setTestResult(t.name, 'result', e.target.value)}
                        />
                      ) : (
                        <select
                          aria-label={`Resultado ${t.name}`}
                          value={r.result}
                          onChange={(e) => setTestResult(t.name, 'result', e.target.value)}
                        >
                          <option value="">No valorado</option>
                          {options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      )}
                      <input
                        aria-label={`Notas ${t.name}`}
                        placeholder="Notas"
                        value={r.notes}
                        onChange={(e) => setTestResult(t.name, 'notes', e.target.value)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* E. Palpación */}
          <p className="zone-subtitle">E. Palpación</p>
          <label className="span-2">
            Hallazgos
            <textarea
              rows={2}
              placeholder="Tono muscular, puntos gatillo, temperatura, edema articular."
              value={zone.palpation}
              onChange={(e) => setZoneField('palpation', e.target.value)}
            />
          </label>
        </>
      )}
    </div>
  );
}
