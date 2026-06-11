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

  dragdrop(cfg, answer) {
    const zones = cfg.zones || [];
    const given = answer && typeof answer === 'object' ? answer : {};
    if (!zones.length) return { ratio: 0, blank: true };
    if (zones.every(z => !given[z.id])) return { ratio: 0, blank: true };
    let hits = 0;
    zones.forEach(z => {
      if (String(given[z.id] ?? '') === String(z.answer ?? '')) hits++;
    });
    return { ratio: hits / zones.length };
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
    case 'gaps': return parseGaps(cfg.text || '').filter(s => s.kind === 'gap').map(g => g.answers[0]).join(', ');
    case 'match': return (cfg.pairs || []).map(p => `${p.left} → ${p.right}`).join(' · ');
    case 'order': return (cfg.items || []).join(' → ');
    case 'dragdrop': return (cfg.zones || []).map(z => z.answer).join(', ');
    default: return '';
  }
}
