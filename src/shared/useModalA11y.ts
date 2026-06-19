import { useEffect, useRef } from 'react';

// Accesibilidad de modales: foco inicial dentro del diálogo, ciclo de Tab atrapado
// (no se escapa al fondo), cierre con Escape y bloqueo del scroll de fondo. Al
// cerrar, devuelve el foco al elemento que lo tenía. Reutiliza el patrón que ya
// tenía ConfirmDialog y lo extiende con focus-trap real para los modales grandes
// (cobro, nueva cita, IA, consentimiento), que antes dejaban escapar el Tab.
export function useModalA11y<T extends HTMLElement>(onClose: () => void, active = true) {
  const ref = useRef<T>(null);
  // El callback puede cambiar de identidad cada render; lo guardamos en una ref
  // para no re-ejecutar el efecto (y re-enfocar) en cada render del modal.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const getFocusable = (): HTMLElement[] => {
      if (!node) return [];
      return Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
    };

    (getFocusable()[0] ?? node)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const els = getFocusable();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && (activeEl === first || activeEl === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [active]);

  return ref;
}
