import { describe, expect, it } from 'vitest';
import {
  isRomRowAltered,
  isStrengthRowAltered,
  isSpo2Abnormal,
  isHeartRateAbnormal,
  isRespRateAbnormal,
  isBloodPressureAbnormal,
  SPO2_QUALITY_REASONS
} from './clinicalFindings';

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

describe('signos vitales fuera de referencia', () => {
  it('SpO₂: < 92 es anormal; vacío o implausible no', () => {
    expect(isSpo2Abnormal('89')).toBe(true);
    expect(isSpo2Abnormal('91.5')).toBe(true);
    expect(isSpo2Abnormal('92')).toBe(false);
    expect(isSpo2Abnormal('98')).toBe(false);
    expect(isSpo2Abnormal('')).toBe(false);
    expect(isSpo2Abnormal(null)).toBe(false);
    expect(isSpo2Abnormal('890')).toBe(false); // implausible (>100)
  });

  it('FC: < 50 o > 110 es anormal', () => {
    expect(isHeartRateAbnormal('45')).toBe(true);
    expect(isHeartRateAbnormal('120')).toBe(true);
    expect(isHeartRateAbnormal('72')).toBe(false);
    expect(isHeartRateAbnormal('')).toBe(false);
  });

  it('FR: < 10 o > 24 es anormal', () => {
    expect(isRespRateAbnormal('8')).toBe(true);
    expect(isRespRateAbnormal('28')).toBe(true);
    expect(isRespRateAbnormal('16')).toBe(false);
    expect(isRespRateAbnormal('')).toBe(false);
  });

  it('TA: parsea "S/D" y marca hiper/hipotensión', () => {
    expect(isBloodPressureAbnormal('150/95')).toBe(true); // hipertensión
    expect(isBloodPressureAbnormal('85/55')).toBe(true); // hipotensión
    expect(isBloodPressureAbnormal('120/80')).toBe(false);
    expect(isBloodPressureAbnormal('130 / 85')).toBe(false);
    expect(isBloodPressureAbnormal('texto libre')).toBe(false);
    expect(isBloodPressureAbnormal('')).toBe(false);
  });

  it('expone las causas rápidas de SpO₂ poco confiable', () => {
    expect(SPO2_QUALITY_REASONS).toContain('Manos frías');
    expect(SPO2_QUALITY_REASONS).toContain('Esmalte de uñas');
  });
});
