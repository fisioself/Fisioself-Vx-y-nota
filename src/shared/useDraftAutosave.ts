import { useEffect } from 'react';
import { draftStorage } from './draftStorage';

export function useDraftAutosave(
  draftKey: string | null | undefined,
  values: unknown,
  delayMs = 1000
): void {
  useEffect(() => {
    if (!draftKey) return;
    const handler = setTimeout(() => {
      draftStorage.set(draftKey, JSON.stringify(values));
    }, delayMs);
    return () => clearTimeout(handler);
  }, [values, draftKey, delayMs]);
}
