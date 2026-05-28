const PREFIX = 'fisioself.notas-vx.draft';

interface DraftKeyParams {
  patientId?: string | null;
  sessionNumber?: number | string | null;
  noteId?: string | null;
}

export const getDraftKey = ({ patientId, sessionNumber, noteId }: DraftKeyParams): string =>
  `${PREFIX}.${patientId || 'no-patient'}.${noteId || 'new'}.${sessionNumber || '0'}`;

export const getEvaluationDraftKey = (patientId?: string | null): string =>
  `${PREFIX}.evaluation.${patientId || 'new'}`;

export const draftStorage = {
  get(key: string): string {
    try {
      return window.localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  },

  set(key: string, value: string): void {
    try {
      if (!value) {
        window.localStorage.removeItem(key);
        return;
      }
      window.localStorage.setItem(key, value);
    } catch {
      // Draft persistence is best-effort only.
    }
  },

  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Best-effort only.
    }
  },

  clearAll(): void {
    try {
      const storage = window.localStorage;
      const toRemove: string[] = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && key.startsWith(`${PREFIX}.`)) toRemove.push(key);
      }
      toRemove.forEach((key) => storage.removeItem(key));
    } catch {
      // Best-effort only.
    }
  }
};
