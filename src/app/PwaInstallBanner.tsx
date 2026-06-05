import { usePwaInstall } from './usePwaInstall';
import { useSwUpdate } from './useSwUpdate';

export function PwaInstallBanner() {
  const { canInstall, install } = usePwaInstall();
  const { updateAvailable, applyUpdate } = useSwUpdate();

  if (updateAvailable) {
    return (
      <div className="pwa-banner pwa-banner--update" role="alert">
        <span>Nueva versión disponible</span>
        <button onClick={applyUpdate} className="pwa-banner__btn">
          Actualizar ahora
        </button>
      </div>
    );
  }

  if (canInstall) {
    return (
      <div className="pwa-banner pwa-banner--install" role="complementary">
        <span>Instala la app para usarla sin conexión</span>
        <button onClick={install} className="pwa-banner__btn">
          Instalar
        </button>
      </div>
    );
  }

  return null;
}
