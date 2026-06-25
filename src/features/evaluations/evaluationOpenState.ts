// Recuerda, por paciente, si el formulario de valoración estaba abierto, para
// reabrirlo al volver de otra pestaña sin perder el borrador (que vive aparte
// en localStorage). Usa sessionStorage: se limpia al cerrar la pestaña.
const openKey = (patientId: string) => `fisioself_eval_open_${patientId}`;

export const isEvaluationOpen = (patientId?: string | null): boolean => {
  if (!patientId) return false;
  try {
    return sessionStorage.getItem(openKey(patientId)) === '1';
  } catch {
    // sessionStorage puede lanzar en modo privado/incógnito: degradamos a cerrado.
    return false;
  }
};

export const setEvaluationOpen = (patientId: string | null | undefined, open: boolean): void => {
  if (!patientId) return;
  try {
    if (open) sessionStorage.setItem(openKey(patientId), '1');
    else sessionStorage.removeItem(openKey(patientId));
  } catch {
    // Ignoramos: la persistencia es una comodidad, no debe romper la UI.
  }
};
