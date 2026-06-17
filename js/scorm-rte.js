// Adaptador de cliente SCORM 1.2 que corre DENTRO del paquete exportado.
//
// Cuando un LMS (Moodle, etc.) lanza el SCO, expone la API SCORM como
// `window.API` en alguna de las ventanas superiores (frame padre, abridor…).
// Este módulo la localiza y reporta la nota y el estado del alumno según el
// estándar SCORM 1.2:
//   cmi.core.score.raw  (0–100, con min=0 / max=100)
//   cmi.core.lesson_status  (passed | failed | completed)
//   cmi.core.session_time   (tiempo de la sesión)
//
// No tiene dependencias: se usa solo en el SCO (js/sco.js), no en el editor.

// Búsqueda de la API recorriendo ventanas padre y el abridor (algoritmo ADL).
function searchUp(win, depth) {
  let cur = win;
  for (let i = 0; i < depth && cur; i++) {
    if (cur.API) return cur.API;
    if (cur.parent === cur) break;
    cur = cur.parent;
  }
  return null;
}

function findAPI() {
  // 1) Cadena de padres desde esta ventana.
  let api = searchUp(window, 20);
  if (api) return api;
  // 2) Ventana que abrió esta (LMS que lanza en pop-up) y su cadena de padres.
  if (window.opener && typeof window.opener !== 'undefined') {
    try { api = searchUp(window.opener, 20); } catch { /* origen cruzado */ }
  }
  return api;
}

// Convierte segundos a la marca de tiempo CMITimespan de SCORM 1.2 (HHHH:MM:SS.SS).
function toCmiTimespan(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = (s % 60);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss.toFixed(2).padStart(5, '0'))}`;
}

export class ScormReporter {
  constructor() {
    this.api = findAPI();
    this.available = Boolean(this.api);
    this.initialized = false;
    this.startTime = Date.now();
  }

  // Nombre del alumno que conoce el LMS (para la cabecera de la ficha).
  studentName() {
    if (!this.api) return '';
    try {
      const raw = this.api.LMSGetValue('cmi.core.student_name') || '';
      // El LMS suele darlo como «Apellidos, Nombre»: lo normalizamos.
      const parts = raw.split(',');
      return parts.length === 2 ? (parts[1].trim() + ' ' + parts[0].trim()) : raw.trim();
    } catch { return ''; }
  }

  init() {
    if (!this.api) return false;
    try {
      const ok = this.api.LMSInitialize('') === 'true';
      this.initialized = ok;
      if (ok) {
        const status = this.api.LMSGetValue('cmi.core.lesson_status');
        // Marca el intento como «en curso» mientras el alumno responde.
        if (!status || status === 'not attempted' || status === '') {
          this.api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
        }
        this.api.LMSCommit('');
      }
      return ok;
    } catch { return false; }
  }

  // score: 0–100 ; passed: bool ; statusMode: 'score' | 'completion'
  // Devuelve true si la nota se envió al LMS, false si no hay LMS o falló.
  report({ score, passed, statusMode }) {
    if (!this.api || !this.initialized) return false;
    try {
      this.api.LMSSetValue('cmi.core.score.min', '0');
      this.api.LMSSetValue('cmi.core.score.max', '100');
      this.api.LMSSetValue('cmi.core.score.raw', String(Math.round(score)));
      const status = statusMode === 'completion' ? 'completed' : (passed ? 'passed' : 'failed');
      this.api.LMSSetValue('cmi.core.lesson_status', status);
      this.api.LMSSetValue('cmi.core.session_time',
        toCmiTimespan((Date.now() - this.startTime) / 1000));
      this.api.LMSCommit('');
      return true;
    } catch {
      return false; // el LMS rechazó la escritura
    }
  }

  finish() {
    if (!this.api || !this.initialized) return;
    try { this.api.LMSFinish(''); } catch { /* ignorar */ }
    this.initialized = false;
  }
}
