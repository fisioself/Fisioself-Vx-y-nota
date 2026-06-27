import { describe, expect, it } from 'vitest';
import {
  romRowsForCatalog,
  strengthRowsForCatalog,
  cleanRomRows,
  cleanStrengthRows
} from './evaluationFormHelpers';
import {
  getZoneCatalog,
  ROM_RANGE_OPTIONS,
  DANIELS_OPTIONS,
  classifyRom,
  rangeFromDegrees,
  getRomNormDegrees,
  negativeOptionFor
} from './evaluationCatalog';

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

describe('clasificación de ROM por grados', () => {
  it('lee el normal de referencia como número', () => {
    // hombro:Flexión = 180°
    expect(getRomNormDegrees('hombro', 'Flexión')).toBe(180);
    expect(getRomNormDegrees('hombro', 'Movimiento inexistente')).toBeUndefined();
  });

  it('clasifica normal cuando los grados alcanzan el normal', () => {
    expect(classifyRom('hombro', 'Flexión', '180')).toBe('normal');
    expect(classifyRom('hombro', 'Flexión', '200')).toBe('normal');
  });

  it('clasifica limitado cuando los grados quedan por debajo', () => {
    expect(classifyRom('hombro', 'Flexión', '120')).toBe('limitado');
  });

  it('es unknown sin grados o sin normal de referencia', () => {
    expect(classifyRom('hombro', 'Flexión', '')).toBe('unknown');
    expect(classifyRom('mano_muneca', 'Flexión de dedos', '90')).toBe('unknown');
  });

  it('deduce el rango (Completo / Limitado) desde los grados', () => {
    expect(rangeFromDegrees('hombro', 'Flexión', '180')).toBe('Completo');
    expect(rangeFromDegrees('hombro', 'Flexión', '120')).toBe('Limitado');
    expect(rangeFromDegrees('hombro', 'Flexión', '')).toBe('');
  });
});

describe('negativeOptionFor — "Marcar todas negativas"', () => {
  it('elige "Negativo" cuando existe', () => {
    expect(negativeOptionFor({ name: 'X', group: 'G' })).toBe('Negativo');
    expect(
      negativeOptionFor({ name: 'X', group: 'G', options: ['Positivo', 'Negativo', 'No valorado'] })
    ).toBe('Negativo');
  });

  it('elige la opción normal/estable cuando no hay "Negativo"', () => {
    expect(
      negativeOptionFor({ name: 'X', group: 'G', options: ['Inestable', 'Estable', 'No valorado'] })
    ).toBe('Estable');
    expect(
      negativeOptionFor({
        name: 'X',
        group: 'G',
        options: ['> 10mm (hiperpronación)', 'Normal', 'No valorado']
      })
    ).toBe('Normal');
    expect(
      negativeOptionFor({
        name: 'X',
        group: 'G',
        options: ['Cumple criterios (requiere Rx)', 'No cumple (seguro para carga)', 'No valorado']
      })
    ).toBe('No cumple (seguro para carga)');
  });

  it('es null para pruebas de segundos/texto', () => {
    expect(negativeOptionFor({ name: 'X', group: 'G', input: 'seconds' })).toBeNull();
    expect(negativeOptionFor({ name: 'X', group: 'G', input: 'text' })).toBeNull();
  });

  it('es null cuando ninguna opción representa un negativo claro', () => {
    expect(
      negativeOptionFor({
        name: 'X',
        group: 'G',
        options: ['Centralización', 'Periferización', 'Sin cambio', 'No valorado']
      })
    ).toBeNull();
  });

  it('cubre las pruebas con opción negativa en todo el catálogo de rodilla', () => {
    const knee = getZoneCatalog('rodilla')!;
    // La mayoría de pruebas ligamentarias/meniscales deben tener negativo.
    const withNeg = knee.specialTests.filter((t) => negativeOptionFor(t));
    expect(withNeg.length).toBeGreaterThan(5);
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
