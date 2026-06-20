// Apertura del editor visual de fórmulas EdiCuaTeX (https://edicuatex.github.io)
// e inserción del resultado, envuelto en delimitadores LaTeX, en un campo de
// texto (input o textarea).
//
// Lo usa el modo alumno (campos «Fórmula» y «Respuesta larga») para que el
// alumnado escriba fórmulas sin conocer la sintaxis de LaTeX. El editor tiene
// su propia copia de esta lógica acoplada al panel lateral; aquí va la versión
// genérica y reutilizable para el visor.

const EDICUATEX_URL = 'https://edicuatex.github.io/';
const EDICUATEX_ORIGIN = 'https://edicuatex.github.io';

let pendingTarget = null;     // input/textarea destino de la fórmula en edición
let pendingWindow = null;     // popup de EdiCuaTeX abierta
let pendingOnInsert = null;   // callback tras insertar (refrescar vista previa)
let pendingPreserve = false;  // conservar los delimitadores del texto seleccionado
let listenerReady = false;

export function wrapFormula(rawLatex = '') {
  const latex = String(rawLatex || '').trim();
  return latex ? `\\(${latex}\\)` : '';
}

function selectionHasLatexDelimiters(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  return /^\\\(([\s\S]+)\\\)$/.test(trimmed)
    || /^\\\[([\s\S]+)\\\]$/.test(trimmed)
    || /^\$\$([\s\S]+)\$\$$/.test(trimmed)
    || /^\$([\s\S]+)\$$/.test(trimmed);
}

function getSelectedText(field) {
  if (!field || typeof field.selectionStart !== 'number' || typeof field.selectionEnd !== 'number') return '';
  if (field.selectionStart === field.selectionEnd) return '';
  return String(field.value ?? '').slice(field.selectionStart, field.selectionEnd);
}

export function insertAtCursor(field, text) {
  const v = field.value ?? '';
  const start = typeof field.selectionStart === 'number' ? field.selectionStart : v.length;
  const end = typeof field.selectionEnd === 'number' ? field.selectionEnd : v.length;
  field.value = v.slice(0, start) + text + v.slice(end);
  const pos = start + text.length;
  try { field.focus(); field.setSelectionRange(pos, pos); } catch { /* algunos inputs no admiten setSelectionRange */ }
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function ensureListener() {
  if (listenerReady) return;
  listenerReady = true;
  window.addEventListener('message', e => {
    if (e.origin !== EDICUATEX_ORIGIN) return;
    const d = e.data;
    if (!d || d.type !== 'edicuatex:result') return;
    const tex = pendingPreserve && d.wrapped ? d.wrapped : wrapFormula(d.latex);
    const target = pendingTarget;
    if (tex && target && document.contains(target)) {
      insertAtCursor(target, tex);
      if (pendingOnInsert) { try { pendingOnInsert(); } catch { /* noop */ } }
    }
    try { pendingWindow?.close(); } catch { /* noop */ }
    pendingWindow = null;
    pendingPreserve = false;
    pendingOnInsert = null;
  });
}

// Abre EdiCuaTeX para el campo dado. Si hay texto seleccionado, lo precarga.
// Con `selectAllIfEmpty`, cuando no hay selección pero el campo tiene contenido
// se toma todo su valor (y se selecciona) para precargarlo y reemplazarlo al
// insertar: así el alumno puede editar la fórmula ya escrita sin seleccionarla.
// Devuelve false si el navegador bloqueó la ventana emergente.
export function openFormulaEditor(field, { onInsert, selectAllIfEmpty = false } = {}) {
  if (!field) return false;
  let selectedText = getSelectedText(field);
  if (!selectedText.trim() && selectAllIfEmpty && String(field.value ?? '').trim()) {
    try { field.focus(); field.setSelectionRange(0, field.value.length); } catch { /* algunos inputs no admiten setSelectionRange */ }
    selectedText = String(field.value);
  }
  pendingTarget = field;
  pendingOnInsert = onInsert || null;
  pendingPreserve = selectionHasLatexDelimiters(selectedText);
  ensureListener();
  const params = new URLSearchParams({ pm: '1', origin: location.origin });
  if (selectedText.trim()) params.set('sel', selectedText);
  const url = EDICUATEX_URL + '?' + params.toString();
  const win = window.open(url, 'edicuatex', 'width=1100,height=820');
  pendingWindow = win || null;
  return Boolean(win);
}
