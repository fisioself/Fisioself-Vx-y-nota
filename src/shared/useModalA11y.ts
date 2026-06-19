import { useEffect, useRef } from 'react';

// Bloqueo del scroll del body con CONTADOR de referencias, a nivel de módulo.
// Antes cada modal guardaba/restauraba document.body.style.overflow por su
// cuenta; con modales apilados (o uno que se desmonta fuera de orden) el valor
// "hidden" podía quedarse pegado y matar el scroll de toda la app. Con un
// contador, solo el PRIMER lock guarda el valor previo y solo el ÚLTIMO unlock
// lo restaura, sin importar el orden de apertura/cierre.
let scrollLockCount = 0;
let savedBodyOverflow = '';

function lockBodyScroll() {
  if (scrollLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLockCount += 1;
}

function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = savedBodyOverflow;
  }
}

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
    lockBodyScroll();

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
      unlockBodyScroll();
      prevFocus?.focus?.();
    };
  }, [active]);

  return ref;
}
