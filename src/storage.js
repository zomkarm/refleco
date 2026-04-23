// =============================================
// Reflect — storage.js
// Handles: IndexedDB (file handle),
//          File System Access API,
//          localStorage mirror
// =============================================

// ── IndexedDB ────────────────────────────────
// Used only to persist the FileSystemFileHandle
// across browser sessions (handles can't go in LS)

const IDB_NAME  = 'reflect-idb';
const IDB_STORE = 'handles';
const IDB_KEY   = 'journalFileHandle';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function idbGet(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

export async function idbSet(key, value) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

export async function idbDel(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── File System Access API ───────────────────

export const FS_SUPPORTED = ('showSaveFilePicker' in window);

export async function readFromFile(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  if (!text.trim()) return emptyJournal();
  try { return JSON.parse(text); }
  catch (_) { return emptyJournal(); }
}

export async function writeToFile(handle, data) {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

export async function verifyPermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

export async function pickNewFile(suggestedName) {
  return window.showSaveFilePicker({
    suggestedName,
    types: [{ description: 'Reflect Journal', accept: { 'application/json': ['.json'] } }],
  });
}

export async function pickExistingFile() {
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: 'Reflect Journal', accept: { 'application/json': ['.json'] } }],
    multiple: false,
  });
  return handle;
}

// ── localStorage mirror ───────────────────────

const LS_KEY = 'reflect_journal';

export function lsSave(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (_) {}
}

export function lsLoad() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : emptyJournal();
  } catch (_) { return emptyJournal(); }
}

// ── Data shape ────────────────────────────────

export function emptyJournal() {
  // pages: array of arrays of entries
  // entry: { id, text, date (timestamp ms) }
  return { pages: [[]] };
}

export function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}