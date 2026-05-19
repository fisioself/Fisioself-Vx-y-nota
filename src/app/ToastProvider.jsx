import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext({ notify: () => {} });

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (toast) => {
      const id = crypto.randomUUID?.() || String(Date.now());
      const next = { id, tone: 'info', ...toast };
      setToasts((current) => [...current, next]);
      window.setTimeout(() => dismiss(id), toast.duration || 4200);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`} role="status">
            <span>{toast.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismiss(toast.id)}
              aria-label="Cerrar notificacion"
            >
              x
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
