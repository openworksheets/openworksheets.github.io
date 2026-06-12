// Editor de fichas (modo profesor).

import { el, uid, clamp, toast, downloadBlob, slugify, copyToClipboard } from './util.js';
import { FIELD_TYPES, FIELD_ORDER, fieldTypeName, gapCount } from './fieldtypes.js';
import { expectedText } from './grading.js';
import { pdfToPages, imageToPage, isPdf, isImage } from './pdfimport.js';
import { exportFichaZip, importFichaZip, newManifest } from './zipio.js';
import { buildShortLink, parseDriveId } from './drive.js';
import { mountPlayer } from './player.js';
import { t, getLang, applyI18n, initLangSelector } from './i18n.js';

applyI18n();
initLangSelector();

// ---------- Estado ----------

let manifest = newManifest();
let files = new Map();          // ruta → Blob
let pageSeq = 1;                // numeración de archivos de página
let activeTool = null;          // tipo de campo a dibujar, o 'zone'
let sel = null;                 // {kind:'field'|'zone', pageIndex, fieldId, zoneId?}
let dirty = false;
let preview = null;

const urls = new Map();
function fileUrl(path) {
  if (!urls.has(path)) urls.set(path, URL.createObjectURL(files.get(path)));
  return urls.get(path);
}

const $ = s => document.querySelector(s);
const canvas = $('#canvas');
const panel = $('#panel');
const palette = $('#palette');
const titleInput = $('#titulo');

function markDirty() { dirty = true; }

window.addEventListener('beforeunload', e => {
  if (dirty) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- Paleta ----------

function renderPalette() {
  palette.textContent = '';
  FIELD_ORDER.forEach(type => {
    const t = FIELD_TYPES[type];
    const btn = el('button', { class: 'ed-tool', type: 'button', title: t.name },
      el('span', { class: 'glyph' }, t.glyph),
      el('span', { class: 'name' }, t.name));
    btn.addEventListener('click', () => {
      activeTool = activeTool === type ? null : type;
      refreshPaletteState();
      if (activeTool && !manifest.pages.length) {
        toast(t('toast.addPdfFirst'), 'error');
        activeTool = null;
        refreshPaletteState();
      }
    });
    btn.dataset.type = type;
    palette.appendChild(btn);
  });
  refreshPaletteState();
}

function refreshPaletteState() {
  palette.querySelectorAll('.ed-tool').forEach(b => {
    b.classList.toggle('active', b.dataset.type === activeTool);
  });
  canvas.classList.toggle('drawing', Boolean(activeTool));
}

// ---------- Páginas ----------

async function addFiles(fileList) {
  const list = Array.from(fileList || []);
  if (!list.length) return;
  for (const file of list) {
    try {
      if (isPdf(file)) {
        toast(t('toast.convertingPdf'));
        const pages = await pdfToPages(file, (n, total) => {
          toast(t('toast.convertingPage', { n, total }));
        });
        pages.forEach(p => addPage(p));
        toast(t('toast.pdfAdded', { n: pages.length, s: pages.length === 1 ? '' : 's' }), 'ok');
      } else if (isImage(file)) {
        addPage(await imageToPage(file));
        toast(t('toast.imageAdded'), 'ok');
      } else {
        toast(t('toast.notMedia', { name: file.name }), 'error');
      }
    } catch (e) {
      console.error(e);
      toast(t('toast.errorFile', { name: file.name, msg: e.message }), 'error');
    }
  }
  markDirty();
  renderCanvas();
  renderPanel();
}

function addPage({ blob, ext, w, h }) {
  const path = `pages/page-${pageSeq++}.${ext}`;
  files.set(path, blob);
  manifest.pages.push({ image: path, w, h, fields: [] });
}

function deletePage(pi) {
  const page = manifest.pages[pi];
  const n = page.fields.length;
  const fields = n ? t('editor.confirmDeleteFields', { n }) : '';
  if (!window.confirm(t('editor.confirmDelete', { n: pi + 1, fields }))) return;
  files.delete(page.image);
  if (urls.has(page.image)) { URL.revokeObjectURL(urls.get(page.image)); urls.delete(page.image); }
  manifest.pages.splice(pi, 1);
  sel = null;
  markDirty();
  renderCanvas();
  renderPanel();
}

function movePage(pi, delta) {
  const j = pi + delta;
  if (j < 0 || j >= manifest.pages.length) return;
  const [pg] = manifest.pages.splice(pi, 1);
  manifest.pages.splice(j, 0, pg);
  sel = null;
  markDirty();
  renderCanvas();
  renderPanel();
}

// ---------- Lienzo ----------

function renderCanvas() {
  canvas.textContent = '';
  if (!manifest.pages.length) {
    canvas.appendChild(el('div', { class: 'ed-empty card anim-in' },
      el('h2', {}, t('editor.emptyTitle')),
      el('p', {}, t('editor.emptyDesc')),
      el('div', { style: 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap' },
        el('button', { class: 'btn primary', onclick: () => $('#inputPaginas').click() }, t('editor.addPdf')),
        el('button', { class: 'btn', onclick: () => $('#inputZip').click() }, t('editor.openZip')))));
    return;
  }

  manifest.pages.forEach((page, pi) => {
    const pageEl = el('div', { class: 'wpf-page', dataset: { page: pi } },
      el('img', { class: 'fondo', src: fileUrl(page.image), alt: t('editor.pageN', { n: pi + 1, total: manifest.pages.length }), draggable: 'false' }));

    page.fields.forEach(field => {
      const box = el('div', { class: 'ed-field', dataset: { id: field.id } },
        el('span', { class: 'chip' }, `${fieldTypeName(field.type)} · ${field.points} pt`),
        el('span', { class: 'handle' }));
      setRectStyle(box, field.rect);
      box.style.setProperty('--fs', field.fontScale || 1);
      attachBoxInteraction(box, pageEl, field.rect, {
        onSelect: () => selectField(pi, field.id),
        isSelected: () => sel?.kind === 'field' && sel.fieldId === field.id
      });
      pageEl.appendChild(box);

      if (field.type === 'dragdrop') {
        (field.config.zones || []).forEach(zone => {
          const zEl = el('div', { class: 'ed-zone', dataset: { id: zone.id } },
            el('span', { class: 'chip' }, zone.answer || 'zona'),
            el('span', { class: 'handle' }));
          setRectStyle(zEl, zone.rect);
          attachBoxInteraction(zEl, pageEl, zone.rect, {
            onSelect: () => selectZone(pi, field.id, zone.id),
            isSelected: () => sel?.kind === 'zone' && sel.zoneId === zone.id
          });
          pageEl.appendChild(zEl);
        });
      }
    });

    attachDrawInteraction(pageEl, pi);

    const head = el('div', { class: 'ed-pagehead' },
      el('span', {}, t('editor.pageN', { n: pi + 1, total: manifest.pages.length })),
      el('span', { class: 'spacer' }),
      el('button', { class: 'btn small ghost', title: t('editor.moveUp'), onclick: () => movePage(pi, -1) }, '▲'),
      el('button', { class: 'btn small ghost', title: t('editor.moveDown'), onclick: () => movePage(pi, 1) }, '▼'),
      el('button', { class: 'btn small ghost danger', title: t('editor.deletePage'), onclick: () => deletePage(pi) }, '✕'));

    canvas.appendChild(el('div', { class: 'ed-pagebox' }, head, pageEl));
  });
  refreshSelectionStyles();
}

function setRectStyle(node, rect) {
  node.style.left = rect.x * 100 + '%';
  node.style.top = rect.y * 100 + '%';
  node.style.width = rect.w * 100 + '%';
  node.style.height = rect.h * 100 + '%';
}

function refreshSelectionStyles() {
  canvas.querySelectorAll('.ed-field, .ed-zone').forEach(n => n.classList.remove('selected'));
  if (!sel) return;
  const id = sel.kind === 'zone' ? sel.zoneId : sel.fieldId;
  const node = canvas.querySelector(`[data-id="${id}"]`);
  if (node) node.classList.add('selected');
}

// Mover y redimensionar un rectángulo (campo o zona).
function attachBoxInteraction(box, pageEl, rect, { onSelect, isSelected }) {
  box.addEventListener('pointerdown', e => {
    if (activeTool) return; // en modo dibujo, la página gestiona el evento
    e.stopPropagation();
    e.preventDefault();
    onSelect();

    const resizing = e.target.classList.contains('handle');
    const pr = pageEl.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const orig = { ...rect };
    let moved = false;

    function onMove(ev) {
      const dx = (ev.clientX - startX) / pr.width;
      const dy = (ev.clientY - startY) / pr.height;
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 3) moved = true;
      if (!moved) return;
      if (resizing) {
        rect.w = clamp(orig.w + dx, 0.02, 1 - rect.x);
        rect.h = clamp(orig.h + dy, 0.015, 1 - rect.y);
      } else {
        rect.x = clamp(orig.x + dx, 0, 1 - rect.w);
        rect.y = clamp(orig.y + dy, 0, 1 - rect.h);
      }
      setRectStyle(box, rect);
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved) markDirty();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

// Dibujar un campo nuevo (o una zona) sobre la página.
function attachDrawInteraction(pageEl, pi) {
  pageEl.addEventListener('pointerdown', e => {
    if (!activeTool) {
      // Clic en el fondo (la imagen no recibe eventos): deseleccionar.
      if (e.target === pageEl) {
        sel = null;
        refreshSelectionStyles();
        renderPanel();
      }
      return;
    }
    e.preventDefault();
    const pr = pageEl.getBoundingClientRect();
    const x0 = clamp((e.clientX - pr.left) / pr.width, 0, 1);
    const y0 = clamp((e.clientY - pr.top) / pr.height, 0, 1);
    const rubber = el('div', { class: 'ed-rubber' });
    pageEl.appendChild(rubber);
    let x1 = x0, y1 = y0;

    function paint() {
      const r = normRect(x0, y0, x1, y1);
      setRectStyle(rubber, r);
    }
    function onMove(ev) {
      x1 = clamp((ev.clientX - pr.left) / pr.width, 0, 1);
      y1 = clamp((ev.clientY - pr.top) / pr.height, 0, 1);
      paint();
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      rubber.remove();
      let r = normRect(x0, y0, x1, y1);
      const tool = activeTool;
      activeTool = null;
      refreshPaletteState();
      if (tool === 'zone') {
        if (r.w < 0.02 || r.h < 0.015) r = { x: clamp(x0 - 0.06, 0, 0.88), y: clamp(y0 - 0.025, 0, 0.95), w: 0.12, h: 0.05 };
        createZone(pi, r);
      } else {
        const def = FIELD_TYPES[tool].defRect;
        if (r.w < 0.02 || r.h < 0.015) {
          r = {
            x: clamp(x0 - def.w / 2, 0, 1 - def.w),
            y: clamp(y0 - def.h / 2, 0, 1 - def.h),
            w: def.w, h: def.h
          };
        }
        createField(pi, tool, r);
      }
    }
    paint();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

function normRect(x0, y0, x1, y1) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0)
  };
}

// ---------- Campos ----------

function createField(pi, type, rect) {
  const field = {
    id: uid('f'),
    type,
    rect,
    points: 1,
    fontScale: 1,
    config: FIELD_TYPES[type].defaults()
  };
  manifest.pages[pi].fields.push(field);
  markDirty();
  renderCanvas();
  selectField(pi, field.id);
}

function createZone(pi, rect) {
  const field = sel ? getField(sel.pageIndex, sel.fieldId) : null;
  if (!field || field.type !== 'dragdrop' || sel.pageIndex !== pi) {
    toast(t('toast.selectDragFirst'), 'error');
    renderCanvas();
    return;
  }
  const zone = { id: uid('z'), rect, answer: 'Etiqueta ' + (field.config.zones.length + 1) };
  field.config.zones.push(zone);
  markDirty();
  renderCanvas();
  selectZone(pi, field.id, zone.id);
}

function getField(pi, fieldId) {
  return manifest.pages[pi]?.fields.find(f => f.id === fieldId) || null;
}

function selectField(pi, fieldId) {
  sel = { kind: 'field', pageIndex: pi, fieldId };
  refreshSelectionStyles();
  renderPanel();
}

function selectZone(pi, fieldId, zoneId) {
  sel = { kind: 'zone', pageIndex: pi, fieldId, zoneId };
  refreshSelectionStyles();
  renderPanel();
}

function deleteSelected() {
  if (!sel) return;
  const field = getField(sel.pageIndex, sel.fieldId);
  if (!field) return;
  if (sel.kind === 'zone') {
    field.config.zones = field.config.zones.filter(z => z.id !== sel.zoneId);
    sel = { kind: 'field', pageIndex: sel.pageIndex, fieldId: field.id };
  } else {
    const page = manifest.pages[sel.pageIndex];
    page.fields = page.fields.filter(f => f.id !== field.id);
    sel = null;
  }
  markDirty();
  renderCanvas();
  renderPanel();
}

function duplicateSelected() {
  if (!sel || sel.kind !== 'field') return;
  const field = getField(sel.pageIndex, sel.fieldId);
  if (!field) return;
  const copy = JSON.parse(JSON.stringify(field));
  copy.id = uid('f');
  copy.rect = {
    ...copy.rect,
    x: clamp(copy.rect.x + 0.03, 0, 1 - copy.rect.w),
    y: clamp(copy.rect.y + 0.03, 0, 1 - copy.rect.h)
  };
  if (copy.type === 'dragdrop') {
    copy.config.zones = copy.config.zones.map(z => ({
      ...z,
      id: uid('z'),
      rect: { ...z.rect, x: clamp(z.rect.x + 0.03, 0, 1 - z.rect.w), y: clamp(z.rect.y + 0.03, 0, 1 - z.rect.h) }
    }));
  }
  manifest.pages[sel.pageIndex].fields.push(copy);
  markDirty();
  renderCanvas();
  selectField(sel.pageIndex, copy.id);
}

document.addEventListener('keydown', e => {
  const inForm = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if (inForm) return;
  if (!sel) return;
  const field = getField(sel.pageIndex, sel.fieldId);
  if (!field) return;
  const rect = sel.kind === 'zone'
    ? field.config.zones.find(z => z.id === sel.zoneId)?.rect
    : field.rect;
  if (!rect) return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteSelected();
  } else if (e.key.startsWith('Arrow')) {
    e.preventDefault();
    const step = e.shiftKey ? 0.02 : 0.004;
    if (e.key === 'ArrowLeft') rect.x = clamp(rect.x - step, 0, 1 - rect.w);
    if (e.key === 'ArrowRight') rect.x = clamp(rect.x + step, 0, 1 - rect.w);
    if (e.key === 'ArrowUp') rect.y = clamp(rect.y - step, 0, 1 - rect.h);
    if (e.key === 'ArrowDown') rect.y = clamp(rect.y + step, 0, 1 - rect.h);
    markDirty();
    const id = sel.kind === 'zone' ? sel.zoneId : sel.fieldId;
    const node = canvas.querySelector(`[data-id="${id}"]`);
    if (node) setRectStyle(node, rect);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    duplicateSelected();
  }
});

// ---------- Panel lateral ----------

function renderPanel() {
  panel.textContent = '';
  if (sel) {
    const field = getField(sel.pageIndex, sel.fieldId);
    if (field) {
      if (sel.kind === 'zone') renderZonePanel(field);
      else renderFieldPanel(field);
    } else {
      sel = null;
    }
  }
  if (!sel) {
    panel.appendChild(el('div', { class: 'ed-panel-vacio' },
      el('h3', {}, t('editor.noField')),
      el('p', {}, manifest.pages.length
        ? t('editor.noFieldDesc')
        : t('editor.noFieldDescNoPages'))));
  }
  renderFieldList();
}

function refreshChip(field) {
  const node = canvas.querySelector(`.ed-field[data-id="${field.id}"] .chip`);
  if (node) node.textContent = `${fieldTypeName(field.type)} · ${field.points} pt`;
}

function renderFieldPanel(field) {
  const cont = el('div', {});
  cont.appendChild(el('h3', {},
    el('span', { class: 'tipo-chip' }, fieldTypeName(field.type)),
    t('editor.fieldConfig')));

  // Puntos y tamaño del texto
  const pts = el('input', { type: 'number', min: '0', step: '0.5', value: String(field.points) });
  pts.addEventListener('input', () => {
    field.points = Math.max(0, parseFloat(pts.value.replace(',', '.')) || 0);
    refreshChip(field);
    markDirty();
  });
  const fs = el('input', { type: 'range', min: '0.6', max: '2', step: '0.1', value: String(field.fontScale || 1) });
  fs.addEventListener('input', () => {
    field.fontScale = parseFloat(fs.value);
    const node = canvas.querySelector(`[data-id="${field.id}"]`);
    if (node) node.style.setProperty('--fs', field.fontScale);
    markDirty();
  });
  cont.appendChild(el('label', { class: 'f-label' }, t('editor.points')));
  cont.appendChild(pts);
  cont.appendChild(el('label', { class: 'f-label' }, t('editor.fontSize')));
  cont.appendChild(fs);

  // Configuración específica del tipo
  const formBuilder = configForms[field.type];
  if (formBuilder) formBuilder(cont, field);

  // Acciones
  cont.appendChild(el('div', { class: 'ed-acciones' },
    el('button', { class: 'btn small', onclick: duplicateSelected }, t('editor.duplicate')),
    el('button', { class: 'btn small danger', onclick: deleteSelected }, t('editor.delete'))));

  panel.appendChild(cont);
}

function renderZonePanel(field) {
  const zone = field.config.zones.find(z => z.id === sel.zoneId);
  if (!zone) { sel = { kind: 'field', pageIndex: sel.pageIndex, fieldId: field.id }; renderFieldPanel(field); return; }
  const cont = el('div', {});
  cont.appendChild(el('h3', {},
    el('span', { class: 'tipo-chip' }, t('editor.zoneChip')),
    t('editor.zoneTitle')));
  cont.appendChild(el('label', { class: 'f-label' }, t('editor.zoneAnswer')));
  const inp = el('input', { type: 'text', value: zone.answer || '' });
  inp.addEventListener('input', () => {
    zone.answer = inp.value;
    const chip = canvas.querySelector(`.ed-zone[data-id="${zone.id}"] .chip`);
    if (chip) chip.textContent = zone.answer || 'zona';
    markDirty();
  });
  cont.appendChild(inp);
  cont.appendChild(el('p', { style: 'font-size:.85rem;color:var(--tinta-suave);margin-top:8px' },
    t('editor.zoneHint')));
  cont.appendChild(el('div', { class: 'ed-acciones' },
    el('button', { class: 'btn small', onclick: () => selectField(sel.pageIndex, field.id) }, t('editor.backToField')),
    el('button', { class: 'btn small danger', onclick: deleteSelected }, t('editor.deleteZone'))));
  panel.appendChild(cont);
}

// Editor genérico de listas de opciones.
function optionListEditor(cont, {
  label, items, render, add, remove, addLabel = '+ Añadir', min = 1
}) {
  if (label) cont.appendChild(el('label', { class: 'f-label' }, label));
  const list = el('div', { class: 'opt-list' });
  function paint() {
    list.textContent = '';
    items().forEach((item, i) => {
      const row = el('div', { class: 'opt-row' });
      render(row, item, i, paint);
      if (items().length > min) {
        const del = el('button', { class: 'opt-quitar', type: 'button', title: 'Quitar' }, '✕');
        del.addEventListener('click', () => { remove(i); markDirty(); paint(); });
        row.appendChild(del);
      }
      list.appendChild(row);
    });
  }
  paint();
  cont.appendChild(list);
  const btn = el('button', { class: 'btn small add-row', type: 'button' }, addLabel);
  btn.addEventListener('click', () => { add(); markDirty(); paint(); });
  cont.appendChild(btn);
  return paint;
}

function textCell(value, onInput, placeholder = '') {
  const inp = el('input', { type: 'text', value, placeholder });
  inp.addEventListener('input', () => { onInput(inp.value); markDirty(); });
  return inp;
}

function checkRow(cont, label, checked, onChange) {
  const inp = el('input', { type: 'checkbox' });
  inp.checked = checked;
  inp.addEventListener('change', () => { onChange(inp.checked); markDirty(); });
  cont.appendChild(el('label', { class: 'check-row' }, inp, el('span', {}, label)));
}

function textNormOptions(cont, cfg) {
  checkRow(cont, t('cfg.ignoreCase'), cfg.ignoreCase !== false, v => { cfg.ignoreCase = v; });
  checkRow(cont, t('cfg.ignoreAccents'), cfg.ignoreAccents !== false, v => { cfg.ignoreAccents = v; });
  checkRow(cont, t('cfg.collapseSpaces'), cfg.collapseSpaces !== false, v => { cfg.collapseSpaces = v; });
}

const configForms = {

  text(cont, field) {
    const cfg = field.config;
    optionListEditor(cont, {
      label: t('cfg.answers'),
      items: () => cfg.answers,
      render: (row, item, i) => row.appendChild(textCell(item, v => { cfg.answers[i] = v; }, t('cfg.answerPlaceholder'))),
      add: () => cfg.answers.push(''),
      remove: i => cfg.answers.splice(i, 1),
      addLabel: t('cfg.addAnswer')
    });
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.correction')));
    textNormOptions(cont, cfg);
  },

  number(cont, field) {
    const cfg = field.config;
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.correctAnswer')));
    cont.appendChild(textCell(String(cfg.answer ?? ''), v => { cfg.answer = v; }, 'Ej.: 3,14'));
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.tolerance')));
    cont.appendChild(textCell(String(cfg.tolerance ?? 0), v => { cfg.tolerance = v; }, '0'));
    cont.appendChild(el('p', { style: 'font-size:.82rem;color:var(--tinta-suave)' },
      t('cfg.numHint')));
  },

  single(cont, field) {
    const cfg = field.config;
    optionListEditor(cont, {
      label: t('cfg.singleOpts'),
      items: () => cfg.options,
      render: (row, item, i, paint) => {
        const radio = el('input', { type: 'radio', class: 'marca', name: 'cfg-correct' });
        radio.checked = Number(cfg.correct) === i;
        radio.addEventListener('change', () => { cfg.correct = i; markDirty(); });
        row.appendChild(radio);
        row.appendChild(textCell(item, v => { cfg.options[i] = v; }));
      },
      add: () => cfg.options.push('Opción ' + (cfg.options.length + 1)),
      remove: i => {
        cfg.options.splice(i, 1);
        if (Number(cfg.correct) === i) cfg.correct = 0;
        else if (Number(cfg.correct) > i) cfg.correct = Number(cfg.correct) - 1;
      },
      min: 2
    });
  },

  truefalse(cont, field) {
    const cfg = field.config;
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.correctAnswer')));
    const sel1 = el('select', {},
      el('option', { value: 'true' }, cfg.labels?.[0] || 'Verdadero'),
      el('option', { value: 'false' }, cfg.labels?.[1] || 'Falso'));
    sel1.value = String(Boolean(cfg.correct));
    sel1.addEventListener('change', () => { cfg.correct = sel1.value === 'true'; markDirty(); });
    cont.appendChild(sel1);
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.truefalseLabels')));
    cont.appendChild(textCell(cfg.labels?.[0] || 'Verdadero', v => {
      cfg.labels = [v, cfg.labels?.[1] || 'Falso'];
      sel1.options[0].textContent = v;
    }));
    cont.appendChild(textCell(cfg.labels?.[1] || 'Falso', v => {
      cfg.labels = [cfg.labels?.[0] || 'Verdadero', v];
      sel1.options[1].textContent = v;
    }));
  },

  multi(cont, field) {
    const cfg = field.config;
    optionListEditor(cont, {
      label: t('cfg.multiOpts'),
      items: () => cfg.options,
      render: (row, item, i) => {
        const chk = el('input', { type: 'checkbox', class: 'marca' });
        chk.checked = (cfg.correct || []).includes(i);
        chk.addEventListener('change', () => {
          const set = new Set(cfg.correct || []);
          chk.checked ? set.add(i) : set.delete(i);
          cfg.correct = [...set].sort((a, b) => a - b);
          markDirty();
        });
        row.appendChild(chk);
        row.appendChild(textCell(item, v => { cfg.options[i] = v; }));
      },
      add: () => cfg.options.push('Opción ' + (cfg.options.length + 1)),
      remove: i => {
        cfg.options.splice(i, 1);
        cfg.correct = (cfg.correct || []).filter(c => c !== i).map(c => (c > i ? c - 1 : c));
      },
      min: 2
    });
    checkRow(cont, t('cfg.partialScore'), Boolean(cfg.partial), v => { cfg.partial = v; });
  },

  select(cont, field) {
    configForms.single(cont, field);
  },

  gaps(cont, field) {
    const cfg = field.config;
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.gapsText')));
    const ta = el('textarea', { rows: '4' });
    ta.value = cfg.text || '';
    const info = el('p', { style: 'font-size:.82rem;color:var(--tinta-suave)' });
    function updateInfo() {
      const n = gapCount(ta.value);
      info.textContent = t('cfg.gapsHint', { n });
    }
    ta.addEventListener('input', () => { cfg.text = ta.value; updateInfo(); markDirty(); });
    updateInfo();
    cont.appendChild(ta);
    cont.appendChild(info);
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.correction')));
    textNormOptions(cont, cfg);
  },

  match(cont, field) {
    const cfg = field.config;
    optionListEditor(cont, {
      label: t('cfg.matchPairs'),
      items: () => cfg.pairs,
      render: (row, item, i) => {
        row.appendChild(textCell(item.left, v => { item.left = v; }, t('cfg.matchLeft')));
        row.appendChild(textCell(item.right, v => { item.right = v; }, t('cfg.matchRight')));
      },
      add: () => cfg.pairs.push({ left: '', right: '' }),
      remove: i => cfg.pairs.splice(i, 1),
      addLabel: t('cfg.addPair'),
      min: 2
    });
    optionListEditor(cont, {
      label: t('cfg.matchDistractors'),
      items: () => cfg.distractors,
      render: (row, item, i) => row.appendChild(textCell(item, v => { cfg.distractors[i] = v; }, t('cfg.matchDistractorPlaceholder'))),
      add: () => cfg.distractors.push(''),
      remove: i => cfg.distractors.splice(i, 1),
      addLabel: t('cfg.addDistractor'),
      min: 0
    });
  },

  order(cont, field) {
    const cfg = field.config;
    optionListEditor(cont, {
      label: t('cfg.orderItems'),
      items: () => cfg.items,
      render: (row, item, i) => {
        row.appendChild(el('span', { style: 'font-weight:700;color:var(--rojo);width:18px' }, String(i + 1)));
        row.appendChild(textCell(item, v => { cfg.items[i] = v; }));
      },
      add: () => cfg.items.push(''),
      remove: i => cfg.items.splice(i, 1),
      addLabel: t('cfg.addItem'),
      min: 2
    });
    cont.appendChild(el('p', { style: 'font-size:.82rem;color:var(--tinta-suave);margin-top:8px' },
      t('cfg.orderHint')));
  },

  dragdrop(cont, field) {
    const cfg = field.config;
    cont.appendChild(el('div', { class: 'zona-bloque' },
      t('cfg.dragdropZones', { n: cfg.zones.length })));
    const btnZona = el('button', { class: 'btn small add-row', type: 'button' }, t('cfg.drawZone'));
    btnZona.addEventListener('click', () => {
      activeTool = 'zone';
      refreshPaletteState();
      canvas.classList.add('drawing');
      toast(t('toast.drawZoneTip'));
    });
    cont.appendChild(btnZona);

    optionListEditor(cont, {
      label: t('cfg.zoneLabels'),
      items: () => cfg.zones,
      render: (row, zone) => {
        const inp = textCell(zone.answer || '', v => {
          zone.answer = v;
          const chip = canvas.querySelector(`.ed-zone[data-id="${zone.id}"] .chip`);
          if (chip) chip.textContent = v || 'zona';
        }, t('cfg.zoneLabelPlaceholder'));
        inp.addEventListener('focus', () => selectZoneSoft(zone.id));
        row.appendChild(inp);
      },
      add: () => {
        toast(t('cfg.useDrawZone'), 'error');
      },
      remove: i => {
        cfg.zones.splice(i, 1);
        renderCanvas();
      },
      addLabel: t('cfg.drawZone'),
      min: 0
    });

    optionListEditor(cont, {
      label: t('cfg.dragDistractors'),
      items: () => cfg.distractors,
      render: (row, item, i) => row.appendChild(textCell(item, v => { cfg.distractors[i] = v; }, t('cfg.dragDistractorPlaceholder'))),
      add: () => cfg.distractors.push(''),
      remove: i => cfg.distractors.splice(i, 1),
      addLabel: t('cfg.addDragDistractor'),
      min: 0
    });
  }
};

// Resalta una zona sin reconstruir el panel (para no perder el foco del input).
function selectZoneSoft(zoneId) {
  canvas.querySelectorAll('.ed-zone').forEach(n =>
    n.classList.toggle('selected', n.dataset.id === zoneId));
}

// Lista de todos los campos de la ficha.
function renderFieldList() {
  if (!manifest.pages.some(p => p.fields.length)) return;
  const box = el('div', { class: 'lista-campos' }, el('h3', {}, t('editor.fieldsTitle')));
  manifest.pages.forEach((page, pi) => {
    page.fields.forEach(field => {
      const item = el('div', { class: 'item' + (sel?.kind === 'field' && sel.fieldId === field.id ? ' sel' : '') },
        el('span', { class: 'g' }, FIELD_TYPES[field.type]?.glyph || '?'),
        el('span', { class: 'resumen' }, `P${pi + 1} · ${expectedText(field) || fieldTypeName(field.type)}`),
        el('span', { class: 'pts' }, field.points + ' pt'));
      item.addEventListener('click', () => {
        selectField(pi, field.id);
        canvas.querySelector(`[data-id="${field.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      box.appendChild(item);
    });
  });
  panel.appendChild(box);
}

// ---------- Ajustes ----------

function openSettings() {
  const dlg = $('#dlgAjustes');
  $('#ajAutor').value = manifest.author || '';
  $('#ajInstrucciones').value = manifest.instructions || '';
  $('#ajNota').checked = manifest.settings.showScore !== false;
  $('#ajCorreccion').checked = manifest.settings.showCorrection !== false;
  $('#ajBarajar').checked = Boolean(manifest.settings.shuffle);
  $('#ajIntentos').value = String(manifest.settings.maxAttempts || 0);
  dlg.showModal();
}

$('#dlgAjustes')?.addEventListener('close', () => {
  if ($('#dlgAjustes').returnValue !== 'ok') return;
  manifest.author = $('#ajAutor').value.trim();
  manifest.instructions = $('#ajInstrucciones').value.trim();
  manifest.settings.showScore = $('#ajNota').checked;
  manifest.settings.showCorrection = $('#ajCorreccion').checked;
  manifest.settings.shuffle = $('#ajBarajar').checked;
  manifest.settings.maxAttempts = Math.max(0, parseInt($('#ajIntentos').value, 10) || 0);
  markDirty();
});

// ---------- Compartir ----------

function openShare() {
  $('#compSalida').style.display = 'none';
  $('#dlgCompartir').showModal();
}

$('#btnGenerarEnlace')?.addEventListener('click', async () => {
  const url = $('#compUrl').value.trim();
  if (!url) { toast(t('toast.pasteUrl'), 'error'); return; }
  if (!/^https?:\/\//i.test(url)) { toast(t('toast.invalidUrl'), 'error'); return; }
  if (/drive\.google\.com/.test(url) && !parseDriveId(url)) {
    toast(t('toast.driveError'), 'error');
    return;
  }
  const btn = $('#btnGenerarEnlace');
  btn.disabled = true;
  toast(t('toast.generating'), 'info');
  const { link } = await buildShortLink(url);
  btn.disabled = false;
  $('#compEnlace').textContent = link;
  $('#compSalida').style.display = 'block';
  const ok = await copyToClipboard(link);
  if (ok) toast(t('toast.linkCopied'), 'ok');
});

$('#btnCopiarEnlace')?.addEventListener('click', async () => {
  const ok = await copyToClipboard($('#compEnlace').textContent);
  toast(ok ? t('toast.copied') : t('toast.notCopied'), ok ? 'ok' : 'error');
});

// ---------- Exportar / importar ----------

function validate() {
  const problems = [];
  if (!manifest.title.trim()) problems.push(t('validate.noTitle'));
  if (!manifest.pages.length) problems.push(t('validate.noPages'));
  if (!manifest.pages.some(p => p.fields.length)) problems.push(t('validate.noFields'));
  manifest.pages.forEach((p, pi) => {
    p.fields.forEach(f => {
      const e = expectedText(f);
      if (!e || !e.trim()) problems.push(t('validate.noAnswer', { n: pi + 1, type: fieldTypeName(f.type) }));
      if (f.type === 'dragdrop' && !(f.config.zones || []).length) {
        problems.push(t('validate.noZones', { n: pi + 1 }));
      }
    });
  });
  return problems;
}

async function exportZip() {
  manifest.title = titleInput.value.trim();
  const problems = validate();
  if (problems.length) {
    const blocking = !manifest.pages.length;
    const msg = t('validate.review', { problems: problems.join('\n· ') });
    if (blocking) { window.alert(msg); return; }
    if (!window.confirm(msg + t('validate.anyway'))) return;
  }
  manifest.lang = getLang();
  try {
    toast(t('toast.generating'));
    const blob = await exportFichaZip({ manifest, files });
    downloadBlob(blob, slugify(manifest.title || 'ficha') + '.zip');
    dirty = false;
    toast(t('toast.exported'), 'ok');
  } catch (e) {
    console.error(e);
    toast(t('toast.exportError', { msg: e.message }), 'error');
  }
}

async function openZipFile(file) {
  try {
    const ficha = await importFichaZip(file);
    manifest = ficha.manifest;
    files = ficha.files;
    urls.forEach(u => URL.revokeObjectURL(u));
    urls.clear();
    // Recalcular numeración de páginas para nuevas incorporaciones.
    pageSeq = 1 + manifest.pages.reduce((max, p) => {
      const m = /page-(\d+)\./.exec(p.image);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    sel = null;
    activeTool = null;
    titleInput.value = manifest.title || '';
    dirty = false;
    renderCanvas();
    renderPanel();
    refreshPaletteState();
    toast(t('toast.fichaLoaded', { title: manifest.title || file.name }), 'ok');
  } catch (e) {
    console.error(e);
    toast(e.message, 'error');
  }
}

// ---------- Vista previa ----------

function openPreview() {
  manifest.title = titleInput.value.trim();
  if (!manifest.pages.length) { toast(t('toast.addPageFirst'), 'error'); return; }
  const overlay = el('div', { class: 'prev-overlay' });
  const root = el('div', {});
  const cerrar = el('button', { class: 'btn small' }, t('preview.back'));
  overlay.appendChild(el('div', { class: 'prev-aviso' }, t('preview.banner'), cerrar));
  overlay.appendChild(root);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  preview = mountPlayer(root, { manifest: JSON.parse(JSON.stringify(manifest)), files }, { preview: true });
  cerrar.addEventListener('click', () => {
    preview.destroy();
    preview = null;
    overlay.remove();
    document.body.style.overflow = '';
  });
}

// ---------- Arranque ----------

titleInput.addEventListener('input', () => { manifest.title = titleInput.value; markDirty(); });

$('#btnPaginas').addEventListener('click', () => $('#inputPaginas').click());
$('#inputPaginas').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
$('#btnZip').addEventListener('click', () => $('#inputZip').click());
$('#inputZip').addEventListener('change', e => {
  if (e.target.files[0]) openZipFile(e.target.files[0]);
  e.target.value = '';
});
$('#btnAjustes').addEventListener('click', openSettings);
$('#btnCompartir').addEventListener('click', openShare);
$('#btnPrevia').addEventListener('click', openPreview);
$('#btnExportar').addEventListener('click', exportZip);

// Arrastrar archivos al lienzo
canvas.addEventListener('dragover', e => e.preventDefault());
canvas.addEventListener('drop', e => {
  e.preventDefault();
  const zip = Array.from(e.dataTransfer.files).find(f => /\.zip$/i.test(f.name));
  if (zip) openZipFile(zip);
  else addFiles(e.dataTransfer.files);
});

renderPalette();
renderCanvas();
renderPanel();
