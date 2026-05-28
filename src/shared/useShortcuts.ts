import { useEffect } from 'react';

export interface Shortcut {
  key: string;
  ctrl: boolean;
  shift: boolean;
  action: (event: KeyboardEvent) => void;
}

export function useShortcuts(shortcuts: Shortcut[]): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const targetTag = target?.tagName.toLowerCase() ?? '';
      const isInput = targetTag === 'input' || targetTag === 'textarea';

      shortcuts.forEach((shortcut) => {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = shortcut.ctrl
          ? event.ctrlKey || event.metaKey
          : !event.ctrlKey && !event.metaKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;

        if (keyMatch && ctrlMatch && shiftMatch) {
          if (shortcut.ctrl) {
            event.preventDefault();
          } else if (isInput) {
            return;
          }

          shortcut.action(event);
        }
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
