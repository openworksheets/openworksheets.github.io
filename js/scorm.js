// Soporte SCORM 1.2 para OpenWorksheets.
//
// Este módulo no toca el DOM: ofrece dos piezas reutilizables y testeables.
//
//   parseImsManifest(xmlString) → { version, defaultOrg, organizations,
//                                    entryHref, resources }
//       Analiza el imsmanifest.xml de un paquete SCORM: árbol de navegación
//       (organizations → items), recurso de entrada (entryHref) y la tabla de
//       recursos. Detecta la versión y avisa si es SCORM 2004 (no soportado).
//
//   class Scorm12Runtime
//       Implementa el RTE de SCORM 1.2 (window.API): LMSInitialize, LMSGetValue,
//       LMSSetValue, LMSCommit, LMSFinish y la gestión de errores. Mantiene el
//       modelo de datos cmi y notifica los cambios de nota/estado vía onCommit.

// ── Parser del manifest ──────────────────────────────────────────────────────

// Devuelve los hijos directos de `el` cuyo nombre local (sin prefijo de
// espacio de nombres) coincide con `name`. Trabajamos por localName para no
// depender del prefijo (imscp:, adlcp:, etc.) que cada empaquetador usa.
function childrenByLocal(el, name) {
  const out = [];
  for (const child of el.children) {
    if (localName(child) === name) out.push(child);
  }
  return out;
}

function localName(el) {
  return (el.localName || el.tagName || '').replace(/^.*:/, '');
}

function firstByLocal(root, name) {
  const all = root.getElementsByTagName('*');
  for (const el of all) {
    if (localName(el) === name) return el;
  }
  return null;
}

function detectVersion(doc) {
  const schemaVer = firstByLocal(doc, 'schemaversion');
  const txt = (schemaVer?.textContent || '').trim().toLowerCase();
  if (txt.includes('2004') || txt.includes('cam 1.3') || txt.includes('1.3')) return '2004';
  // El espacio de nombres de SCORM 2004 incluye imsss / adlseq.
  const root = doc.documentElement;
  if (root) {
    for (const attr of root.attributes) {
      const v = (attr.value || '').toLowerCase();
      if (v.includes('imsss') || v.includes('adlcp_v1p3') || v.includes('adlseq')) return '2004';
    }
  }
  if (txt.includes('1.2')) return '1.2';
  // Por defecto asumimos 1.2 (el caso histórico más común en educación).
  return '1.2';
}

// Construye recursivamente el árbol de items de una organización.
function parseItems(orgEl, resourcesById) {
  return childrenByLocal(orgEl, 'item').map(item => {
    const ref = item.getAttribute('identifierref') || '';
    const res = ref ? resourcesById[ref] : null;
    const titleEl = childrenByLocal(item, 'title')[0];
    return {
      id: item.getAttribute('identifier') || '',
      title: (titleEl?.textContent || '').trim(),
      href: res?.href || '',
      children: parseItems(item, resourcesById)
    };
  });
}

// Primer item con href recorriendo el árbol en profundidad (orden de lanzamiento).
function firstHref(items) {
  for (const it of items) {
    if (it.href) return it.href;
    const child = firstHref(it.children);
    if (child) return child;
  }
  return '';
}

export function parseImsManifest(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('imsmanifest.xml no es un XML válido');
  }

  const version = detectVersion(doc);

  // Tabla de recursos: id → { href, scormType, files }
  const resources = {};
  const resourcesEl = firstByLocal(doc, 'resources');
  if (resourcesEl) {
    for (const res of childrenByLocal(resourcesEl, 'resource')) {
      const id = res.getAttribute('identifier') || '';
      if (!id) continue;
      resources[id] = {
        href: res.getAttribute('href') || '',
        // scormType viene con prefijo adlcp: → lo leemos por sufijo.
        scormType: res.getAttribute('adlcp:scormtype') || res.getAttribute('scormType')
          || res.getAttribute('scormtype') || '',
        files: childrenByLocal(res, 'file').map(f => f.getAttribute('href') || '').filter(Boolean)
      };
    }
  }

  // Organizaciones (árbol de navegación).
  const organizations = [];
  const orgsEl = firstByLocal(doc, 'organizations');
  const defaultOrg = orgsEl?.getAttribute('default') || '';
  if (orgsEl) {
    for (const org of childrenByLocal(orgsEl, 'organization')) {
      const titleEl = childrenByLocal(org, 'title')[0];
      organizations.push({
        id: org.getAttribute('identifier') || '',
        title: (titleEl?.textContent || '').trim(),
        items: parseItems(org, resources)
      });
    }
  }

  // Recurso de entrada: primer item con href de la organización por defecto.
  const mainOrg = organizations.find(o => o.id === defaultOrg) || organizations[0];
  let entryHref = mainOrg ? firstHref(mainOrg.items) : '';
  // Si no hay items con href, caer al primer recurso de tipo SCO/asset.
  if (!entryHref) {
    const firstRes = Object.values(resources).find(r => r.href);
    entryHref = firstRes?.href || '';
  }

  return { version, defaultOrg: mainOrg?.id || '', organizations, entryHref, resources };
}

// ── Runtime SCORM 1.2 (window.API) ───────────────────────────────────────────

// Modelo de datos cmi por defecto (subconjunto relevante de SCORM 1.2).
function defaultCmi() {
  return {
    'cmi.core.student_id': '',
    'cmi.core.student_name': '',
    'cmi.core.lesson_location': '',
    'cmi.core.credit': 'credit',
    'cmi.core.lesson_status': 'not attempted',
    'cmi.core.entry': 'ab-initio',
    'cmi.core.score.raw': '',
    'cmi.core.score.min': '',
    'cmi.core.score.max': '',
    'cmi.core.total_time': '0000:00:00',
    'cmi.core.lesson_mode': 'normal',
    'cmi.core.exit': '',
    'cmi.core.session_time': '00:00:00',
    'cmi.suspend_data': '',
    'cmi.launch_data': '',
    'cmi.comments': '',
    'cmi.student_data.mastery_score': '',
    'cmi.student_data.max_time_allowed': '',
    'cmi.student_data.time_limit_action': ''
  };
}

// Errores SCORM 1.2 (los más habituales).
const ERROR_STRINGS = {
  '0': 'No error',
  '101': 'General exception',
  '201': 'Invalid argument error',
  '202': 'Element cannot have children',
  '203': 'Element not an array - cannot have count',
  '301': 'Not initialized',
  '401': 'Not implemented error',
  '402': 'Invalid set value, element is a keyword',
  '403': 'Element is read only',
  '404': 'Element is write only',
  '405': 'Incorrect data type'
};

// Elementos de solo lectura: si el SCO intenta escribirlos, devolvemos error 403.
const READ_ONLY = new Set([
  'cmi.core.student_id', 'cmi.core.student_name', 'cmi.core.credit',
  'cmi.core.entry', 'cmi.core.total_time', 'cmi.core.lesson_mode',
  'cmi.launch_data', 'cmi.comments', 'cmi.student_data.mastery_score',
  'cmi.student_data.max_time_allowed', 'cmi.student_data.time_limit_action'
]);

export class Scorm12Runtime {
  constructor(opts = {}) {
    this.data = defaultCmi();
    if (opts.studentName) this.data['cmi.core.student_name'] = opts.studentName;
    if (opts.studentId) this.data['cmi.core.student_id'] = opts.studentId;
    // Estado restaurado de una sesión previa (suspend_data, location, etc.).
    if (opts.initial) Object.assign(this.data, opts.initial);
    this.initialized = false;
    this.finished = false;
    this.lastError = '0';
    this._listeners = [];
  }

  // Registra un callback que se invoca tras LMSCommit/LMSFinish y cuando
  // cambian la nota o el estado. Devuelve la función para desuscribir.
  onCommit(cb) {
    this._listeners.push(cb);
    return () => { this._listeners = this._listeners.filter(f => f !== cb); };
  }

  _emit() {
    const snap = this.snapshot();
    this._listeners.forEach(cb => { try { cb(snap); } catch { /* aislado */ } });
  }

  // Devuelve los datos relevantes para puntuar y persistir.
  snapshot() {
    return {
      raw: this.data['cmi.core.score.raw'],
      min: this.data['cmi.core.score.min'],
      max: this.data['cmi.core.score.max'],
      status: this.data['cmi.core.lesson_status'],
      location: this.data['cmi.core.lesson_location'],
      suspend_data: this.data['cmi.suspend_data']
    };
  }

  // ---- API SCORM 1.2 ----

  LMSInitialize(_param) {
    if (this.initialized) { this.lastError = '101'; return 'false'; }
    this.initialized = true;
    this.finished = false;
    this.lastError = '0';
    return 'true';
  }

  LMSFinish(_param) {
    if (!this.initialized) { this.lastError = '301'; return 'false'; }
    this.initialized = false;
    this.finished = true;
    this.lastError = '0';
    this._emit();
    return 'true';
  }

  LMSGetValue(element) {
    if (!this.initialized && !this.finished) { this.lastError = '301'; return ''; }
    this.lastError = '0';
    // Soporte mínimo de _children / _count para evitar excepciones de algunos SCO.
    if (/_children$/.test(element) || /_count$/.test(element)) {
      return '';
    }
    if (element in this.data) return String(this.data[element] ?? '');
    this.lastError = '201';
    return '';
  }

  LMSSetValue(element, value) {
    if (!this.initialized) { this.lastError = '301'; return 'false'; }
    if (READ_ONLY.has(element)) { this.lastError = '403'; return 'false'; }
    this.data[element] = String(value ?? '');
    this.lastError = '0';
    // Cambios de nota o estado: avisamos en vivo para actualizar el progreso.
    if (element === 'cmi.core.score.raw' || element === 'cmi.core.lesson_status') {
      this._emit();
    }
    return 'true';
  }

  LMSCommit(_param) {
    if (!this.initialized) { this.lastError = '301'; return 'false'; }
    this.lastError = '0';
    this._emit();
    return 'true';
  }

  LMSGetLastError() { return this.lastError; }

  LMSGetErrorString(code) { return ERROR_STRINGS[String(code)] || ''; }

  LMSGetDiagnostic(code) { return ERROR_STRINGS[String(code)] || ''; }
}

// Convierte el snapshot del runtime (o una respuesta guardada) en un ratio 0..1
// según el modo de puntuación configurado. Compartido por el grader y la UI.
export function scormRatio(snap, scoreMode) {
  if (!snap) return { ratio: 0, blank: true };
  const status = snap.status || 'not attempted';
  const attempted = status !== 'not attempted';
  const passedLike = status === 'passed' || status === 'completed';

  if (scoreMode === 'completion') {
    if (!attempted) return { ratio: 0, blank: true };
    return { ratio: passedLike ? 1 : 0 };
  }

  const raw = parseFloat(snap.raw);
  if (isNaN(raw)) {
    // Sin nota numérica: caemos al estado de finalización.
    if (!attempted) return { ratio: 0, blank: true };
    return { ratio: passedLike ? 1 : 0 };
  }
  const min = parseFloat(snap.min);
  const max = parseFloat(snap.max);
  const lo = isNaN(min) ? 0 : min;
  const hi = isNaN(max) ? 100 : max;
  const span = hi - lo;
  if (span <= 0) return { ratio: raw > 0 ? 1 : 0 };
  return { ratio: Math.max(0, Math.min(1, (raw - lo) / span)) };
}
