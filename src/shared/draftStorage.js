const PREFIX = 'fisioself.notas-vx.draft';

export const getDraftKey = ({ patientId, sessionNumber }) =>
  `${PREFIX}.${patientId || 'no-patient'}.${sessionNumber || 'new'}`;

export const draftStorage = {
  get(key) {
    try {
      return window.localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  },

  set(key, value) {
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

  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Best-effort only.
    }
  },

  clearAll() {
    try {
      const storage = window.localStorage;
      const toRemove = [];
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
