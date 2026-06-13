import type { Patient } from '../types/clinical';

export const exportToPdf = (patient: Patient | null): void => {
  if (!patient) return;
  window.print();
};
