import { useMemo } from 'react';
import {
  ZONE_CATALOGS,
  getZoneCatalog,
  DEFAULT_TEST_OPTIONS,
  DANIELS_OPTIONS,
  ROM_RANGE_OPTIONS,
  getRomNorm,
  PAIN_TYPE_OPTIONS
} from './evaluationCatalog';
import {
  emptyRomRow,
  emptyStrengthRow,
  romRowsForCatalog,
  strengthRowsForCatalog
} from './evaluationFormHelpers';
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

  const setStrength = (i: number, key: keyof StrengthRow, value: string) =>
    onChange((z) => ({
      ...z,
      muscle_strength: z.muscle_strength.map((r, ri) => (ri === i ? { ...r, [key]: value } : r))
    }));
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
          <div className="clinical-table">
            {zone.movement_ranges.map((row, i) => (
              <div className="clinical-table-row rom-row" key={`rom-${i}`}>
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
                <select
                  aria-label="Tipo de movimiento"
                  value={row.type}
                  onChange={(e) => setRom(i, 'type', e.target.value)}
                >
                  <option value="">Tipo…</option>
                  <option value="Activo">Activo</option>
                  <option value="Pasivo">Pasivo</option>
                </select>
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
                <input
                  aria-label="Grados lado afectado"
                  placeholder={
                    catalog && getRomNorm(catalog.id, row.movement)
                      ? `Afect. (nl ${getRomNorm(catalog.id, row.movement)})`
                      : 'Grados afectado °'
                  }
                  inputMode="numeric"
                  value={row.degrees}
                  onChange={(e) => setRom(i, 'degrees', e.target.value)}
                />
                <input
                  aria-label="Grados lado sano"
                  placeholder="Sano °"
                  inputMode="numeric"
                  value={row.degrees_healthy}
                  onChange={(e) => setRom(i, 'degrees_healthy', e.target.value)}
                />
                <select
                  aria-label="¿Genera dolor?"
                  value={row.pain}
                  onChange={(e) => setRom(i, 'pain', e.target.value)}
                >
                  <option value="">¿Dolor?</option>
                  <option value="Sí">Sí</option>
                  <option value="No">No</option>
                </select>
                <input
                  aria-label="Notas del movimiento"
                  placeholder="Notas"
                  value={row.notes}
                  onChange={(e) => setRom(i, 'notes', e.target.value)}
                />
                <button type="button" className="secondary" onClick={() => removeRom(i)}>
                  −
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="secondary" onClick={addRom}>
            + Agregar movimiento
          </button>

          {/* C. Fuerza */}
          <p className="zone-subtitle">C. Fuerza muscular (Daniels)</p>
          <div className="clinical-table">
            {zone.muscle_strength.map((row, i) => (
              <div className="clinical-table-row strength-row" key={`str-${i}`}>
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
                <select
                  aria-label="¿Genera dolor?"
                  value={row.pain}
                  onChange={(e) => setStrength(i, 'pain', e.target.value)}
                >
                  <option value="">¿Dolor?</option>
                  <option value="Sí">Sí</option>
                  <option value="No">No</option>
                </select>
                <input
                  aria-label="Notas de fuerza"
                  placeholder="Notas"
                  value={row.notes}
                  onChange={(e) => setStrength(i, 'notes', e.target.value)}
                />
                <button type="button" className="secondary" onClick={() => removeStrength(i)}>
                  −
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="secondary" onClick={addStrength}>
            + Agregar músculo
          </button>

          {/* D. Pruebas especiales (catálogo de la zona) */}
          <p className="zone-subtitle">D. Pruebas especiales / ortopédicas</p>
          {groupedTests.map((g) => (
            <div className="test-group" key={g.group}>
              <p className="test-group-title">{g.group}</p>
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
