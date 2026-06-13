// Generación y verificación del archivo de entrega del alumno.
//
// La entrega es un JSON con los datos del alumno, sus respuestas, la
// puntuación y un código de verificación calculado con SHA-256 sobre el
// contenido. El código permite detectar ediciones manuales simples,
// pero no es una garantía criptográfica frente a un alumno con
// conocimientos técnicos (el formato es público).

import { shortCode, formatNum, fechaHora, slugify } from './util.js';
import { fieldTypeName } from './fieldtypes.js';
import { t } from './i18n.js';
import { encryptSubmission, isEncryptedSubmission } from './submissionCrypto.js';

const SALT = 'workpdf-entrega-v1';

function canonicalPayload(data) {
  return JSON.stringify({
    ficha: data.fichaId,
    titulo: data.titulo,
    alumno: data.alumno,
    grupo: data.grupo,
    fecha: data.fecha,
    nota: data.nota,
    total: data.total,
    respuestas: data.respuestas
  });
}

// resultados: [{ id, type, page, answer, earned, max, ok }]
export async function buildEntregaData({ manifest, alumno, grupo, resultados, earned, total }) {
  const data = {
    formato: 'workpdf-entrega',
    version: 1,
    fichaId: manifest.id,
    titulo: manifest.title,
    alumno,
    grupo,
    fecha: new Date().toISOString(),
    nota: earned,
    total,
    nota10: total > 0 ? Math.round((earned / total) * 1000) / 100 : 0,
    respuestas: resultados.map(r => ({
      id: r.id,
      tipo: r.type,
      pagina: r.page,
      respuesta: r.answer,
      puntos: r.earned,
      maximo: r.max,
      resultado: r.ok === true ? 'correcta' : r.ok === 'partial' ? 'parcial' : r.ok === 'blank' ? 'en blanco' : 'incorrecta'
    }))
  };
  data.codigo = await shortCode(SALT + canonicalPayload(data));
  return data;
}

export async function buildEntrega({ manifest, alumno, grupo, resultados, earned, total }) {
  const data = await buildEntregaData({ manifest, alumno, grupo, resultados, earned, total });
  return encryptSubmission(data, manifest.submissionCrypto);
}

export async function verifyEntrega(data) {
  if (isEncryptedSubmission(data)) {
    return { valid: false, encrypted: true, reason: t('verify.encrypted') };
  }
  if (!data || data.formato !== 'workpdf-entrega') {
    return { valid: false, reason: t('verify.notWorkpdf') };
  }
  const expected = await shortCode(SALT + canonicalPayload(data));
  if (expected !== data.codigo) {
    return { valid: false, reason: t('verify.tampered') };
  }
  return { valid: true };
}

export function entregaFilename(data) {
  const fecha = (data.fecha || '').slice(0, 10);
  if (isEncryptedSubmission(data)) {
    return fecha
      ? `entrega_cifrada_${fecha}.json`
      : 'entrega_cifrada.json';
  }
  return `entrega_${slugify(data.alumno)}_${slugify(data.titulo)}_${fecha}.json`;
}

// Resumen de texto para pegar en Classroom, correo, etc.
// Con includeScore false (la ficha oculta la nota al alumno) se omiten
// la puntuación y el recuento de aciertos; el docente la obtiene del
// archivo de entrega.
export function entregaResumen(data, { includeScore = true, detail = null } = {}) {
  const lines = [
    `${t('entrega.sheet')}: ${data.titulo}`,
    `${t('entrega.student')}: ${data.alumno}` + (data.grupo ? ` (${data.grupo})` : ''),
    `${t('entrega.date')}: ${fechaHora(new Date(data.fecha))}`,
    includeScore
      ? `${t('entrega.score')}: ${formatNum(data.nota)} / ${formatNum(data.total)}  (${formatNum(data.nota10)} ${t('entrega.over10')})`
      : null
  ].filter(l => l !== null);
  if (includeScore) {
    // mapa resultado (almacenado en español) → claves i18n
    const singKey = { correcta: 'entrega.correct', incorrecta: 'entrega.incorrect', parcial: 'entrega.partial', 'en blanco': 'entrega.blank' };
    const plurKey = { correcta: 'entrega.corrects', incorrecta: 'entrega.incorrects', parcial: 'entrega.partials', 'en blanco': 'entrega.blanks' };
    const porTipo = {};
    for (const r of data.respuestas || []) {
      porTipo[r.resultado] = (porTipo[r.resultado] || 0) + 1;
    }
    lines.push('', t('entrega.results') + ': ' + Object.entries(porTipo)
      .map(([k, v]) => `${v} ${t(v === 1 ? (singKey[k] || k) : (plurKey[k] || k))}`).join(', '));
  }
  if (detail && detail.length) {
    lines.push('', t('entrega.detail') + ':');
    detail.forEach((d, i) => {
      const icon = d.ok === true ? '✓' : d.ok === 'partial' ? '½' : '✗';
      const ans = Array.isArray(d.answer) ? d.answer.join(', ') : String(d.answer ?? '');
      let line = `  ${i + 1}. ${ans} ${icon}`;
      if (d.ok !== true && d.expected) line += `  →  ${t('entrega.solution')}: ${d.expected}`;
      lines.push(line);
    });
  }
  return lines.join('\n');
}

export { fieldTypeName };
