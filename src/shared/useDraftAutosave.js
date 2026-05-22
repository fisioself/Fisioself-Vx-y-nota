import { useEffect } from 'react';
import { draftStorage } from './draftStorage.js';

export function useDraftAutosave(draftKey, values, delayMs = 1000) {
  useEffect(() => {
    if (!draftKey) return;
    const handler = setTimeout(() => {
      draftStorage.set(draftKey, JSON.stringify(values));
    }, delayMs);
    return () => clearTimeout(handler);
  }, [values, draftKey, delayMs]);
}
