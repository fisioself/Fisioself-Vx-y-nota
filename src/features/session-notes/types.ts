export interface AiType {
  id: string;
  label: string;
  traceable?: boolean;
}

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
