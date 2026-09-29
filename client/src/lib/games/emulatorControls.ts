// Local QA only: this module is reached solely behind import.meta.env.DEV +
// VITE_GAME_EMULATORS=1. No test account or network toggle ships in production.
import { disableNetwork, enableNetwork, type Firestore } from 'firebase/firestore';
export function mountEmulatorControls(db: Firestore) {
  const panel = document.createElement('aside');
  panel.setAttribute('aria-label', '本機模擬器測試');
  panel.style.cssText = 'position:fixed;bottom:0;left:0;z-index:99999;background:#fff;color:#111;padding:8px;font:14px sans-serif';
  const label = document.createElement('span'); label.textContent = '本機模擬器 ';
  const offline = document.createElement('button'); offline.textContent = '測試斷線';
  const online = document.createElement('button'); online.textContent = '測試恢復';
  const state = document.createElement('span'); state.setAttribute('role', 'status');
  offline.onclick = async () => {
    await fetch('http://127.0.0.1:8088/__qa/offline', { method: 'POST' });
    await disableNetwork(db); state.textContent = ' 本機資料庫網絡已中斷';
    // An optional local game fixture can respond by completing a synthetic round.
    document.querySelector('iframe')?.contentWindow?.postMessage({ type: 'qa-offline-round' }, 'http://127.0.0.1:8186');
  };
  online.onclick = async () => {
    await fetch('http://127.0.0.1:8088/__qa/online', { method: 'POST' });
    await enableNetwork(db); state.textContent = ' 本機資料庫網絡已恢復';
  };
  for (const b of [offline, online]) b.style.cssText = 'margin:3px;padding:5px;border:1px solid #333';
  panel.append(label, offline, online, state);
  if (document.body) document.body.append(panel);
  else window.addEventListener('DOMContentLoaded', () => document.body.append(panel), { once: true });
}
