import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import './ui/styles/global.css';

// Offline-first: the service worker precaches the whole app shell.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
