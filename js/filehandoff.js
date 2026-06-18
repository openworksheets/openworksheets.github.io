// Traspaso de un archivo entre páginas (portada → editor) mediante IndexedDB.
//
// El selector de archivos del navegador solo puede abrirse desde un gesto del
// usuario, y ese gesto no se conserva al navegar de una página a otra. Por eso
// la portada deja que el usuario elija la ficha (un gesto válido), la guarda
// aquí y redirige al editor, que la recoge al cargar. IndexedDB admite objetos
// File/Blob directamente y no tiene la cuota ajustada de localStorage.

const DB_NAME = 'owpkg-handoff';
const STORE = 'files';
const KEY = 'pending';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Guarda el archivo a la espera de que el editor lo recoja.
export async function stashFile(file) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(file, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Recoge el archivo guardado (y lo borra). Devuelve null si no hay ninguno.
export async function takeFile() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const getReq = store.get(KEY);
      getReq.onsuccess = () => { store.delete(KEY); resolve(getReq.result || null); };
      getReq.onerror = () => reject(getReq.error);
    });
  } finally {
    db.close();
  }
}
