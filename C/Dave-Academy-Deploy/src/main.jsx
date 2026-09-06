import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './i18n';

// The PWA service worker updates in the background (registerType:
// 'autoUpdate'), but an already-open tab keeps running its old JS until
// something reloads it - otherwise different tabs can silently end up
// running different deployed versions at once. Reload once when a new
// service worker takes over.
if ('serviceWorker' in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
