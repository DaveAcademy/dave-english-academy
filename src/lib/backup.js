// backup.js
// Since this version has no server, "backup" means two things:
//  1. A rolling automatic copy kept in the browser, so an accidental
//     clear-of-one-key doesn't lose everything (best-effort, not a
//     substitute for #2).
//  2. A manual "Download backup" that saves a real .json file you can put
//     in Google Drive, email to yourself, etc. - this is the one that
//     actually survives losing the phone or clearing browser data.

import { exportAllData, importAllData } from './db';

const AUTO_BACKUP_KEY = 'dea_autobackup';

export async function writeAutoBackup() {
  try {
    const data = await exportAllData();
    localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('Auto-backup failed', e);
    return false;
  }
}

export function getAutoBackupTimestamp() {
  try {
    const raw = localStorage.getItem(AUTO_BACKUP_KEY);
    if (!raw) return null;
    return JSON.parse(raw).exported_at || null;
  } catch (e) {
    return null;
  }
}

export async function downloadBackup() {
  const data = await exportAllData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `dave-academy-backup-${dateStamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (e) {
        reject(new Error('That file is not a valid backup.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}

export async function restoreFromFile(file) {
  const data = await readBackupFile(file);
  await importAllData(data);
}
