// Caché persistente de fichas del alumnado en IndexedDB.
// Se usa para reabrir una ficha tras una recarga/cierre accidental sin tener
// que volver a descargarla, y también para poder recuperar una ficha local.

const DB_NAME = 'ow-alumno-cache';
const DB_VERSION = 2;
const STORE = 'worksheets';

// Límites de la caché para que no crezca sin control (importante en equipos de
// aula compartidos): se conservan como mucho MAX_ENTRIES fichas y se descartan
// las que llevan más de MAX_AGE_MS sin usarse.
const MAX_ENTRIES = 25;
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000; // 60 días

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.objectStoreNames.contains(STORE)
        ? req.transaction.objectStore(STORE)
        : db.createObjectStore(STORE, { keyPath: 'key' });
      if (!store.indexNames.contains('updatedAt')) {
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const request = action(store);
      if (request) {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } else {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }
    });
  } finally {
    db.close();
  }
}

function normalizeBlob(data) {
  if (data instanceof Blob) return data;
  if (data instanceof Uint8Array) return new Blob([data], { type: 'application/octet-stream' });
  return new Blob([data], { type: 'application/octet-stream' });
}

// Claves de la caché ordenadas de la más antigua a la más reciente, sin cargar
// los blobs en memoria (recorre solo el índice por fecha).
function listEntriesByAge() {
  return new Promise((resolve, reject) => {
    openDb().then(db => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      let index;
      try { index = store.index('updatedAt'); }
      catch { db.close(); resolve([]); return; }
      const entries = [];
      const req = index.openKeyCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) { entries.push({ pk: cursor.primaryKey, updatedAt: cursor.key }); cursor.continue(); }
      };
      tx.oncomplete = () => { db.close(); resolve(entries); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    }).catch(reject);
  });
}

// Descarta las fichas caducadas y las que excedan el cupo (las más antiguas
// primero). Es best-effort: cualquier fallo se ignora sin afectar al guardado.
async function pruneCache() {
  try {
    const entries = await listEntriesByAge();
    if (!entries.length) return;
    const now = Date.now();
    const total = entries.length;
    const toDelete = [];
    for (const e of entries) {
      const tooOld = now - (Number(e.updatedAt) || 0) > MAX_AGE_MS;
      const overCapacity = (total - toDelete.length) > MAX_ENTRIES;
      if (tooOld || overCapacity) toDelete.push(e.pk);
      else break; // el resto son más recientes y dentro de cupo
    }
    if (toDelete.length) {
      await withStore('readwrite', store => { toDelete.forEach(k => store.delete(k)); });
    }
  } catch { /* la limpieza es opcional */ }
}

export function buildWorksheetCacheKey({ manifestId = '', sourceUrl = '' } = {}) {
  if (sourceUrl) return 'url:' + sourceUrl;
  return 'local:' + manifestId;
}

export async function cacheWorksheet({ key, manifestId = '', sourceUrl = '', data, meta = null }) {
  if (!key || !data) return;
  const blob = normalizeBlob(data);
  // IndexedDB puede no estar disponible (modo privado, almacenamiento bloqueado
  // por política del centro…). En ese caso simplemente no se guarda la copia.
  try {
    await withStore('readwrite', store => store.put({
      key,
      manifestId,
      sourceUrl,
      blob,
      meta,
      updatedAt: Date.now()
    }));
    void pruneCache();
  } catch { /* caché no disponible: se sigue sin copia local */ }
}

// Registro completo de la caché (incluye blob y metadatos de versión).
// Si IndexedDB falla, devuelve null para degradar a la descarga normal en lugar
// de impedir que la ficha se abra.
export async function getCachedWorksheetRecord(key) {
  if (!key) return null;
  try {
    return (await withStore('readonly', store => store.get(key))) || null;
  } catch {
    return null;
  }
}

export async function getCachedWorksheet(key) {
  const row = await getCachedWorksheetRecord(key);
  return row?.blob || null;
}
