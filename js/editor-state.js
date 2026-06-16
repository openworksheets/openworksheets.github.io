// Estado mutable compartido del editor.
//
// Se exporta como un único objeto `state` para que otros módulos puedan leer
// y MUTAR el mismo estado: los imports de ES modules son bindings de solo
// lectura, así que no se puede reasignar un `let` externo desde otro archivo.
// Mutando propiedades de un objeto compartido sí se ve el cambio en todos.

import { newManifest } from './zipio.js';

export const state = {
  manifest: newManifest(),
  files: new Map(),               // ruta → Blob
  pageSeq: 1,                      // numeración de archivos de página
  activeTool: null,               // tipo de campo a dibujar, o 'zone'
  pendingAmItem: null,            // item de arrowmatch esperando que se dibuje su rect
  pendingAmNext: null,            // item que se dibujará automáticamente tras pendingAmItem
  sel: null,                      // {kind:'field'|'zone'|'amitem', pageIndex, fieldId, zoneId?, amItemId?}
  dirty: false,
  preview: null,
  submissionCryptoPassword: '',
  copiedField: null,              // campo copiado para pegar en otra página
  openGroup: null,                // grupo de la paleta abierto (acordeón); null = todos colapsados
};

// Cache de object URLs (ruta → URL). Compartida para poder revocarlas/limpiarlas
// al borrar páginas/campos o al empezar una ficha nueva.
export const urls = new Map();
export function fileUrl(path) {
  if (!urls.has(path)) urls.set(path, URL.createObjectURL(state.files.get(path)));
  return urls.get(path);
}

// Hook opcional para el historial de deshacer/rehacer: se invoca tras cada
// cambio para programar una instantánea del estado.
let dirtyHook = null;
export function onDirty(fn) { dirtyHook = fn; }
export function markDirty() { state.dirty = true; if (dirtyHook) dirtyHook(); }
