// AiType lo define la capa de servicio (services/aiService); se reexporta aquí
// por conveniencia para los consumidores de session-notes.
export type { AiType } from '../../services/aiService';

export interface PendingConsult {
  type: string;
  label: string;
  input: string;
  output: string;
}

export interface AiConsultSavePayload extends PendingConsult {
  validated: boolean;
  alsoInsert: boolean;
  validationNotes: string | null;
}
