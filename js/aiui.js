// Dialog «Crear con IA»: formulario de 3 pasos que genera un prompt, lo deja
// copiar, y luego valida e importa el JSON que el profesor trae de su IA.
// No hace ninguna llamada externa: todo es copiar/pegar manual (ver aiimport.js).

import { el, copyToClipboard, toast } from './util.js';
import { t, getLang } from './i18n.js';
import { AI_TYPES, buildPrompt, parseImport } from './aiimport.js';

const LANG_NAMES = { es: 'español', ca: 'català', gl: 'galego', eu: 'euskara', en: 'English' };

// Abre el dialog. `onImport(data)` recibe el JSON validado. Debe ser async. Las
// páginas se crean en blanco; el fondo (color o imagen) se ajusta después desde
// la configuración de página.
export function openAiDialog({ onImport }) {
  const dlg = el('dialog', { class: 'ai-dialog' });

  // Estado del formulario, leído al generar el prompt y al importar.
  const state = { types: new Set(AI_TYPES) };

  // ---------- Cabecera ----------
  const closeX = el('button', { type: 'button', class: 'dlg-x', 'aria-label': t('ai.close'), onclick: () => dlg.close() }, '✕');
  const title = el('h2', { class: 'ai-title' }, t('ai.title'));

  // ---------- Paso 1: configuración ----------
  const fTopic = el('textarea', { class: 'ai-input', rows: '2', placeholder: t('ai.topicPh') });
  const fLevel = el('input', { class: 'ai-input', type: 'text', placeholder: t('ai.levelPh') });
  const fCount = el('input', { class: 'ai-input ai-num', type: 'number', min: '1', max: '40', value: '8' });

  const fLang = el('select', { class: 'ai-input' });
  Object.entries(LANG_NAMES).forEach(([code, name]) => fLang.appendChild(el('option', { value: name }, name)));
  fLang.value = LANG_NAMES[getLang()] || 'español';

  // Casillas de tipos permitidos (reutiliza las etiquetas de tipo ya traducidas).
  const typeBoxes = AI_TYPES.map(id => {
    const cb = el('input', { type: 'checkbox', checked: '' });
    cb.checked = true;
    cb.addEventListener('change', () => { cb.checked ? state.types.add(id) : state.types.delete(id); });
    return el('label', { class: 'ai-type' }, cb, el('span', {}, t('field.' + id)));
  });

  const btnGen = el('button', { class: 'btn primary', type: 'button' }, t('ai.genPrompt'));

  const step1 = el('div', { class: 'ai-step' },
    el('p', { class: 'ai-help' }, t('ai.step1Help')),
    field(t('ai.topic'), fTopic),
    el('div', { class: 'ai-grid2' }, field(t('ai.level'), fLevel), field(t('ai.count'), fCount)),
    field(t('ai.lang'), fLang),
    el('div', { class: 'ai-field' }, el('label', { class: 'ai-label' }, t('ai.types')),
      el('div', { class: 'ai-types' }, ...typeBoxes)),
    el('div', { class: 'ai-actions' }, btnGen));

  // ---------- Paso 2: prompt ----------
  const promptTa = el('textarea', { class: 'ai-input ai-prompt', rows: '12' });
  const btnCopy = el('button', { class: 'btn', type: 'button' }, t('ai.copy'));
  const btnBack2 = el('button', { class: 'btn ghost', type: 'button' }, t('ai.back'));
  const btnNext2 = el('button', { class: 'btn primary', type: 'button' }, t('ai.haveAnswer'));
  const step2 = el('div', { class: 'ai-step', hidden: '' },
    el('p', { class: 'ai-help' }, t('ai.step2Help')),
    promptTa,
    el('div', { class: 'ai-actions' }, btnBack2, btnCopy, btnNext2));

  // ---------- Paso 3: importar ----------
  const resultTa = el('textarea', { class: 'ai-input ai-result', rows: '10', placeholder: t('ai.resultPh') });
  const warnBox = el('div', { class: 'ai-warn', hidden: '' });
  const btnBack3 = el('button', { class: 'btn ghost', type: 'button' }, t('ai.back'));
  const btnImport = el('button', { class: 'btn primary', type: 'button' }, t('ai.import'));
  const step3 = el('div', { class: 'ai-step', hidden: '' },
    el('p', { class: 'ai-help' }, t('ai.step3Help')),
    resultTa, warnBox,
    el('div', { class: 'ai-actions' }, btnBack3, btnImport));

  dlg.append(closeX, title, step1, step2, step3);
  document.body.appendChild(dlg);

  const show = n => { [step1, step2, step3].forEach((s, i) => s.hidden = i !== n - 1); };

  // Paso 1 → 2: generar el prompt con las opciones elegidas.
  btnGen.addEventListener('click', () => {
    if (!state.types.size) { toast(t('ai.needType'), 'error'); return; }
    promptTa.value = buildPrompt({
      topic: fTopic.value.trim(),
      level: fLevel.value.trim(),
      lang: fLang.value,
      count: Math.max(1, Math.min(40, parseInt(fCount.value, 10) || 8)),
      types: AI_TYPES.filter(id => state.types.has(id))
    });
    show(2);
  });

  btnCopy.addEventListener('click', async () => {
    const ok = await copyToClipboard(promptTa.value);
    toast(ok ? t('ai.copied') : t('ai.copyFail'), ok ? 'ok' : 'error');
  });
  btnBack2.addEventListener('click', () => show(1));
  btnNext2.addEventListener('click', () => show(3));
  btnBack3.addEventListener('click', () => show(2));

  // Paso 3: validar e importar.
  btnImport.addEventListener('click', async () => {
    warnBox.hidden = true;
    const res = parseImport(resultTa.value);
    if (!res.ok) {
      warnBox.hidden = false;
      warnBox.className = 'ai-warn is-error';
      warnBox.textContent = res.errors.join(' ');
      return;
    }
    // Avisos no bloqueantes (items descartados): se informan pero se importa.
    if (res.errors.length) {
      warnBox.hidden = false;
      warnBox.className = 'ai-warn is-info';
      warnBox.textContent = t('ai.partial') + ' ' + res.errors.join(' ');
    }
    try {
      btnImport.disabled = true;
      // onImport devuelve false si el profesor cancela (p. ej. al confirmar el
      // descarte de la ficha actual): en ese caso el dialog se mantiene abierto.
      const ok = await onImport(res.data);
      if (ok !== false) dlg.close();
    } catch (e) {
      console.error(e);
      warnBox.hidden = false;
      warnBox.className = 'ai-warn is-error';
      warnBox.textContent = e.message || String(e);
    } finally {
      btnImport.disabled = false;
    }
  });

  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

// Envoltura etiqueta + control.
function field(label, control) {
  return el('div', { class: 'ai-field' }, el('label', { class: 'ai-label' }, label), control);
}
