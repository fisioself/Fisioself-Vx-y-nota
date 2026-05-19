import { OnlineStatus } from './OnlineStatus.jsx';
import { App } from '../App.jsx';
import './offline.css';

export function AppRoot() {
  return (
    <>
      <OnlineStatus />
      <App />
    </>
  );
}
