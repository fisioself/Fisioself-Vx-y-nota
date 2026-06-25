import { describe, expect, it } from 'vitest';
import { getPromScale, PROM_SCALES } from './promsCatalog';

describe('promsCatalog', () => {
  it('expone las 9 escalas con id único', () => {
    const ids = PROM_SCALES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'sppb',
        'odi',
        'ndi',
        'quickdash',
        'womac',
        'koos12',
        'lefs',
        'spadi',
        'tsk11'
      ])
    );
  });

  it('LEFS suma 0–80 (mayor = mejor) y exige 20 ítems', () => {
    const lefs = getPromScale('lefs')!;
    expect(lefs.score(Array(19).fill(4).concat([null]))).toBeNull();
    expect(lefs.score(Array(20).fill(4))?.display).toBe('80/80 · 100%');
    expect(lefs.score(Array(20).fill(0))?.interpretation).toContain('severa');
  });

  it('KOOS-12 transforma 100 - media*25 (mayor = mejor)', () => {
    const koos = getPromScale('koos12')!;
    expect(koos.score(Array(12).fill(0))?.display).toBe('100/100');
    expect(koos.score(Array(12).fill(4))?.display).toBe('0/100');
  });

  it('TSK-11 suma 11–44 e interpreta kinesiofobia alta', () => {
    const tsk = getPromScale('tsk11')!;
    expect(tsk.score(Array(11).fill(4))?.display).toBe('44/44');
    expect(tsk.score(Array(11).fill(4))?.interpretation).toContain('alta');
    expect(tsk.score(Array(11).fill(2))?.display).toBe('22/44');
  });

  it('SPADI promedia dolor y discapacidad en %', () => {
    const spadi = getPromScale('spadi')!;
    expect(spadi.score(Array(13).fill(10))?.display).toContain('100%');
    expect(spadi.score(Array(13).fill(0))?.display).toContain('0%');
  });

  it('SPPB suma los 3 componentes (0–12) e interpreta el riesgo', () => {
    const sppb = getPromScale('sppb')!;
    expect(sppb.score([null, null, null])).toBeNull();
    expect(sppb.score([4, 4, 4])).toEqual({
      display: '12/12',
      interpretation: expect.stringContaining('bajo riesgo')
    });
    expect(sppb.score([2, 2, 2])?.display).toBe('6/12');
    expect(sppb.score([2, 2, 2])?.interpretation).toContain('alto riesgo');
  });

  it('ODI normaliza a % sobre los ítems contestados', () => {
    const odi = getPromScale('odi')!;
    // 4 contestados < mínimo (5) → null
    expect(odi.score([1, 1, 1, 1, null, null, null, null, null, null])).toBeNull();
    // 5 ítems en 0 → 0%
    const all0 = odi.score([0, 0, 0, 0, 0, null, null, null, null, null]);
    expect(all0?.display).toContain('0%');
    expect(all0?.interpretation).toContain('mínima');
    // 5 ítems en 5 → 25/25 = 100%
    const allMax = odi.score([5, 5, 5, 5, 5, null, null, null, null, null]);
    expect(allMax?.display).toContain('100%');
  });

  it('QuickDASH aplica ((media-1)*25) y exige 10 ítems', () => {
    const qd = getPromScale('quickdash')!;
    const nine = Array(9).fill(3).concat([null, null]);
    expect(qd.score(nine)).toBeNull();
    const allOnes = Array(11).fill(1);
    expect(qd.score(allOnes)?.display).toBe('0/100');
    const allFives = Array(11).fill(5);
    expect(qd.score(allFives)?.display).toBe('100/100');
  });

  it('WOMAC requiere los 24 ítems y reporta total/96 + %', () => {
    const womac = getPromScale('womac')!;
    expect(womac.score(Array(23).fill(2).concat([null]))).toBeNull();
    const all2 = Array(24).fill(2);
    // 24*2 = 48 → 50%
    expect(womac.score(all2)?.display).toBe('48/96 · 50%');
    expect(womac.score(all2)?.interpretation).toContain('moderada');
  });
});
