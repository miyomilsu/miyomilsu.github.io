/**
 * IndexedDB wrapper for game history
 * localStorage (5MB) → IndexedDB (사실상 무제한)
 */

const DB_NAME = 'yacht-db';
const DB_VERSION = 1;
const STORE_NAME = 'game-history';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode) {
  return openDB().then(db => db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllGames() {
  const store = await tx('readonly');
  const all = await reqToPromise(store.getAll());
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getGame(id) {
  const store = await tx('readonly');
  return reqToPromise(store.get(id));
}

export async function putGame(record) {
  const store = await tx('readwrite');
  return reqToPromise(store.put(record));
}

export async function updateGame(id, updates) {
  const store = await tx('readwrite');
  const existing = await reqToPromise(store.get(id));
  if (existing) {
    Object.assign(existing, updates);
    await reqToPromise(store.put(existing));
  }
}

/**
 * localStorage → IndexedDB 마이그레이션
 * localStorage에 'yacht-history' 키가 있으면 IndexedDB로 옮기고 삭제
 */
export async function migrateFromLocalStorage() {
  const raw = localStorage.getItem('yacht-history');
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    const entries = Object.entries(data);
    if (entries.length === 0) {
      localStorage.removeItem('yacht-history');
      return;
    }

    const db = await openDB();
    const txn = db.transaction(STORE_NAME, 'readwrite');
    const store = txn.objectStore(STORE_NAME);

    for (const [id, game] of entries) {
      store.put({ id, ...game });
    }

    await new Promise((resolve, reject) => {
      txn.oncomplete = resolve;
      txn.onerror = () => reject(txn.error);
    });

    localStorage.removeItem('yacht-history');
    console.log(`Migrated ${entries.length} games from localStorage to IndexedDB`);
  } catch (e) {
    console.warn('Migration failed:', e);
  }
}
