// Utilidades comunes de WorkPDF.

export function uid(prefix = 'f') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Generador pseudoaleatorio con semilla (mulberry32), para que el barajado
// sea estable entre recargas de una misma sesión de alumno.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(arr, rng = Math.random) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Baraja índices [0..n) evitando devolver el orden original cuando n > 1.
export function shuffledIndices(n, rng = Math.random) {
  const base = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return base;
  for (let intento = 0; intento < 10; intento++) {
    const mezcla = shuffled(base, rng);
    if (mezcla.some((v, i) => v !== i)) return mezcla;
  }
  return base.reverse();
}

export function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Normaliza una respuesta de texto según las opciones del campo.
export function normalizeText(s, opts = {}) {
  let out = String(s ?? '');
  if (opts.collapseSpaces !== false) out = out.trim().replace(/\s+/g, ' ');
  if (opts.ignoreCase !== false) out = out.toLowerCase();
  if (opts.ignoreAccents !== false) out = stripAccents(out);
  return out;
}

// Acepta coma o punto decimal. Devuelve NaN si no es un número.
export function parseDecimal(s) {
  const t = String(s ?? '').trim().replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return NaN;
  return parseFloat(t);
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function formatNum(n, dec = 2) {
  const v = Math.round(n * 10 ** dec) / 10 ** dec;
  return String(v).replace('.', ',');
}

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Código corto de verificación legible: XXXX-XXXX-XX
export async function shortCode(text) {
  const hex = await sha256Hex(text);
  const raw = hex.slice(0, 10).toUpperCase();
  return raw.slice(0, 4) + '-' + raw.slice(4, 8) + '-' + raw.slice(8, 10);
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function readFileAsArrayBuffer(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(file);
  });
}

export function loadImageSize(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

export async function compressToBase64url(data) {
  const json = JSON.stringify(data);
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(json));
  writer.close();
  const compressed = await new Response(cs.readable).arrayBuffer();
  const bytes = new Uint8Array(compressed);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function decompressFromBase64url(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return JSON.parse(await new Response(ds.readable).text());
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* sin permiso */ }
    ta.remove();
    return ok;
  }
}

let toastTimer = null;
export function toast(msg, kind = 'info') {
  let el = document.querySelector('.wpf-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'wpf-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.dataset.kind = kind;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

// Control de zoom (− 100% +). `apply(z)` recibe la escala; el porcentaje
// se guarda en localStorage bajo `key`. Pulsar el porcentaje vuelve al 100%.
export function zoomControl({ apply, key, titles = {}, min = 0.5, max = 3 }) {
  let z = 1;
  const saved = parseFloat(localStorage.getItem(key));
  if (saved >= min && saved <= max) z = saved;
  const out = el('button', { type: 'button', title: titles.out || '' }, '−');
  const pct = el('button', { class: 'zoom-pct', type: 'button', title: titles.reset || '' });
  const inn = el('button', { type: 'button', title: titles.in || '' }, '+');
  function set(v) {
    z = Math.round(clamp(v, min, max) * 100) / 100;
    localStorage.setItem(key, String(z));
    pct.textContent = Math.round(z * 100) + '%';
    apply(z);
  }
  out.addEventListener('click', () => set(z / 1.2));
  inn.addEventListener('click', () => set(z * 1.2));
  pct.addEventListener('click', () => set(1));
  set(z);
  return { el: el('div', { class: 'zoom-ctrl' }, out, pct, inn), set, get: () => z };
}

export function fechaHora(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

export function slugify(s) {
  return normalizeText(s, {}).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ficha';
}
