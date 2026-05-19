import { describe, expect, it } from 'vitest';
import {
  PATIENT_STATUSES,
  SEX_OPTIONS,
  hasErrors,
  validatePatient,
  validateSessionNote
} from './clinicalValidation.js';

describe('clinicalValidation', () => {
  describe('validatePatient', () => {
    it('accepts a valid patient payload', () => {
      const errors = validatePatient({
        full_name: 'Paciente Prueba',
        email: 'paciente@example.com',
        sex: 'F',
        status: 'En tratamiento'
      });

      expect(errors).toEqual({});
      expect(hasErrors(errors)).toBe(false);
    });

    it('rejects short patient names', () => {
      const errors = validatePatient({ full_name: 'A' });
      expect(errors.full_name).toMatch(/al menos 2/i);
    });

    it('rejects invalid email, sex and status', () => {
      const errors = validatePatient({
        full_name: 'Paciente Prueba',
        email: 'correo-invalido',
        sex: 'X',
        status: 'Estado falso'
      });

      expect(errors.email).toMatch(/correo/i);
      expect(errors.sex).toMatch(/sexo/i);
      expect(errors.status).toMatch(/estado/i);
    });

    it('keeps patient enum constants explicit', () => {
      expect(PATIENT_STATUSES).toContain('En valoracion');
      expect(PATIENT_STATUSES).toContain('En tratamiento');
      expect(SEX_OPTIONS).toContain('Otro');
    });
  });

  describe('validateSessionNote', () => {
    it('accepts a valid note payload', () => {
      const errors = validateSessionNote({
        patient_id: '8fe9e728-9e1a-45a0-b9df-408c20a77a3d',
        raw_text: 'Paciente tolera ejercicios sin incremento de dolor.',
        eva: 4
      });

      expect(errors).toEqual({});
    });

    it('requires patient_id before saving notes', () => {
      const errors = validateSessionNote({ raw_text: 'Nota clinica valida', eva: 3 });
      expect(errors.patient_id).toMatch(/paciente/i);
    });

    it('requires meaningful clinical text', () => {
      const errors = validateSessionNote({
        patient_id: '8fe9e728-9e1a-45a0-b9df-408c20a77a3d',
        raw_text: '  ',
        eva: 3
      });

      expect(errors.raw_text).toMatch(/contenido clinico/i);
    });

    it('rejects EVA outside 0 to 10', () => {
      const high = validateSessionNote({
        patient_id: '8fe9e728-9e1a-45a0-b9df-408c20a77a3d',
        raw_text: 'Nota clinica valida',
        eva: 11
      });
      const low = validateSessionNote({
        patient_id: '8fe9e728-9e1a-45a0-b9df-408c20a77a3d',
        raw_text: 'Nota clinica valida',
        eva: -1
      });

      expect(high.eva).toMatch(/0 y 10/i);
      expect(low.eva).toMatch(/0 y 10/i);
    });
  });
});
