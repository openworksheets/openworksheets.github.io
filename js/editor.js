// Editor de fichas (modo profesor).

import { el, uid, clamp, toast, downloadBlob, slugify, copyToClipboard, zoomControl } from './util.js';
import { FIELD_TYPES, PALETTE_GROUPS, fieldTypeName, gapCount, isShapeField } from './fieldtypes.js';
import { buildShapeSvg } from './render.js';
import { expectedText } from './grading.js';
import { pdfToPages, imageToPage, isPdf, isImage } from './pdfimport.js';
import { exportFichaZip, importFichaZip, newManifest } from './zipio.js';
import { buildShortLink, parseDriveId } from './drive.js';
import { mountPlayer } from './player.js';
import { t, getLang, applyI18n, initLangSelector } from './i18n.js';
import { createSubmissionCrypto, decryptManifestForStudent, encryptManifestForStudent, isEncryptedManifest } from './submissionCrypto.js';

applyI18n();
initLangSelector();

const EYE_SVG = '<svg class="eye-show" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-hide" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
function pwToggleBtn(title) {
  const btn = el('button', { type: 'button', class: 'pw-toggle', title });
  btn.innerHTML = EYE_SVG;
  return btn;
}

// ---------- Estado ----------

let manifest = newManifest();
let files = new Map();          // ruta → Blob
let pageSeq = 1;                // numeración de archivos de página
let activeTool = null;          // tipo de campo a dibujar, o 'zone'
let pendingAmItem = null;       // item de arrowmatch esperando que se dibuje su rect
let pendingAmNext = null;       // item que se dibujará automáticamente tras pendingAmItem
let sel = null;                 // {kind:'field'|'zone'|'amitem', pageIndex, fieldId, zoneId?, amItemId?}
let dirty = false;
let preview = null;
let submissionCryptoPassword = '';

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

function askExportPassword() {
  return new Promise(resolve => {
    const dlg = el('dialog', { class: 'crypto-dialog' },
      el('form', { method: 'dialog' },
        el('h2', {}, t('crypto.exportTitle')),
        el('p', {}, t('crypto.exportIntro')),
        el('p', { class: 'warn' }, t('crypto.exportWarning')),
        el('label', { class: 'f-label' }, t('crypto.exportPasswordLabel')),
        el('div', { class: 'password-row' },
          el('input', { type: 'password', autocomplete: 'new-password', required: '' }),
          pwToggleBtn(t('crypto.showPassword'))),
        el('label', { class: 'f-label' }, t('crypto.exportPasswordRepeatLabel')),
        el('div', { class: 'password-row' },
          el('input', { type: 'password', autocomplete: 'new-password', required: '' }),
          pwToggleBtn(t('crypto.showPassword'))),
        el('p', { class: 'crypto-error', hidden: '' }, t('crypto.passwordMismatch')),
        el('div', { class: 'dlg-buttons' },
          el('button', { class: 'btn', value: 'cancel', formnovalidate: '' }, t('dlg.cancel')),
          el('button', { class: 'btn primary', value: 'ok' }, t('crypto.exportContinue')))));
    const form = dlg.querySelector('form');
    const inputs = dlg.querySelectorAll('input[type="password"]');
    const error = dlg.querySelector('.crypto-error');
    form.addEventListener('submit', ev => {
      if (ev.submitter?.value !== 'ok') return;
      if (inputs[0].value !== inputs[1].value) {
        ev.preventDefault();
        error.hidden = false;
        inputs[1].focus();
        return;
      }
    });
    dlg.addEventListener('close', () => {
      const pass = dlg.returnValue === 'ok' ? inputs[0].value : '';
      dlg.remove();
      resolve(pass);
    });
    document.body.appendChild(dlg);
    dlg.showModal();
    inputs[0].focus();
  });
}

document.addEventListener('click', ev => {
  const btn = ev.target.closest?.('.pw-toggle');
  if (!btn) return;
  const input = btn.dataset.target
    ? document.getElementById(btn.dataset.target)
    : btn.parentElement?.querySelector('input');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.classList.toggle('on', input.type === 'text');
  btn.title = input.type === 'password' ? t('crypto.showPassword') : t('crypto.hidePassword');
});

function markDirty() { dirty = true; }

// ---------- Zoom del lienzo ----------

const zoomCtl = zoomControl({
  apply: z => canvas.style.setProperty('--zoom', z),
  key: 'wpf-ed-zoom',
  titles: { in: t('zoom.in'), out: t('zoom.out'), reset: t('zoom.reset') }
});

canvas.addEventListener('wheel', e => {
  if (!e.ctrlKey) return; // Ctrl+rueda (o pellizco en el panel táctil)
  e.preventDefault();
  zoomCtl.set(zoomCtl.get() * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
}, { passive: false });

window.addEventListener('beforeunload', e => {
  if (dirty) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- Paleta ----------

let openGroup = null; // al entrar, todos los grupos colapsados

function renderPalette() {
  palette.textContent = '';
  PALETTE_GROUPS.forEach(group => {
    const gName = t('palette.' + group.id);
    const head = el('button', { class: 'ed-group', type: 'button', title: gName },
      el('span', { class: 'glyph' }, group.glyph),
      el('span', { class: 'name' }, gName));
    head.dataset.group = group.id;
    head.addEventListener('click', () => {
      openGroup = openGroup === group.id ? null : group.id;
      refreshPaletteState();
    });
    palette.appendChild(head);

    const tools = el('div', { class: 'ed-group-tools' });
    tools.dataset.group = group.id;
    const inner = el('div', { class: 'ed-group-tools-inner' });
    tools.appendChild(inner);
    group.types.forEach(type => {
      const ft = FIELD_TYPES[type];
      const name = fieldTypeName(type);
      const btn = el('button', { class: 'ed-tool', type: 'button', title: name },
        el('span', { class: 'glyph' }, ft.glyph),
        el('span', { class: 'name' }, name));
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
      inner.appendChild(btn);
    });
    palette.appendChild(tools);
  });
  refreshPaletteState();
}

function refreshPaletteState() {
  palette.querySelectorAll('.ed-group').forEach(b => {
    b.classList.toggle('open', b.dataset.group === openGroup);
  });
  palette.querySelectorAll('.ed-group-tools').forEach(d => {
    d.classList.toggle('open', d.dataset.group === openGroup);
  });
  palette.querySelectorAll('.ed-tool').forEach(b => {
    b.classList.toggle('active', b.dataset.type === activeTool);
  });
  canvas.classList.toggle('drawing', Boolean(activeTool) || Boolean(pendingAmItem));
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

function addBlankPage() {
  const W = 794, H = 1123; // A4 a 96 dpi
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx2d = cv.getContext('2d');
  ctx2d.fillStyle = '#ffffff';
  ctx2d.fillRect(0, 0, W, H);
  cv.toBlob(blob => {
    addPage({ blob, ext: 'png', w: W, h: H });
    markDirty(); renderCanvas(); renderPanel();
  }, 'image/png');
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
        el('button', { class: 'btn', onclick: () => addBlankPage() }, t('editor.addBlank')),
        el('button', { class: 'btn', onclick: () => $('#inputZip').click() }, t('editor.openZip')))));
    return;
  }

  canvas.appendChild(el('div', { class: 'ed-zoom-wrap' }, zoomCtl.el));

  manifest.pages.forEach((page, pi) => {
    const pageEl = el('div', { class: 'wpf-page', dataset: { page: pi } },
      el('img', { class: 'fondo', src: fileUrl(page.image), alt: t('editor.pageN', { n: pi + 1, total: manifest.pages.length }), draggable: 'false' }));

    page.fields.forEach(field => {
      const decor = Boolean(FIELD_TYPES[field.type]?.decor);
      const box = el('div', { class: `ed-field ed-field-${field.type}`, dataset: { id: field.id } },
        el('span', { class: 'chip' }, decor ? fieldTypeName(field.type) : field.noScore ? `${fieldTypeName(field.type)} · —` : `${fieldTypeName(field.type)} · ${field.points} pt`),
        el('span', { class: 'handle' }));
      // Vista previa real de los elementos decorativos
      if (field.type === 'label') {
        box.appendChild(el('div', {
          class: 'ed-label-prev',
          style: `color:${field.config.color || 'inherit'};font-weight:${field.config.bold ? '700' : '400'}`
        }, field.config.text || ''));
      } else if (field.type === 'cover') {
        box.style.background = field.config.color || '#ffffff';
      } else if (field.type === 'image' && field.config?.src && files.has(field.config.src)) {
        box.appendChild(el('img', { src: fileUrl(field.config.src), class: 'ed-img-prev', alt: '' }));
      } else if (isShapeField(field.type)) {
        box.appendChild(buildShapeSvg(field));
      }
      setRectStyle(box, field.rect);
      box.style.setProperty('--fs', field.fontScale || 1);
      // En modo hotspot (arrowmatch con áreas definidas), el campo principal no se arrastra:
      // las posiciones las gestionan los overlays de items.
      const isAmHotspot = field.type === 'arrowmatch' && (field.config.items || []).some(i => i.rect);
      if (isAmHotspot) {
        box.classList.add('ed-am-hotspot-field');
        box.addEventListener('pointerdown', e => {
          if (activeTool || pendingAmItem) return;
          e.stopPropagation();
          selectField(pi, field.id);
        });
      } else {
        attachBoxInteraction(box, pageEl, field.rect, {
          onSelect: () => selectField(pi, field.id),
          isSelected: () => sel?.kind === 'field' && sel.fieldId === field.id
        });
      }
      pageEl.appendChild(box);

      if (field.type === 'dragdrop') {
        (field.config.zones || []).forEach(zone => {
          const zChipText = Array.isArray(zone.answers) && zone.answers.length
            ? firstAnswerLabel(zone.answers) : (zone.answer || 'zona');
          const zEl = el('div', { class: 'ed-zone', dataset: { id: zone.id } },
            el('span', { class: 'chip' }, zChipText),
            el('span', { class: 'handle' }));
          setRectStyle(zEl, zone.rect);
          attachBoxInteraction(zEl, pageEl, zone.rect, {
            onSelect: () => selectZone(pi, field.id, zone.id),
            isSelected: () => sel?.kind === 'zone' && sel.zoneId === zone.id
          });
          pageEl.appendChild(zEl);
        });
      }

      if (field.type === 'arrowmatch') {
        (field.config.items || []).filter(i => i.rect).forEach(item => {
          const label = item.src ? '🖼' : (item.label || '?');
          const aEl = el('div', { class: `ed-amitem ed-amitem-${item.side}`, dataset: { id: item.id } },
            el('span', { class: 'chip' }, label),
            el('span', { class: 'handle' }));
          setRectStyle(aEl, item.rect);
          attachBoxInteraction(aEl, pageEl, item.rect, {
            onSelect: () => selectAmItem(pi, field.id, item.id),
            isSelected: () => sel?.kind === 'amitem' && sel.amItemId === item.id
          });
          pageEl.appendChild(aEl);
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
  canvas.querySelectorAll('.ed-field, .ed-zone, .ed-amitem').forEach(n => n.classList.remove('selected'));
  if (!sel) return;
  const id = sel.kind === 'zone' ? sel.zoneId : sel.kind === 'amitem' ? sel.amItemId : sel.fieldId;
  const node = canvas.querySelector(`[data-id="${id}"]`);
  if (node) node.classList.add('selected');
}

// Dimensiones del área de contenido de la página (sin borde).
function pageContentSize(pageEl) {
  const pr = pageEl.getBoundingClientRect();
  const bl = parseFloat(getComputedStyle(pageEl).borderLeftWidth) || 0;
  const bt = parseFloat(getComputedStyle(pageEl).borderTopWidth)  || 0;
  return { left: pr.left + bl, top: pr.top + bt, width: pageEl.clientWidth, height: pageEl.clientHeight };
}

// Mover y redimensionar un rectángulo (campo o zona).
function attachBoxInteraction(box, pageEl, rect, { onSelect, isSelected }) {
  box.addEventListener('pointerdown', e => {
    if (activeTool || pendingAmItem) return; // en modo dibujo, la página gestiona el evento
    e.stopPropagation();
    e.preventDefault();
    onSelect();

    const resizing = e.target.classList.contains('handle');
    const pr = pageContentSize(pageEl);
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
    if (!activeTool && !pendingAmItem) {
      // Clic en el fondo (la imagen no recibe eventos): deseleccionar.
      if (e.target === pageEl) {
        sel = null;
        refreshSelectionStyles();
        renderPanel();
      }
      return;
    }
    e.preventDefault();
    const pr = pageContentSize(pageEl);
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

      if (pendingAmItem) {
        const item = pendingAmItem;
        const nextItem = pendingAmNext;
        pendingAmItem = null;
        pendingAmNext = null;
        if (r.w < 0.02 || r.h < 0.015) r = { x: clamp(x0 - 0.06, 0, 0.88), y: clamp(y0 - 0.025, 0, 0.95), w: 0.12, h: 0.05 };
        item.rect = r;
        markDirty();
        const fieldId = sel?.fieldId || getFieldIdForItem(pi, item.id);
        renderCanvas();
        selectField(pi, fieldId);
        if (nextItem && !nextItem.rect) {
          pendingAmItem = nextItem;
          refreshPaletteState();
          toast(t('toast.amDrawAreaTip'), 'info');
        } else {
          refreshPaletteState();
        }
        return;
      }

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

function getFieldIdForItem(pi, itemId) {
  const page = manifest.pages[pi];
  if (!page) return null;
  const field = page.fields.find(f => f.type === 'arrowmatch' && (f.config.items || []).some(i => i.id === itemId));
  return field?.id || null;
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
    points: FIELD_TYPES[type].decor ? 0 : 1,
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
  const zone = { id: uid('z'), rect, answers: ['Etiqueta ' + (field.config.zones.length + 1)] };
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

function selectAmItem(pi, fieldId, amItemId) {
  sel = { kind: 'amitem', pageIndex: pi, fieldId, amItemId };
  refreshSelectionStyles();
  renderPanel(); // muestra el panel del campo (pairs list)
}

function deleteSelected() {
  if (!sel) return;
  const field = getField(sel.pageIndex, sel.fieldId);
  if (!field) return;
  if (sel.kind === 'zone') {
    field.config.zones = field.config.zones.filter(z => z.id !== sel.zoneId);
    sel = { kind: 'field', pageIndex: sel.pageIndex, fieldId: field.id };
  } else if (sel.kind === 'amitem') {
    const item = (field.config.items || []).find(i => i.id === sel.amItemId);
    if (item) delete item.rect;
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
    : sel.kind === 'amitem'
      ? (field.config.items || []).find(i => i.id === sel.amItemId)?.rect
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
    const id = sel.kind === 'zone' ? sel.zoneId : sel.kind === 'amitem' ? sel.amItemId : sel.fieldId;
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
      else renderFieldPanel(field); // 'field' y 'amitem' muestran el panel del campo
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

function refreshFieldList() {
  panel.querySelector('.lista-campos')?.remove();
  renderFieldList();
}

function refreshChip(field) {
  const node = canvas.querySelector(`.ed-field[data-id="${field.id}"] .chip`);
  if (!node) return;
  node.textContent = FIELD_TYPES[field.type]?.decor
    ? fieldTypeName(field.type)
    : field.noScore
      ? `${fieldTypeName(field.type)} · —`
      : `${fieldTypeName(field.type)} · ${field.points} pt`;
}

function renderFieldPanel(field) {
  const cont = el('div', {});
  cont.appendChild(el('h3', {},
    el('span', { class: 'tipo-chip' }, fieldTypeName(field.type)),
    t('editor.fieldConfig')));

  const decor = Boolean(FIELD_TYPES[field.type]?.decor);

  // Puntos (los decorativos no puntúan) y tamaño del texto
  if (!decor) {
    const noScoreCb = el('input', { type: 'checkbox' });
    noScoreCb.checked = Boolean(field.noScore);
    const ptsRow = el('div', {});
    const pts = el('input', { type: 'number', min: '0', step: '0.5', value: String(field.points) });
    pts.addEventListener('input', () => {
      field.points = Math.max(0, parseFloat(pts.value.replace(',', '.')) || 0);
      refreshChip(field);
      refreshFieldList();
      markDirty();
    });
    ptsRow.appendChild(el('label', { class: 'f-label' }, t('editor.points')));
    ptsRow.appendChild(pts);
    if (field.noScore) ptsRow.style.display = 'none';
    noScoreCb.addEventListener('change', () => {
      field.noScore = noScoreCb.checked;
      ptsRow.style.display = field.noScore ? 'none' : '';
      refreshChip(field);
      refreshFieldList();
      markDirty();
    });
    cont.appendChild(el('label', { class: 'check-row' }, noScoreCb, t('editor.noScore')));
    cont.appendChild(ptsRow);
  }
  if (field.type !== 'cover' && !isShapeField(field.type)) {
    const fs = el('input', { type: 'range', min: '0.6', max: '2', step: '0.1', value: String(field.fontScale || 1) });
    fs.addEventListener('input', () => {
      field.fontScale = parseFloat(fs.value);
      const node = canvas.querySelector(`[data-id="${field.id}"]`);
      if (node) node.style.setProperty('--fs', field.fontScale);
      markDirty();
    });
    cont.appendChild(el('label', { class: 'f-label' }, t('editor.fontSize')));
    cont.appendChild(fs);
  }

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
  // Normaliza formato antiguo (answer: string) → nuevo (answers: string[])
  if (!Array.isArray(zone.answers)) {
    zone.answers = zone.answer ? [String(zone.answer)] : [''];
    delete zone.answer;
  }
  function updateZoneChip() {
    const chip = canvas.querySelector(`.ed-zone[data-id="${zone.id}"] .chip`);
    if (chip) chip.textContent = zone.answers[0] || 'zona';
  }
  const cont = el('div', {});
  cont.appendChild(el('h3', {},
    el('span', { class: 'tipo-chip' }, t('editor.zoneChip')),
    t('editor.zoneTitle')));
  optionListEditor(cont, {
    label: t('editor.zoneAnswer'),
    items: () => zone.answers,
    render: (row, item, i, repaint) => {
      const isImg = item.startsWith('dtokens/');
      // Botón/preview de imagen.
      const imgBtn = el('button', { class: 'ans-img-btn' + (isImg ? ' has-img' : ''), type: 'button', title: t('cfg.uploadTokenImg') });
      if (isImg && files.has(item)) {
        imgBtn.appendChild(el('img', { src: fileUrl(item), class: 'tok-thumb', alt: '' }));
      }
      imgBtn.addEventListener('click', () => {
        const pick = document.createElement('input');
        pick.type = 'file'; pick.accept = 'image/png,image/jpeg,image/gif,image/webp';
        pick.addEventListener('change', () => {
          const f = pick.files[0]; if (!f) return;
          const ext = f.name.split('.').pop().toLowerCase() || 'png';
          const path = 'dtokens/' + uid() + '.' + ext;
          if (isImg) { urls.delete(item); files.delete(item); }
          files.set(path, f);
          zone.answers[i] = path;
          updateZoneChip(); markDirty(); repaint();
        });
        pick.click();
      });
      row.appendChild(imgBtn);
      // Input de texto (solo cuando no hay imagen).
      if (!isImg) {
        row.appendChild(textCell(item, v => { zone.answers[i] = v; updateZoneChip(); }, t('cfg.zoneLabelPlaceholder')));
      } else {
        // Botón para quitar la imagen y volver a texto.
        const quitImg = el('button', { class: 'btn small', type: 'button', title: t('cfg.removeImage') }, '✕🖼');
        quitImg.addEventListener('click', e => {
          e.stopPropagation();
          urls.delete(item); files.delete(item);
          zone.answers[i] = ''; updateZoneChip(); markDirty(); repaint();
        });
        row.appendChild(quitImg);
      }
    },
    add: () => zone.answers.push(''),
    remove: i => {
      const a = zone.answers[i];
      if (a.startsWith('dtokens/')) { urls.delete(a); files.delete(a); }
      zone.answers.splice(i, 1); updateZoneChip();
    },
    addLabel: t('cfg.addZoneAnswer'),
    min: 1
  });
  cont.appendChild(el('p', { style: 'font-size:.85rem;color:var(--tinta-suave);margin-top:8px' },
    t('editor.zoneHint')));
  cont.appendChild(el('div', { class: 'ed-acciones' },
    el('button', { class: 'btn small', onclick: () => selectField(sel.pageIndex, field.id) }, t('editor.backToField')),
    el('button', { class: 'btn small danger', onclick: deleteSelected }, t('editor.deleteZone'))));
  panel.appendChild(cont);
}

function renderAmItemPanel(field) {
  const item = (field.config.items || []).find(i => i.id === sel.amItemId);
  if (!item) { sel = { kind: 'field', pageIndex: sel.pageIndex, fieldId: field.id }; renderFieldPanel(field); return; }
  const cont = el('div', {});
  const sideLabel = item.side === 'left' ? t('cfg.amLeft') : t('cfg.amRight');
  cont.appendChild(el('h3', {},
    el('span', { class: 'tipo-chip' }, sideLabel),
    t('editor.amItemTitle')));
  cont.appendChild(el('p', { style: 'font-size:.85rem;color:var(--tinta-suave)' }, t('editor.amItemHint')));
  cont.appendChild(el('div', { class: 'ed-acciones' },
    el('button', { class: 'btn small', onclick: () => selectField(sel.pageIndex, field.id) }, t('editor.backToField')),
    el('button', { class: 'btn small danger', onclick: deleteSelected }, t('editor.amItemDelete'))));
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

// Sustituye la vista previa SVG de una forma tras cambiar su configuración.
function refreshShapePrev(field) {
  const old = canvas.querySelector(`.ed-field[data-id="${field.id}"] .wpf-shape`);
  if (old) old.replaceWith(buildShapeSvg(field));
}

function selectRow(cont, label, value, options, onChange) {
  cont.appendChild(el('label', { class: 'f-label' }, label));
  const s = el('select', {}, ...options.map(([v, txt]) => el('option', { value: v }, txt)));
  s.value = value;
  s.addEventListener('change', () => { onChange(s.value); markDirty(); });
  cont.appendChild(s);
}

// Color, grosor y estilo de trazo, comunes a las cuatro formas.
function shapeStrokeConfig(cont, field) {
  const cfg = field.config;
  cont.appendChild(el('label', { class: 'f-label' }, t('cfg.strokeColor')));
  const color = el('input', { type: 'color', value: cfg.color || '#1d2c42' });
  color.addEventListener('input', () => { cfg.color = color.value; refreshShapePrev(field); markDirty(); });
  cont.appendChild(color);
  cont.appendChild(el('label', { class: 'f-label' }, t('cfg.strokeWidth')));
  const w = el('input', { type: 'range', min: '1', max: '14', step: '1', value: String(cfg.width || 2) });
  w.addEventListener('input', () => { cfg.width = parseFloat(w.value); refreshShapePrev(field); markDirty(); });
  cont.appendChild(w);
  selectRow(cont, t('cfg.strokeStyle'), cfg.style || 'solid', [
    ['solid', t('cfg.styleSolid')],
    ['dashed', t('cfg.styleDashed')],
    ['dotted', t('cfg.styleDotted')]
  ], v => { cfg.style = v; refreshShapePrev(field); });
}

const configForms = {

  line(cont, field) {
    shapeStrokeConfig(cont, field);
    selectRow(cont, t('cfg.lineDir'), field.config.dir || 'h', [
      ['h', t('cfg.dirH')],
      ['v', t('cfg.dirV')],
      ['d1', t('cfg.dirD1')],
      ['d2', t('cfg.dirD2')]
    ], v => { field.config.dir = v; refreshShapePrev(field); });
  },

  arrow(cont, field) {
    configForms.line(cont, field);
    checkRow(cont, t('cfg.arrowInvert'), Boolean(field.config.invert), v => {
      field.config.invert = v;
      refreshShapePrev(field);
    });
    checkRow(cont, t('cfg.arrowDouble'), Boolean(field.config.double), v => {
      field.config.double = v;
      refreshShapePrev(field);
    });
  },

  rect(cont, field) {
    const cfg = field.config;

    // Borde (opcional)
    const strokeBox = el('div', {});
    checkRow(cont, t('cfg.shapeStroke'), !cfg.noStroke, v => {
      cfg.noStroke = !v;
      strokeBox.style.display = v ? '' : 'none';
      refreshShapePrev(field);
    });
    shapeStrokeConfig(strokeBox, field);
    if (cfg.noStroke) strokeBox.style.display = 'none';
    cont.appendChild(strokeBox);

    // Relleno (opcional), con color y opacidad
    const fillColor = el('input', { type: 'color', value: cfg.fill || '#f8e3a1' });
    fillColor.addEventListener('input', () => { cfg.fill = fillColor.value; refreshShapePrev(field); markDirty(); });
    const fillOp = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(cfg.fillOpacity ?? 1) });
    fillOp.addEventListener('input', () => { cfg.fillOpacity = parseFloat(fillOp.value); refreshShapePrev(field); markDirty(); });
    const fillRow = el('div', {},
      el('label', { class: 'f-label' }, t('cfg.fillColor')), fillColor,
      el('label', { class: 'f-label' }, t('cfg.fillOpacity')), fillOp);
    if (!cfg.fill) fillRow.style.display = 'none';
    checkRow(cont, t('cfg.shapeFill'), Boolean(cfg.fill), v => {
      cfg.fill = v ? fillColor.value : '';
      fillRow.style.display = v ? '' : 'none';
      refreshShapePrev(field);
    });
    cont.appendChild(fillRow);
  },

  ellipse(cont, field) {
    configForms.rect(cont, field);
  },

  label(cont, field) {
    const cfg = field.config;
    const prev = () => canvas.querySelector(`.ed-field[data-id="${field.id}"] .ed-label-prev`);
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.labelText')));
    const ta = el('textarea', { rows: '3' });
    ta.value = cfg.text || '';
    ta.addEventListener('input', () => {
      cfg.text = ta.value;
      const p = prev();
      if (p) p.textContent = cfg.text;
      markDirty();
    });
    cont.appendChild(ta);
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.labelColor')));
    const color = el('input', { type: 'color', value: cfg.color || '#1d2c42' });
    color.addEventListener('input', () => {
      cfg.color = color.value;
      const p = prev();
      if (p) p.style.color = cfg.color;
      markDirty();
    });
    cont.appendChild(color);
    checkRow(cont, t('cfg.labelBold'), Boolean(cfg.bold), v => {
      cfg.bold = v;
      const p = prev();
      if (p) p.style.fontWeight = v ? '700' : '400';
    });
  },

  cover(cont, field) {
    const cfg = field.config;
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.coverColor')));
    const color = el('input', { type: 'color', value: cfg.color || '#ffffff' });
    color.addEventListener('input', () => {
      cfg.color = color.value;
      const box = canvas.querySelector(`.ed-field[data-id="${field.id}"]`);
      if (box) box.style.background = cfg.color;
      markDirty();
    });
    cont.appendChild(color);
    cont.appendChild(el('p', { style: 'font-size:.85rem;color:var(--tinta-suave);margin-top:8px' },
      t('cfg.coverHint')));
  },

  image(cont, field) {
    const cfg = field.config;
    if (cfg.src && files.has(cfg.src)) {
      const prev = el('div', { class: 'img-field-preview' });
      prev.appendChild(el('img', { src: fileUrl(cfg.src), alt: '', class: 'img-field-thumb' }));
      cont.appendChild(prev);
    }
    const btn = el('button', { class: 'btn small', type: 'button' }, t('cfg.changeImage'));
    btn.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/gif,image/webp';
      inp.addEventListener('change', () => {
        const f = inp.files[0]; if (!f) return;
        const ext = f.name.split('.').pop().toLowerCase() || 'png';
        const path = 'images/' + uid() + '.' + ext;
        if (cfg.src) { urls.delete(cfg.src); files.delete(cfg.src); }
        files.set(path, f);
        cfg.src = path;
        markDirty();
        renderCanvas();
        renderFieldPanel(field);
      });
      inp.click();
    });
    cont.appendChild(btn);
    cont.appendChild(el('p', { style: 'font-size:.85rem;color:var(--tinta-suave);margin-top:8px' },
      t('cfg.imageHint')));
  },

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

  arrowmatch(cont, field) {
    const cfg = field.config;
    if (!Array.isArray(cfg.items)) cfg.items = [];
    if (!Array.isArray(cfg.pairs)) cfg.pairs = [];

    // Lista de pares: cada par izquierda ↔ derecha
    function getDisplayPairs() {
      return cfg.items
        .filter(i => i.side === 'left')
        .map(left => {
          const ref = cfg.pairs.find(p => p.from === left.id);
          const right = ref ? cfg.items.find(i => i.id === ref.to) : null;
          return { left, right };
        });
    }

    function startDraw(item, next) {
      if (!manifest.pages.length) { toast(t('toast.addPdfFirst'), 'error'); return; }
      pendingAmItem = item;
      pendingAmNext = next || null;
      refreshPaletteState();
      toast(t('toast.amDrawAreaTip'), 'info');
    }

    function makeAreaBtn(item, next) {
      const hasArea = Boolean(item?.rect);
      const btn = el('button', {
        class: 'btn small am-area-btn' + (hasArea ? ' has-area' : ''),
        type: 'button',
        title: t(hasArea ? 'cfg.amRedrawArea' : 'cfg.amDrawArea')
      }, hasArea ? '⊡' : '⊞');
      btn.addEventListener('click', () => item && startDraw(item, next));
      return btn;
    }

    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.amPairs')));
    const list = el('div', { class: 'am-pairs-list' });
    cont.appendChild(list);

    function paint() {
      list.textContent = '';
      getDisplayPairs().forEach(({ left, right }, idx) => {
        const row = el('div', { class: 'am-pair-row2' });
        row.appendChild(el('span', { class: 'am-pair-num' }, String(idx + 1)));

        // Lado izquierdo
        const leftPart = el('div', { class: 'am-side am-side-left' });
        if (left.src && files.has(left.src)) {
          leftPart.appendChild(el('img', { src: fileUrl(left.src), class: 'tok-thumb-xs', alt: '' }));
        } else if (!left.rect) {
          const inp = el('input', { type: 'text', class: 'f-input-xs', value: left.label || '', placeholder: '…' });
          inp.addEventListener('input', () => { left.label = inp.value; markDirty(); });
          leftPart.appendChild(inp);
        }
        leftPart.appendChild(makeAreaBtn(left, right));
        row.appendChild(leftPart);

        row.appendChild(el('span', { class: 'am-arrow' }, '↔'));

        // Lado derecho
        const rightPart = el('div', { class: 'am-side am-side-right' });
        if (right) {
          if (right.src && files.has(right.src)) {
            rightPart.appendChild(el('img', { src: fileUrl(right.src), class: 'tok-thumb-xs', alt: '' }));
          } else if (!right.rect) {
            const inp = el('input', { type: 'text', class: 'f-input-xs', value: right.label || '', placeholder: '…' });
            inp.addEventListener('input', () => { right.label = inp.value; markDirty(); });
            rightPart.appendChild(inp);
          }
          rightPart.appendChild(makeAreaBtn(right, null));
        } else {
          rightPart.appendChild(el('span', { style: 'opacity:.4;font-size:.85em' }, '?'));
        }
        row.appendChild(rightPart);

        // Borrar par
        const del = el('button', { class: 'btn small ghost', type: 'button', title: t('editor.delete') }, '✕');
        del.addEventListener('click', () => {
          [left, right].filter(Boolean).forEach(item => {
            if (item.src) { urls.delete(item.src); files.delete(item.src); }
          });
          const delIds = new Set([left.id, right?.id].filter(Boolean));
          cfg.items = cfg.items.filter(i => !delIds.has(i.id));
          cfg.pairs = cfg.pairs.filter(p => !delIds.has(p.from) && !delIds.has(p.to));
          markDirty(); paint(); renderCanvas();
        });
        row.appendChild(del);
        list.appendChild(row);
      });
    }

    paint();

    const addBtn = el('button', { class: 'btn small add-row', type: 'button' }, t('cfg.addAmPair'));
    addBtn.addEventListener('click', () => {
      const left  = { id: uid('am'), side: 'left',  label: '', src: '' };
      const right = { id: uid('am'), side: 'right', label: '', src: '' };
      cfg.items.push(left, right);
      cfg.pairs.push({ from: left.id, to: right.id });
      markDirty();
      paint();
      startDraw(left, right);
    });
    cont.appendChild(addBtn);
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
    optionListEditor(cont, {
      label: t('cfg.zoneLabels'),
      items: () => cfg.zones,
      render: (row, zone) => {
        if (!Array.isArray(zone.answers)) {
          zone.answers = zone.answer ? [String(zone.answer)] : [''];
          delete zone.answer;
        }
        const textAnswers = zone.answers.filter(a => !a.startsWith('dtokens/'));
        const imgAnswers  = zone.answers.filter(a =>  a.startsWith('dtokens/'));
        const inp = textCell(textAnswers.join(', '), v => {
          const newText = v.split(',').map(s => s.trim()).filter(Boolean);
          zone.answers = [...imgAnswers, ...newText];
          if (!zone.answers.length) zone.answers = [''];
          const chip = canvas.querySelector(`.ed-zone[data-id="${zone.id}"] .chip`);
          if (chip) chip.textContent = firstAnswerLabel(zone.answers) || 'zona';
        }, t('cfg.zoneLabelPlaceholder'));
        inp.addEventListener('focus', () => selectZoneSoft(zone.id));
        row.appendChild(inp);
        imgAnswers.forEach(p => {
          if (files.has(p)) row.appendChild(el('img', { src: fileUrl(p), class: 'tok-thumb-xs', alt: '🖼', title: p }));
        });
      },
      add: () => {
        activeTool = 'zone';
        refreshPaletteState();
        canvas.classList.add('drawing');
        toast(t('toast.drawZoneTip'));
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
function firstAnswerLabel(answers) {
  const first = (answers || []).find(Boolean) || '';
  return first.startsWith('dtokens/') ? '🖼' : first;
}

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
      const decor = Boolean(FIELD_TYPES[field.type]?.decor);
      const resumen = field.type === 'label'
        ? (field.config.text || fieldTypeName(field.type))
        : (expectedText(field) || fieldTypeName(field.type));
      const item = el('div', { class: 'item' + (sel?.kind === 'field' && sel.fieldId === field.id ? ' sel' : '') },
        el('span', { class: 'g' }, FIELD_TYPES[field.type]?.glyph || '?'),
        el('span', { class: 'resumen' }, `P${pi + 1} · ${resumen}`),
        decor ? null : el('span', { class: 'pts' }, field.noScore ? '—' : field.points + ' pt'));
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

// Selectores de hora/minutos (los datetime-local obligan a teclear la hora en Firefox)
function fillTimeSelects() {
  const pad = n => String(n).padStart(2, '0');
  for (const id of ['ajDesdeH', 'ajHastaH']) {
    const sel = $('#' + id);
    if (sel.options.length) continue;
    for (let h = 0; h < 24; h++) sel.add(new Option(pad(h), pad(h)));
  }
  for (const id of ['ajDesdeM', 'ajHastaM']) {
    const sel = $('#' + id);
    if (sel.options.length) continue;
    for (let m = 0; m < 60; m += 1) sel.add(new Option(pad(m), pad(m)));
  }
}

function setDateTime(value, prefix, defH, defM) {
  const [fecha, hora] = (value || '').split('T');
  $('#' + prefix + 'Fecha').value = fecha || '';
  const [h, m] = (hora || defH + ':' + defM).split(':');
  $('#' + prefix + 'H').value = h;
  $('#' + prefix + 'M').value = String(Math.min(59, parseInt(m, 10) || 0)).padStart(2, '0');
}

function getDateTime(prefix) {
  const fecha = $('#' + prefix + 'Fecha').value;
  if (!fecha) return '';
  return fecha + 'T' + $('#' + prefix + 'H').value + ':' + $('#' + prefix + 'M').value;
}

function updateCryptoSettingsUi() {
  const enabled = $('#ajCifrarEntregas').checked;
  $('#ajCryptoPasswordBlock').hidden = !enabled;
  $('#ajCryptoDisabledWarning').hidden = enabled;
  $('#ajCryptoPassword').required = enabled;
  $('#ajCryptoPassword').disabled = !enabled;
}

function openSettings() {
  const dlg = $('#dlgAjustes');
  fillTimeSelects();
  $('#ajTitulo').value = manifest.title || '';
  $('#ajAutor').value = manifest.author || '';
  $('#ajInstrucciones').value = manifest.instructions || '';
  $('#ajNota').checked = manifest.settings.showScore !== false;
  $('#ajCorreccion').checked = manifest.settings.showCorrection !== false;
  $('#ajBarajar').checked = Boolean(manifest.settings.shuffle);
  $('#ajIntentos').value = String(manifest.settings.maxAttempts || 0);
  $('#ajCifrarEntregas').checked = manifest.settings.encryptSubmissions !== false;
  $('#ajCryptoPassword').value = submissionCryptoPassword;
  updateCryptoSettingsUi();
  const acc = manifest.access || {};
  setDateTime(acc.desde, 'ajDesde', '08', '00');
  setDateTime(acc.hasta, 'ajHasta', '23', '59');
  $('#ajAutoEntrega').checked = Boolean(acc.autoEntrega);
  $('#ajTiempo').value = String(acc.tiempoLimite || 0);
  $('#ajPassword').value = acc.password || '';
  dlg.showModal();
}

$('#ajCifrarEntregas')?.addEventListener('change', updateCryptoSettingsUi);

$('#dlgAjustes form')?.addEventListener('submit', ev => {
  if (ev.submitter?.value !== 'ok') return;
  const accessPassword = $('#ajPassword').value.trim();
  const cryptoPassword = $('#ajCryptoPassword').value;
  if ($('#ajCifrarEntregas').checked && !cryptoPassword) {
    ev.preventDefault();
    toast(t('crypto.passwordRequired'), 'error');
    $('#ajCryptoPassword').focus();
    return;
  }
  if ($('#ajCifrarEntregas').checked && accessPassword && cryptoPassword && accessPassword === cryptoPassword) {
    ev.preventDefault();
    toast(t('crypto.sameAsAccess'), 'error');
    $('#ajCryptoPassword').focus();
  }
});

$('#dlgAjustes')?.addEventListener('close', () => {
  if ($('#dlgAjustes').returnValue !== 'ok') return;
  const newTitle = $('#ajTitulo').value.trim();
  manifest.title = newTitle;
  titleInput.value = newTitle;
  manifest.author = $('#ajAutor').value.trim();
  manifest.instructions = $('#ajInstrucciones').value.trim();
  manifest.settings.showScore = $('#ajNota').checked;
  manifest.settings.showCorrection = $('#ajCorreccion').checked;
  manifest.settings.shuffle = $('#ajBarajar').checked;
  manifest.settings.maxAttempts = Math.max(0, parseInt($('#ajIntentos').value, 10) || 0);
  manifest.settings.encryptSubmissions = $('#ajCifrarEntregas').checked;
  submissionCryptoPassword = manifest.settings.encryptSubmissions ? $('#ajCryptoPassword').value : '';
  if (!manifest.settings.encryptSubmissions) delete manifest.submissionCrypto;
  manifest.access = {
    desde: getDateTime('ajDesde'),
    hasta: getDateTime('ajHasta'),
    autoEntrega: $('#ajAutoEntrega').checked,
    tiempoLimite: Math.max(0, parseInt($('#ajTiempo').value, 10) || 0),
    password: $('#ajPassword').value.trim()
  };
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
      if (FIELD_TYPES[f.type]?.decor) return; // los decorativos no necesitan respuesta
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
    let exportManifest = JSON.parse(JSON.stringify(manifest));
    if (exportManifest.settings?.encryptSubmissions !== false) {
      if (!submissionCryptoPassword) {
        toast(t('crypto.passwordRequired'), 'error');
        openSettings();
        return;
      }
      exportManifest.submissionCrypto = await createSubmissionCrypto(submissionCryptoPassword);
    } else {
      delete exportManifest.submissionCrypto;
    }
    if (exportManifest.access?.password) {
      exportManifest = await encryptManifestForStudent(exportManifest, exportManifest.access.password);
    }
    const blob = await exportFichaZip({ manifest: exportManifest, files });
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
    if (isEncryptedManifest(ficha.manifest)) {
      const password = window.prompt(t('alumno.encryptedDesc'));
      if (!password) return;
      ficha.manifest = await decryptManifestForStudent(ficha.manifest, password, { keepPassword: true });
    }
    manifest = ficha.manifest;
    files = ficha.files;
    submissionCryptoPassword = '';
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

// ---------- Pegar desde portapapeles ----------

function currentPageIndex() {
  if (sel) return sel.pageIndex;
  const pages = Array.from(canvas.querySelectorAll('.wpf-page'));
  if (!pages.length) return -1;
  let best = 0, bestVis = -1;
  pages.forEach(p => {
    const r = p.getBoundingClientRect();
    const vis = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    if (vis > bestVis) { bestVis = vis; best = parseInt(p.dataset.page, 10); }
  });
  return best;
}

async function pasteText(text) {
  if (!manifest.pages.length) { toast(t('toast.addPdfFirst'), 'error'); return; }
  const pi = currentPageIndex();
  const field = {
    id: uid('f'),
    type: 'label',
    rect: { x: 0.05, y: 0.05, w: 0.9, h: 0.1 },
    points: 0,
    fontScale: 1,
    config: { text, color: '#1d2c42', bold: false }
  };
  manifest.pages[pi].fields.push(field);
  markDirty();
  renderCanvas();
  selectField(pi, field.id);
  toast(t('toast.pasteTextLabel'), 'ok');
}

async function pasteImage(blob, mimeType) {
  if (!manifest.pages.length) { toast(t('toast.addPdfFirst'), 'error'); return; }
  const pi = currentPageIndex();
  const ext = mimeType.split('/')[1] || 'png';
  const path = 'images/' + uid() + '.' + ext;
  files.set(path, blob);
  const def = FIELD_TYPES['image'].defRect;
  const field = {
    id: uid('f'),
    type: 'image',
    rect: { x: 0.05, y: 0.05, w: def.w, h: def.h },
    points: 0,
    fontScale: 1,
    config: { src: path }
  };
  manifest.pages[pi].fields.push(field);
  markDirty();
  renderCanvas();
  selectField(pi, field.id);
  toast(t('toast.imgInserted'), 'ok');
}

async function handlePasteItems(items) {
  const imgItem = items.find(i => i.type.startsWith('image/'));
  if (imgItem) {
    const file = imgItem.getAsFile ? imgItem.getAsFile() : null;
    if (file) { await pasteImage(file, file.type || 'image/png'); return; }
  }
  const txtItem = items.find(i => i.type === 'text/plain');
  if (txtItem) {
    txtItem.getAsString(async str => {
      const text = str.trim();
      if (!text) { toast(t('toast.pasteEmpty'), 'error'); return; }
      await pasteText(text);
    });
    return;
  }
  toast(t('toast.pasteEmpty'), 'error');
}

document.addEventListener('paste', async e => {
  const inForm = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if (inForm) return;
  e.preventDefault();
  await handlePasteItems(Array.from(e.clipboardData?.items || []));
});

$('#btnPegar').addEventListener('click', async () => {
  try {
    const clipItems = await navigator.clipboard.read();
    for (const item of clipItems) {
      const imgType = item.types.find(tp => tp.startsWith('image/'));
      if (imgType) {
        const blob = await item.getType(imgType);
        await pasteImage(blob, imgType);
        return;
      }
    }
    for (const item of clipItems) {
      if (item.types.includes('text/plain')) {
        const blob = await item.getType('text/plain');
        const text = (await blob.text()).trim();
        if (text) { await pasteText(text); return; }
      }
    }
    toast(t('toast.pasteEmpty'), 'error');
  } catch {
    toast(t('toast.pasteUseCtrlV'), 'info');
  }
});

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
