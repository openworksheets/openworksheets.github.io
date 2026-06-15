// Corrección automática de cada tipo de campo.
//
// gradeField(field, answer) devuelve:
//   { earned, max, ok }   con ok ∈ { true, false, 'partial', 'blank' }
//
// Las respuestas siguen el formato que produce render.js:
//   text → string · number → string · single/select → índice | null
//   truefalse → boolean | null · multi → [índices] · gaps → [strings]
//   match → [índice de la derecha | null por pareja]
//   order → [índices originales en el orden elegido]
//   dragdrop → { zoneId: token | null }

import { normalizeText, parseDecimal } from './util.js';
import { parseGaps } from './fieldtypes.js';

export function gradeField(field, answer) {
  const max = Number(field.points) || 0;
  const res = graders[field.type]
    ? graders[field.type](field.config || {}, answer)
    : { ratio: 0, blank: true };
  const ratio = Math.max(0, Math.min(1, res.ratio));
  return {
    earned: Math.round(ratio * max * 100) / 100,
    max,
    ok: res.blank ? 'blank' : (ratio >= 1 ? true : (ratio > 0 ? 'partial' : false))
  };
}

const graders = {
  text(cfg, answer) {
    const given = String(answer ?? '');
    if (!given.trim()) return { ratio: 0, blank: true };
    const norm = s => normalizeText(s, cfg);
    const ok = (cfg.answers || []).some(a => a.trim() !== '' && norm(a) === norm(given));
    return { ratio: ok ? 1 : 0 };
  },

  number(cfg, answer) {
    const given = String(answer ?? '');
    if (!given.trim()) return { ratio: 0, blank: true };
    const v = parseDecimal(given);
    const target = parseDecimal(cfg.answer);
    if (isNaN(v) || isNaN(target)) return { ratio: 0 };
    const tol = Math.abs(parseDecimal(cfg.tolerance)) || 0;
    return { ratio: Math.abs(v - target) <= tol + 1e-9 ? 1 : 0 };
  },

  single(cfg, answer) {
    if (answer === null || answer === undefined) return { ratio: 0, blank: true };
    return { ratio: Number(answer) === Number(cfg.correct) ? 1 : 0 };
  },

  truefalse(cfg, answer) {
    if (answer === null || answer === undefined) return { ratio: 0, blank: true };
    return { ratio: Boolean(answer) === Boolean(cfg.correct) ? 1 : 0 };
  },

  multi(cfg, answer) {
    const marked = Array.isArray(answer) ? answer.map(Number) : [];
    if (!marked.length) return { ratio: 0, blank: true };
    const correct = (cfg.correct || []).map(Number);
    if (cfg.partial) {
      // Puntuación parcial: aciertos menos errores, sobre el total de correctas.
      const hits = marked.filter(i => correct.includes(i)).length;
      const misses = marked.length - hits;
      const ratio = correct.length ? Math.max(0, hits - misses) / correct.length : 0;
      return { ratio };
    }
    const exact = marked.length === correct.length && correct.every(i => marked.includes(i));
    return { ratio: exact ? 1 : 0 };
  },

  select(cfg, answer) {
    if (answer === null || answer === undefined) return { ratio: 0, blank: true };
    return { ratio: Number(answer) === Number(cfg.correct) ? 1 : 0 };
  },

  checkbox(cfg, answer) {
    const boxes = cfg.boxes || [];
    const marked = (Array.isArray(answer) ? answer : []).map(String)
      .filter(id => boxes.some(b => b.id === id));
    if (!marked.length) return { ratio: 0, blank: true };
    const correct = (cfg.correct || []).map(String).filter(id => boxes.some(b => b.id === id));
    if (cfg.multiple && cfg.partial) {
      // Puntuación parcial: aciertos menos errores, sobre el total de correctas.
      const hits = marked.filter(id => correct.includes(id)).length;
      const misses = marked.length - hits;
      const ratio = correct.length ? Math.max(0, hits - misses) / correct.length : 0;
      return { ratio };
    }
    const exact = marked.length === correct.length && correct.every(id => marked.includes(id));
    return { ratio: exact ? 1 : 0 };
  },

  gaps(cfg, answer) {
    const gaps = parseGaps(cfg.text || '').filter(s => s.kind === 'gap');
    const given = Array.isArray(answer) ? answer : [];
    if (!gaps.length) return { ratio: 0, blank: true };
    if (given.every(g => !String(g ?? '').trim())) return { ratio: 0, blank: true };
    const norm = s => normalizeText(s, cfg);
    let hits = 0;
    gaps.forEach((gap, i) => {
      const v = String(given[i] ?? '');
      if (v.trim() && gap.answers.some(a => norm(a) === norm(v))) hits++;
    });
    return { ratio: hits / gaps.length };
  },

  textboxes(cfg, answer) {
    // answer = { boxId: 'texto escrito' }. Cada hueco puntúa por igual (como gaps).
    const boxes = cfg.boxes || [];
    if (!boxes.length) return { ratio: 0, blank: true };
    const given = answer && typeof answer === 'object' ? answer : {};
    if (boxes.every(b => !String(given[b.id] ?? '').trim())) return { ratio: 0, blank: true };
    const norm = s => normalizeText(s, cfg);
    let hits = 0;
    boxes.forEach(b => {
      const v = String(given[b.id] ?? '');
      const answers = (b.answers || []).filter(a => a.trim() !== '');
      if (v.trim() && answers.some(a => norm(a) === norm(v))) hits++;
    });
    return { ratio: hits / boxes.length };
  },

  match(cfg, answer) {
    const pairs = cfg.pairs || [];
    const given = Array.isArray(answer) ? answer : [];
    if (!pairs.length) return { ratio: 0, blank: true };
    if (given.every(v => v === null || v === undefined)) return { ratio: 0, blank: true };
    let hits = 0;
    pairs.forEach((_, i) => {
      if (Number(given[i]) === i) hits++;
    });
    return { ratio: hits / pairs.length };
  },

  order(cfg, answer) {
    const items = cfg.items || [];
    const given = Array.isArray(answer) ? answer.map(Number) : [];
    if (!items.length || given.length !== items.length) return { ratio: 0, blank: true };
    let hits = 0;
    given.forEach((orig, pos) => { if (orig === pos) hits++; });
    return { ratio: hits / items.length };
  },

  arrowmatch(cfg, answer) {
    const pairs = cfg.pairs || [];
    const given = Array.isArray(answer) ? answer : [];
    if (!pairs.length) return { ratio: 0, blank: true };
    if (!given.length) return { ratio: 0, blank: true };
    let hits = 0;
    pairs.forEach(p => {
      if (given.some(c => c.from === p.from && c.to === p.to)) hits++;
    });
    return { ratio: hits / pairs.length };
  },

  dragdrop(cfg, answer) {
    const zones = cfg.zones || [];
    const given = answer && typeof answer === 'object' ? answer : {};
    if (!zones.length) return { ratio: 0, blank: true };
    const getPlaced = id => {
      const v = given[id];
      return Array.isArray(v) ? v.map(String) : (v ? [String(v)] : []);
    };
    if (zones.every(z => getPlaced(z.id).length === 0)) return { ratio: 0, blank: true };

    // Modo recorte: cada pieza es correcta solo en la zona asignada.
    if (cfg.mode === 'crops') {
      const pieces = cfg.pieces || [];
      const total = pieces.filter(p => p.zoneId).length;
      let hits = 0;
      zones.forEach(z => {
        getPlaced(z.id).forEach(pid => {
          const p = pieces.find(pc => pc.id === pid);
          if (p && p.zoneId === z.id) hits++;
        });
      });
      return { ratio: total ? hits / total : 0 };
    }

    const zoneCorrect = z => Array.isArray(z.answers) && z.answers.length
      ? z.answers.map(String) : z.answer ? [String(z.answer)] : [];
    let hits = 0, total = 0;
    zones.forEach(z => {
      const correct = zoneCorrect(z);
      total += correct.length;
      hits += getPlaced(z.id).filter(t => correct.includes(t)).length;
    });
    return { ratio: total ? hits / total : 0 };
  }
};

// Texto descriptivo de la respuesta correcta, para mostrar en la corrección.
export function expectedText(field) {
  const cfg = field.config || {};
  switch (field.type) {
    case 'text': return (cfg.answers || []).filter(a => a.trim()).join(' / ');
    case 'number': return String(cfg.answer ?? '') + (parseDecimal(cfg.tolerance) > 0 ? ` (±${cfg.tolerance})` : '');
    case 'single': return cfg.options?.[cfg.correct] ?? '';
    case 'truefalse': return cfg.correct ? (cfg.labels?.[0] || 'Verdadero') : (cfg.labels?.[1] || 'Falso');
    case 'multi': return (cfg.correct || []).map(i => cfg.options?.[i]).filter(Boolean).join(', ');
    case 'select': return cfg.options?.[cfg.correct] ?? '';
    case 'checkbox': {
      const boxes = cfg.boxes || [];
      const nums = (cfg.correct || [])
        .map(id => boxes.findIndex(b => b.id === id) + 1)
        .filter(n => n > 0)
        .sort((a, b) => a - b);
      return nums.length ? '☑ ' + nums.join(', ') : '';
    }
    case 'gaps': return parseGaps(cfg.text || '').filter(s => s.kind === 'gap').map(g => g.answers[0]).join(', ');
    case 'textboxes': return (cfg.boxes || []).map(b => (b.answers || []).find(a => a.trim()) || '').filter(Boolean).join(', ');
    case 'match': return (cfg.pairs || []).map(p => `${p.left} → ${p.right}`).join(' · ');
    case 'order': return (cfg.items || []).join(' → ');
    case 'arrowmatch': return (cfg.pairs || []).map(p => {
      const items = cfg.items || [];
      const from = items.find(i => i.id === p.from);
      const to   = items.find(i => i.id === p.to);
      return `${from?.label || '🖼'} → ${to?.label || '🖼'}`;
    }).join(', ');
    case 'dragdrop':
      if (cfg.mode === 'crops') {
        const n = (cfg.pieces || []).filter(p => p.zoneId).length;
        return n ? '🖼 ×' + n : '';
      }
      return (cfg.zones || []).map(z => {
        const ans = Array.isArray(z.answers) && z.answers.length ? z.answers : z.answer ? [z.answer] : [];
        return ans.join('+');
      }).join(', ');
    default: return '';
  }
}
