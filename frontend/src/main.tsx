import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ════════════════════════════════════════════════════════════════════════════
// PWA — Register service worker (handled by vite-plugin-pwa)
// ════════════════════════════════════════════════════════════════════════════
// vite-plugin-pwa with registerType: 'autoUpdate' handles registration
// automatically. This block provides a fallback for custom update logic.
// The 'registerSW' hook from virtual:pwa-register is used in App.tsx for
// the update-available toast (Sprint 5).

