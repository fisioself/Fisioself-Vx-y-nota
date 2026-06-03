import { useEffect, useRef } from 'react';

// Widget de Cloudflare Turnstile (CAPTCHA) sin dependencias externas: carga el
// script oficial de Cloudflare una sola vez y monta el widget. Devuelve el token
// por `onVerify`; ese token es de un solo uso, así que tras un login fallido hay
// que reiniciar el widget (ver `resetKey`).

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      theme?: 'light' | 'dark' | 'auto';
    }
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

// Carga el script de Turnstile una única vez para toda la app.
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('No se pudo cargar el verificador de seguridad (Turnstile).'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface TurnstileProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  // Se llama si el widget no pudo cargar/dibujarse (script bloqueado, red, etc.)
  // para que el login avise en vez de dejar el botón deshabilitado en silencio.
  onError?: (message: string) => void;
  // Cambiar este valor fuerza a re-montar el widget (token nuevo tras un fallo).
  resetKey?: number;
}

export function Turnstile({ siteKey, onVerify, onExpire, onError, resetKey }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Guardamos los callbacks en refs para no re-montar el widget cuando cambian.
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);
  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let widgetId: string | null = null;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onVerifyRef.current(token),
          'expired-callback': () => onExpireRef.current?.(),
          'error-callback': () =>
            onErrorRef.current?.('La verificación de seguridad falló. Reintenta.'),
          theme: 'auto'
        });
      })
      .catch(() => {
        if (!cancelled) {
          onErrorRef.current?.(
            'No se pudo cargar la verificación de seguridad. Revisa tu conexión.'
          );
        }
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // El widget ya pudo haber sido retirado; ignorar.
        }
      }
    };
  }, [siteKey, resetKey]);

  return <div ref={containerRef} />;
}
