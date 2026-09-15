// notificationPrefs.js
// Whether the signed-in user *wants* chat browser notifications - a
// separate concept from the browser's own Notification.permission
// (granted/denied/default). Local to this browser/device by design (no
// DB column - see Chat Phase 3.2 scope: no database changes).

const KEY = 'chatNotificationsEnabled';

export function isChatNotificationsEnabled() {
  return localStorage.getItem(KEY) === 'true';
}

export function setChatNotificationsEnabled(enabled) {
  localStorage.setItem(KEY, enabled ? 'true' : 'false');
}
