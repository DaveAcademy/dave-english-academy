import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './i18n';
import { registerSW } from 'virtual:pwa-register';
import { initWebsiteFont } from './lib/websiteFont';
import { initSiteTheme } from './lib/siteTheme';

// Apply the admin-chosen global font + theme (defaults apply until saved
// values arrive; index.html pre-paints the cached theme to avoid a flash).
initWebsiteFont();
initSiteTheme();

const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('New version available. Reload to update?')) {
      window.location.reload();
    }
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
});

if ('serviceWorker' in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  navigator.serviceWorker.addEventListener('updatefound', () => {
    const registration = navigator.serviceWorker.controller;
    if (registration) {
      updateSW();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
