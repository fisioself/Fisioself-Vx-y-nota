// Matemática de comisión de tarjeta: lógica pura de dominio, sin dependencias de
// UI ni de Supabase. La usan tanto la capa de servicios (financeApi) como la UI
// de finanzas, por eso vive en shared/ (evita que services dependa de features).

export const CARD_COMMISSION = 0.0406;

// Lo que la terminal se queda (gasto de la clínica). El pago al paciente se
// registra en BRUTO; esta comisión se guarda aparte como gasto.
export const cardCommission = (gross: number) => Math.round(gross * CARD_COMMISSION * 100) / 100;

// Neto que realmente entra al banco. Solo para mostrar al cobrar (informativo);
// NO es lo que se descuenta del saldo del paciente.
export const netAfterCommission = (gross: number) =>
  Math.round(gross * (1 - CARD_COMMISSION) * 100) / 100;
