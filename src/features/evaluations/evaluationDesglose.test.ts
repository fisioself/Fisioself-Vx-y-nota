import { describe, expect, it } from 'vitest';
import {
  romRowsForCatalog,
  strengthRowsForCatalog,
  cleanRomRows,
  cleanStrengthRows
} from './evaluationFormHelpers';
import { getZoneCatalog, ROM_RANGE_OPTIONS, DANIELS_OPTIONS } from './evaluationCatalog';

describe('romRowsForCatalog', () => {
  it('itemizes every movement of the zone when nothing is saved', () => {
    const catalog = getZoneCatalog('mano_muneca')!;
    const rows = romRowsForCatalog('mano_muneca', []);
    expect(rows).toHaveLength(catalog.movements.length);
    expect(rows.map((r) => r.movement)).toEqual(catalog.movements);
    // Precargadas solo con el nombre: el resto vacío.
    expect(rows.every((r) => r.degrees === '' && r.range === '')).toBe(true);
  });

  it('fills saved values into the matching movement row', () => {
    const rows = romRowsForCatalog('rodilla', [
      { movement: 'Flexión', type: 'Activo', range: '', degrees: '120', degrees_healthy: '', pain: 'Sí', notes: '' }
    ]);
    const flexion = rows.find((r) => r.movement === 'Flexión');
    expect(flexion?.degrees).toBe('120');
    expect(flexion?.pain).toBe('Sí');
  });

  it('keeps a custom (off-catalog) saved movement at the end', () => {
    const catalog = getZoneCatalog('rodilla')!;
    const rows = romRowsForCatalog('rodilla', [
      { movement: 'Movimiento personalizado', type: '', range: 'Limitado', degrees: '', degrees_healthy: '', pain: '', notes: '' }
    ]);
    expect(rows).toHaveLength(catalog.movements.length + 1);
    expect(rows[rows.length - 1].movement).toBe('Movimiento personalizado');
  });

  it('returns a single empty row when the zone has no catalog', () => {
    expect(romRowsForCatalog('', [])).toHaveLength(1);
  });
});

describe('strengthRowsForCatalog', () => {
  it('itemizes every muscle of the zone', () => {
    const catalog = getZoneCatalog('hombro')!;
    const rows = strengthRowsForCatalog('hombro', []);
    expect(rows.map((r) => r.muscle)).toEqual(catalog.muscles);
  });
});

describe('cleanRomRows / cleanStrengthRows', () => {
  it('drops pre-filled rows that only carry the catalog name (no measurement)', () => {
    const rows = romRowsForCatalog('mano_muneca', []);
    expect(cleanRomRows(rows)).toHaveLength(0);
  });

  it('keeps a ROM row once it has a measurement', () => {
    const rows = romRowsForCatalog('mano_muneca', []);
    rows[0].degrees = '70';
    expect(cleanRomRows(rows)).toHaveLength(1);
  });

  it('defaults pain to "No" but that alone does not mark a row as assessed', () => {
    const rows = romRowsForCatalog('mano_muneca', []);
    expect(rows.every((r) => r.pain === 'No')).toBe(true);
    expect(cleanRomRows(rows)).toHaveLength(0);
  });

  it('keeps a row when pain is toggled to "Sí" (a positive finding)', () => {
    const rows = romRowsForCatalog('mano_muneca', []);
    rows[0].pain = 'Sí';
    expect(cleanRomRows(rows)).toHaveLength(1);
  });

  it('keeps a strength row only once Daniels/pain/notes are set', () => {
    const rows = strengthRowsForCatalog('hombro', []);
    expect(cleanStrengthRows(rows)).toHaveLength(0);
    rows[0].daniels = '4 - Movimiento contra resistencia moderada';
    expect(cleanStrengthRows(rows)).toHaveLength(1);
  });
});

describe('atajo "Normal" — valores válidos del catálogo', () => {
  // El botón "Normal" de ZoneEditor escribe estos valores; deben existir como
  // opciones reales del catálogo o el atajo dejaría un valor fuera de rango.
  it('"Completo" es una opción de rango de ROM', () => {
    expect(ROM_RANGE_OPTIONS).toContain('Completo');
  });
  it('"5 - Fuerza normal" es una opción de Daniels', () => {
    expect(DANIELS_OPTIONS).toContain('5 - Fuerza normal');
  });
});

describe('mano y muñeca — pruebas de nervio radial', () => {
  it('includes a couple of radial-nerve tests', () => {
    const catalog = getZoneCatalog('mano_muneca')!;
    const radial = catalog.specialTests.filter((t) => /radial/i.test(t.group));
    expect(radial.length).toBeGreaterThanOrEqual(2);
    const names = radial.map((t) => t.name).join(' | ');
    expect(names).toMatch(/Tinel/i);
    expect(names).toMatch(/ULNT|tensión neural/i);
  });
});
