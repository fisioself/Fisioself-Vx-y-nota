import { describe, expect, it } from 'vitest';
import { isRomRowAltered, isStrengthRowAltered } from './clinicalFindings';

describe('isRomRowAltered', () => {
  it('marks a limited range as altered', () => {
    expect(isRomRowAltered('Limitado', 'No')).toBe(true);
  });
  it('marks pain as altered regardless of range', () => {
    expect(isRomRowAltered('Completo', 'Sí')).toBe(true);
  });
  it('is not altered when complete and pain-free', () => {
    expect(isRomRowAltered('Completo', 'No')).toBe(false);
    expect(isRomRowAltered('', 'No')).toBe(false);
    expect(isRomRowAltered(null, null)).toBe(false);
  });
});

describe('isStrengthRowAltered', () => {
  it('marks Daniels < 5 as altered', () => {
    expect(isStrengthRowAltered('4 - Movimiento contra resistencia moderada', 'No')).toBe(true);
    expect(isStrengthRowAltered('0 - Sin contracción', 'No')).toBe(true);
  });
  it('marks pain as altered', () => {
    expect(isStrengthRowAltered('5 - Fuerza normal', 'Sí')).toBe(true);
  });
  it('is not altered with Daniels 5 and no pain', () => {
    expect(isStrengthRowAltered('5 - Fuerza normal', 'No')).toBe(false);
    expect(isStrengthRowAltered('', 'No')).toBe(false);
    expect(isStrengthRowAltered(null, null)).toBe(false);
  });
});
