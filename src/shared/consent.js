// Named consents persisted in localStorage. Each key is versioned so that if
// the disclosure text changes materially we can bump the version and force a
// fresh acknowledgement.

const STORAGE_PREFIX = 'fisioself.consent.';

export const CONSENT_KEYS = Object.freeze({
  DICTATION: 'dictation.v1',
  AI: 'ai.v1'
});

const safeStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const consent = {
  has(key) {
    const storage = safeStorage();
    if (!storage) return false;
    try {
      return storage.getItem(`${STORAGE_PREFIX}${key}`) === 'granted';
    } catch {
      return false;
    }
  },

  grant(key) {
    const storage = safeStorage();
    if (!storage) return;
    try {
      storage.setItem(`${STORAGE_PREFIX}${key}`, 'granted');
    } catch {
      // Best-effort only.
    }
  },

  revoke(key) {
    const storage = safeStorage();
    if (!storage) return;
    try {
      storage.removeItem(`${STORAGE_PREFIX}${key}`);
    } catch {
      // Best-effort only.
    }
  }
};
