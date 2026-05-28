import { OnlineStatus } from './OnlineStatus';
import { App } from '../App';
import './offline.css';

export function AppRoot() {
  return (
    <>
      <OnlineStatus />
      <App />
    </>
  );
}
