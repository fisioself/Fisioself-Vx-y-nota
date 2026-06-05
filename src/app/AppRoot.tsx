import { OnlineStatus } from './OnlineStatus';
import { PwaInstallBanner } from './PwaInstallBanner';
import { App } from '../App';
import './offline.css';
import './pwa.css';

export function AppRoot() {
  return (
    <>
      <OnlineStatus />
      <PwaInstallBanner />
      <App />
    </>
  );
}
