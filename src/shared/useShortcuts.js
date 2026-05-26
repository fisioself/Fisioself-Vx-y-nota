import { useEffect } from 'react';

/**
 * Hook para manejar atajos de teclado globales.
 * @param {Array<{ key: string, ctrl: boolean, shift: boolean, action: Function }>} shortcuts 
 */
export function useShortcuts(shortcuts) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ignorar si estamos escribiendo en un input/textarea genérico a menos que requiera ctrl/cmd
      const targetTag = event.target.tagName.toLowerCase();
      const isInput = targetTag === 'input' || targetTag === 'textarea';

      shortcuts.forEach((shortcut) => {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;

        if (keyMatch && ctrlMatch && shiftMatch) {
          // Si requiere ctrl/cmd, normalmente queremos prevenir el comportamiento por defecto (ej. Ctrl+S)
          if (shortcut.ctrl) {
            event.preventDefault();
          } else if (isInput) {
            // Si no requiere modificador y estamos en un input, no hacemos nada
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
