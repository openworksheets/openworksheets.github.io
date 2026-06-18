// Editor de fichas (modo profesor).
//
// ÍNDICE DE SECCIONES (busca con Ctrl+F el título exacto para saltar):
//
//   Referencias al DOM ......... nodos cacheados ($, canvas, panel, paleta, título)
//   Zoom del lienzo ............ control de zoom y rueda Ctrl
//   Paleta ..................... acordeón de herramientas/grupos de campo
//   Páginas .................... añadir/borrar/mover/redimensionar/imprimir páginas
//   Lienzo ..................... render del canvas e interacción (dibujo, arrastre, rotación)
//   Campos ..................... crear/seleccionar/clonar/borrar/copiar-pegar campos
//   Panel lateral .............. paneles de configuración de campo/zona/forma (configForms)
//   Ajustes .................... diálogo de ajustes (fechas, cifrado)
//   Compartir .................. enlace para el alumno
//   Exportar / importar ........ ZIP de la ficha (exportar, abrir, fusionar)
//   Vista previa ............... previsualización como alumno
//   Arranque ................... wiring de eventos y render inicial
//   Pegar desde portapapeles ... texto/imagen/archivos pegados
//
// Estado mutable y helpers de UI viven fuera: editor-state.js y editor-ui.js.

import { el, uid, clamp, toast, downloadBlob, slugify, copyToClipboard, zoomControl } from './util.js';
import { FIELD_TYPES, PALETTE_GROUPS, fieldTypeName, gapCount, isShapeField } from './fieldtypes.js';
import { parseImsManifest } from './scorm.js';
import { FONT_OPTIONS, DEFAULT_FONT, fontStack } from './fonts.js';
import { buildShapeSvg, CHECKBOX_SVG, buildMediaContent, buildScormView } from './render.js';
import { scormSupported, registerScormSw, provisionScormPackage, releaseScormPackage, scormRunBase } from './scormhost.js';
import { mdToHtml } from './markdown.js';
import { expectedText } from './grading.js';
import { pdfToPages, imageToPage, isPdf, isImage } from './pdfimport.js';
import { exportFichaZip, importFichaZip, newManifest, usedFiles } from './zipio.js';
import { exportScormPackage } from './scormexport.js';
import { exportWebPackage } from './webexport.js';
import { exportImscpPackage } from './imscpexport.js';
import { buildShortLink, parseDriveId } from './drive.js';
import { mountPlayer } from './player.js';
import { t, getLang, applyI18n, initLangSelector } from './i18n.js';
import { ICONS } from './icons.js';
import { createSubmissionCrypto, decryptManifestForStudent, encryptManifestForStudent, isEncryptedManifest } from './submissionCrypto.js';
import { iconBtn, colorInput } from './editor-ui.js';
import { state, urls, fileUrl, markDirty, onDirty } from './editor-state.js';
import { takeFile } from './filehandoff.js';

applyI18n();
// En el editor no recargamos al cambiar de idioma (se perderían los cambios sin
// guardar): re-traducimos la interfaz en caliente conservando la ficha en curso.
initLangSelector({ reload: false, onChange: () => {
  applyI18n();
  renderPalette();
  renderCanvas();
  renderPanel();
} });

// ---------- Referencias al DOM ----------
// (el estado mutable vive en editor-state.js)

const $ = s => document.querySelector(s);
const canvas = $('#canvas');
const panel = $('#panel');
const palette = $('#palette');
const titleInput = $('#titulo');

// ---------- Archivo abierto ----------
// fileHandle: FileSystemFileHandle (Chrome/Edge) o null
// fileName:   nombre original del .owpkg abierto, para proponerlo al guardar
let openFileHandle = null;
let openFileName = null;

function clearOpenFile() { openFileHandle = null; openFileName = null; }

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
  if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- Paleta ----------

function renderPalette() {
  palette.textContent = '';
  PALETTE_GROUPS.forEach(group => {
    const gName = t('palette.' + group.id);
    const groupGlyph = el('span', { class: 'glyph' });
    groupGlyph.innerHTML = group.glyph;
    const head = el('button', { class: 'ed-group', type: 'button', title: gName },
      groupGlyph,
      el('span', { class: 'name' }, gName));
    head.dataset.group = group.id;
    head.addEventListener('click', () => {
      state.openGroup = state.openGroup === group.id ? null : group.id;
      // Navegar a un grupo cancela la herramienta activa y deselecciona el
      // campo actual: así el panel muestra siempre la descripción del grupo.
      state.activeTool = null;
      state.sel = null;
      refreshSelectionStyles();
      refreshPaletteState();
      renderPanel();
    });
    palette.appendChild(head);

    const tools = el('div', { class: 'ed-group-tools' });
    tools.dataset.group = group.id;
    const inner = el('div', { class: 'ed-group-tools-inner' });
    tools.appendChild(inner);
    group.types.forEach(type => {
      const ft = FIELD_TYPES[type];
      const name = fieldTypeName(type);
      const toolGlyph = el('span', { class: 'glyph' });
      toolGlyph.innerHTML = ft.glyph;
      const btn = el('button', { class: 'ed-tool', type: 'button', title: name },
        toolGlyph,
        el('span', { class: 'name' }, name));
      btn.addEventListener('click', () => {
        state.activeTool = state.activeTool === type ? null : type;
        if (state.activeTool) state.sel = null;
        state.pendingPieceZone = null;
        refreshPaletteState();
        renderPanel();
        if (state.activeTool && !state.manifest.pages.length) {
          toast(t('toast.addPdfFirst'), 'error');
          state.activeTool = null;
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
    b.classList.toggle('open', b.dataset.group === state.openGroup);
  });
  palette.querySelectorAll('.ed-group-tools').forEach(d => {
    d.classList.toggle('open', d.dataset.group === state.openGroup);
  });
  // Mientras se dibuja un hueco (gaps/textboxes) se resalta su entrada de paleta,
  // que es la unificada «Rellenar huecos» (fillgaps).
  const activeTool = (state.activeTool === 'gaps' || state.activeTool === 'textboxes')
    ? 'fillgaps' : state.activeTool;
  palette.querySelectorAll('.ed-tool').forEach(b => {
    b.classList.toggle('active', b.dataset.type === activeTool);
  });
  // «fillgaps» no dibuja: primero hay que elegir el modo en el panel.
  const drawing = Boolean(state.activeTool && state.activeTool !== 'fillgaps') || Boolean(state.pendingAmItem);
  canvas.classList.toggle('drawing', drawing);
}

// ---------- Páginas ----------

async function addFiles(fileList, insertAt) {
  const list = Array.from(fileList || []);
  if (!list.length) return;
  let idx = insertAt;
  for (const file of list) {
    try {
      if (isPdf(file)) {
        toast(t('toast.convertingPdf'));
        const pages = await pdfToPages(file, (n, total) => {
          toast(t('toast.convertingPage', { n, total }));
        });
        pages.forEach(p => { addPage(p, idx); if (idx != null) idx++; });
        toast(t('toast.pdfAdded', { n: pages.length, s: pages.length === 1 ? '' : 's' }), 'ok');
      } else if (isImage(file)) {
        addPage(await imageToPage(file), idx);
        if (idx != null) idx++;
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
  if (insertAt == null) { zoomCtl.set(1); autoThumbs(); } // al abrir un PDF/imágenes: zoom 100 % y tira según nº de páginas
  renderCanvas();
  renderPanel();
}

function addPage({ blob, ext, w, h }, insertAt) {
  const path = `pages/page-${state.pageSeq++}.${ext}`;
  state.files.set(path, blob);
  const page = { image: path, w, h, fields: [] };
  if (insertAt != null) state.manifest.pages.splice(insertAt, 0, page);
  else state.manifest.pages.push(page);
}

const PAGE_SIZES = [
  { key: 'a4p',  w: 1600, h: 2263 },
  { key: 'a4l',  w: 2263, h: 1600 },
  { key: 'ltrp', w: 1600, h: 2071 },
  { key: 'ltrl', w: 2071, h: 1600 },
];

function detectSizePreset(w, h) {
  const p = PAGE_SIZES.find(s => s.w === w && s.h === h);
  return p ? p.key : 'free';
}

function addBlankPage(insertAt) {
  const W = 1600, H = 2263; // A4 a ~192 dpi (igual que páginas PDF)
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx2d = cv.getContext('2d');
  ctx2d.fillStyle = '#ffffff';
  ctx2d.fillRect(0, 0, W, H);
  cv.toBlob(blob => {
    const path = `pages/page-${state.pageSeq++}.png`;
    state.files.set(path, blob);
    const page = { image: path, w: W, h: H, fields: [], bgColor: '#ffffff' };
    if (insertAt != null) state.manifest.pages.splice(insertAt, 0, page);
    else state.manifest.pages.push(page);
    markDirty(); renderCanvas(); renderPanel();
  }, 'image/png');
}

function recolorBlankPage(pi, color) {
  const page = state.manifest.pages[pi];
  if (!page?.bgColor) return;
  const W = page.w, H = page.h;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx2d = cv.getContext('2d');
  ctx2d.fillStyle = color;
  ctx2d.fillRect(0, 0, W, H);
  cv.toBlob(blob => {
    if (urls.has(page.image)) { URL.revokeObjectURL(urls.get(page.image)); urls.delete(page.image); }
    state.files.set(page.image, blob);
    page.bgColor = color;
    markDirty();
    const imgEl = canvas.querySelector(`.wpf-page[data-page="${pi}"] img.fondo`);
    if (imgEl) imgEl.src = fileUrl(page.image);
  }, 'image/png');
}

function resizePage(pi, w, h) {
  const page = state.manifest.pages[pi];
  if (!page?.bgColor) return;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx2d = cv.getContext('2d');
  ctx2d.fillStyle = page.bgColor;
  ctx2d.fillRect(0, 0, w, h);
  cv.toBlob(blob => {
    if (urls.has(page.image)) { URL.revokeObjectURL(urls.get(page.image)); urls.delete(page.image); }
    state.files.set(page.image, blob);
    page.w = w; page.h = h;
    markDirty();
    renderCanvas();
    state.sel = { kind: 'page', pageIndex: pi };
    renderPanel();
  }, 'image/png');
}

function printWorksheet() {
  if (!state.manifest.pages.length) { toast(t('toast.addPageFirst'), 'error'); return; }
  state.manifest.title = titleInput.value.trim();

  const overlay = el('div', { class: 'prev-overlay print-overlay' });
  const root = el('div', {});
  overlay.appendChild(root);
  document.body.appendChild(overlay);

  const printPlayer = mountPlayer(
    root,
    { manifest: JSON.parse(JSON.stringify(state.manifest)), files: state.files },
    { preview: true }
  );

  const style = document.createElement('style');
  style.textContent = `@media print {
    body > *:not(.print-overlay) { display: none !important; }
    .print-overlay {
      position: static !important;
      overflow: visible !important;
      background: white !important;
      background-image: none !important;
    }
    .al-cabecera, .al-barra, .al-instrucciones, .al-progreso { display: none !important; }
    .al-doc {
      padding: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
    }
    .al-doc .wpf-page {
      margin: 0 !important;
      break-after: page;
      page-break-after: always;
    }
    .al-doc .wpf-page:last-child { break-after: auto; page-break-after: auto; }
    @page { margin: 0; size: auto; }
  }`;
  document.head.appendChild(style);

  window.addEventListener('afterprint', function cleanup() {
    printPlayer.destroy();
    overlay.remove();
    style.remove();
  }, { once: true });

  setTimeout(() => window.print(), 600);
}

function makeAddPageBar(insertAt) {
  const between = insertAt != null;
  const cls = between ? 'ed-add-page-bar ed-add-page-bar--between' : 'ed-add-page-bar';
  const addBtn = el('button', { class: 'btn small', type: 'button' }, t('editor.addBlank'));
  addBtn.addEventListener('click', () => addBlankPage(insertAt));
  const pdfBtn = el('button', { class: 'btn small', type: 'button' }, t('editor.addPdf'));
  pdfBtn.addEventListener('click', () => {
    const input = $('#inputPaginas');
    const handler = e => { addFiles(e.target.files, insertAt); e.target.value = ''; input.removeEventListener('change', handler); };
    input.addEventListener('change', handler);
    input.click();
  });
  const zipBtn = el('button', { class: 'btn small', type: 'button' }, t('editor.addZip'));
  zipBtn.addEventListener('click', () => {
    const input = $('#inputZipMerge');
    const handler = e => { if (e.target.files[0]) mergeZipFile(e.target.files[0], insertAt); e.target.value = ''; input.removeEventListener('change', handler); };
    input.addEventListener('change', handler);
    input.click();
  });
  return el('div', { class: cls },
    el('span', { class: 'ed-add-page-label' }, t('editor.addPageLabel')),
    pdfBtn, zipBtn, addBtn);
}

// Elimina la página y su imagen de fondo, sin pedir confirmación.
function removePage(pi) {
  const page = state.manifest.pages[pi];
  state.files.delete(page.image);
  if (urls.has(page.image)) { URL.revokeObjectURL(urls.get(page.image)); urls.delete(page.image); }
  state.manifest.pages.splice(pi, 1);
  state.sel = null;
  markDirty();
  renderCanvas();
  renderPanel();
}

function deletePage(pi) {
  const page = state.manifest.pages[pi];
  const n = page.fields.length;
  const fields = n ? t('editor.confirmDeleteFields', { n }) : '';
  if (!window.confirm(t('editor.confirmDelete', { n: pi + 1, fields }))) return;
  removePage(pi);
}

function duplicatePage(pi) {
  const page = state.manifest.pages[pi];
  const blob = state.files.get(page.image);
  const ext = page.image.split('.').pop() || 'png';
  const newPath = `pages/page-${state.pageSeq++}.${ext}`;
  state.files.set(newPath, blob);
  const newPage = {
    ...JSON.parse(JSON.stringify(page)),
    image: newPath,
    fields: page.fields.map(f => cloneField(f))
  };
  state.manifest.pages.splice(pi + 1, 0, newPage);
  state.sel = { kind: 'page', pageIndex: pi + 1 };
  markDirty();
  renderCanvas();
  renderPanel();
}

function movePage(pi, delta) {
  const j = pi + delta;
  if (j < 0 || j >= state.manifest.pages.length) return;
  const [pg] = state.manifest.pages.splice(pi, 1);
  state.manifest.pages.splice(j, 0, pg);
  state.sel = null;
  markDirty();
  renderCanvas();
  renderPanel();
}

// ---------- Lienzo ----------

function renderCanvas() {
  canvas.textContent = '';
  // Fuente global de la ficha: se hereda en los campos (y en la previa del label).
  canvas.style.setProperty('--ficha-font', fontStack(state.manifest.settings.fontFamily));
  if (!state.manifest.pages.length) {
    canvas.appendChild(el('div', { class: 'ed-empty card anim-in' },
      el('h2', {}, t('editor.emptyTitle')),
      el('p', {}, t('editor.emptyDesc')),
      el('p', { class: 'ed-empty-alt' }, t('editor.emptyDesc2')),
      el('div', { style: 'display:flex;flex-direction:column;gap:10px;align-items:center' },
        el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center' },
          el('button', { class: 'btn', onclick: () => {
            const input = $('#inputPaginas');
            const handler = e => { addFiles(e.target.files); e.target.value = ''; input.removeEventListener('change', handler); };
            input.addEventListener('change', handler);
            input.click();
          } }, t('editor.addPdf')),
          el('button', { class: 'btn', onclick: () => $('#inputZip').click() }, t('editor.openZip'))),
        el('button', { class: 'btn', onclick: () => addBlankPage() }, t('editor.addBlank')))));
    return;
  }

  const btnPrevia = iconBtn(
    { id: 'btnPrevia', class: 'btn small ed-preview-btn', type: 'button', title: t('preview.tip') + ' (Ctrl+Shift+E)', onclick: openPreview },
    ICONS.eye, t('nav.preview'));
  canvas.appendChild(el('div', { class: 'ed-zoom-wrap' }, btnPrevia, zoomCtl.el));

  state.manifest.pages.forEach((page, pi) => {
    const pageEl = el('div', { class: 'wpf-page', dataset: { page: pi } },
      el('img', { class: 'fondo', src: fileUrl(page.image), alt: t('editor.pageN', { n: pi + 1, total: state.manifest.pages.length }), draggable: 'false' }));

    page.fields.forEach(field => {
      const decor = Boolean(FIELD_TYPES[field.type]?.decor);
      const box = el('div', { class: `ed-field ed-field-${field.type}`, dataset: { id: field.id } },
        el('span', { class: 'chip' }, decor ? fieldTypeName(field.type) : field.noScore ? `${fieldTypeName(field.type)} · —` : `${fieldTypeName(field.type)} · ${field.points} pt`),
        el('span', { class: 'handle' }));
      // Vista previa real de los elementos decorativos
      if (field.type === 'label') {
        const lp = el('div', {
          class: 'ed-label-prev',
          style: `color:${field.config.color || 'inherit'};font-weight:${field.config.bold ? '700' : '400'};text-align:${field.config.align || 'left'}`
        });
        lp.innerHTML = mdToHtml(field.config.text || '');
        box.appendChild(lp);
      } else if (field.type === 'cover') {
        box.style.background = field.config.color || '#ffffff';
      } else if (field.type === 'image' && field.config?.src && state.files.has(field.config.src)) {
        box.appendChild(el('img', { src: fileUrl(field.config.src), class: 'ed-img-prev', alt: '' }));
      } else if (field.type === 'video' || field.type === 'audio' || field.type === 'embed') {
        // Se muestra el contenido real, pero con pointer-events:none (vía CSS) y
        // sin autorreproducir, para poder mover y redimensionar el campo encima.
        box.classList.add('ed-media-field');
        box.appendChild(buildMediaContent(field, fileUrl, { editor: true, host: editorPkgHost() }));
      } else if (field.type === 'scorm') {
        box.classList.add('ed-scorm-field');
        const cfg = field.config || {};
        const sctx = editorPkgHost();
        if (cfg.pkg && cfg.entryHref && sctx.supported) {
          // Vista en vivo del paquete (sin interacción: pointer-events:none vía CSS).
          box.classList.add('ed-media-field');
          box.appendChild(buildScormView(field, sctx).el);
        } else {
          const icon = el('div', { class: 'ed-scorm-icon' });
          icon.innerHTML = ICONS.package;
          const prev = el('div', { class: 'ed-scorm-prev' + ((parseFloat(cfg.frameWidth) || 0) > 0 ? ' has-frame' : '') },
            icon,
            el('div', { class: 'ed-scorm-title' }, cfg.title || t('editor.scormNoPkg')));
          prev.style.setProperty('--media-frame-width', `${Math.max(0, parseFloat(cfg.frameWidth) || 0)}px`);
          prev.style.setProperty('--media-frame-color', cfg.frameColor || '#1d2c42');
          box.appendChild(prev);
        }
      } else if (field.type === 'record') {
        box.classList.add('ed-record-field');
        const icon = el('span', { class: 'ed-record-icon' });
        icon.innerHTML = ICONS.mic;
        box.appendChild(el('div', { class: 'ed-record-prev' },
          icon,
          el('div', { class: 'ed-record-prev-txt' }, field.config?.prompt || t('cfg.recordPromptPlaceholder'))));
      } else if (isShapeField(field.type)) {
        box.appendChild(buildShapeSvg(field));
      }
      if (field.type === 'image' || field.type === 'label' || field.type === 'cover' || isShapeField(field.type)) {
        const rotHandle = el('span', { class: 'rot-handle', title: t('editor.rotate') });
        box.appendChild(rotHandle);
        if (field.rotate) box.style.transform = `rotate(${field.rotate}deg)`;
        attachRotateHandle(rotHandle, box, field);
      }
      setRectStyle(box, field.rect);
      box.style.setProperty('--fs', field.fontScale || 1);
      if (field.fontFamily) box.style.setProperty('--field-font', fontStack(field.fontFamily));
      if (field.config?.fgColor) box.style.setProperty('--field-fg', field.config.fgColor);
      // En modo hotspot (arrowmatch con áreas definidas), el campo principal no se arrastra:
      // las posiciones las gestionan los overlays de items.
      const isAmHotspot = field.type === 'arrowmatch' && (field.config.items || []).some(i => i.rect);
      if (isAmHotspot) {
        box.classList.add('ed-am-hotspot-field');
        box.addEventListener('pointerdown', e => {
          if (state.activeTool || state.pendingAmItem) return;
          e.stopPropagation();
          selectField(pi, field.id);
        });
      } else if (field.type === 'checkbox') {
        // Las casillas se gestionan como overlays propios; el campo no se arrastra.
        box.classList.add('ed-cb-hostfield');
        box.addEventListener('pointerdown', e => {
          if (state.activeTool || state.pendingAmItem) return;
          e.stopPropagation();
          selectField(pi, field.id);
        });
      } else if (field.type === 'textboxes') {
        // Los huecos se gestionan como overlays propios; el campo no se arrastra.
        box.classList.add('ed-cb-hostfield');
        box.addEventListener('pointerdown', e => {
          if (state.activeTool || state.pendingAmItem) return;
          e.stopPropagation();
          selectField(pi, field.id);
        });
      } else if (field.type === 'dragdrop' && field.config.mode === 'crops') {
        // En modo recorte la «bandeja» no se usa (las piezas parten del PDF y van
        // a las zonas): el recuadro principal se oculta y no es interactivo. El
        // campo sigue accesible desde la lista de campos y desde «volver al campo».
        box.classList.add('ed-dd-crops-host');
      } else {
        attachBoxInteraction(box, pageEl, field.rect, {
          onSelect: () => selectField(pi, field.id),
          isSelected: () => state.sel?.kind === 'field' && state.sel.fieldId === field.id
        });
      }
      pageEl.appendChild(box);

      if (field.type === 'dragdrop') {
        const crops = field.config.mode === 'crops';
        (field.config.zones || []).forEach((zone, zi) => {
          const zChipText = crops
            ? zoneDisplayName(zone, zi)
            : (Array.isArray(zone.answers) && zone.answers.length
              ? firstAnswerLabel(zone.answers) : (zone.answer || 'zona'));
          const zEl = el('div', { class: 'ed-zone', dataset: { id: zone.id } },
            el('span', { class: 'chip' }, zChipText),
            el('span', { class: 'handle' }));
          setRectStyle(zEl, zone.rect);
          attachBoxInteraction(zEl, pageEl, zone.rect, {
            onSelect: () => selectZone(pi, field.id, zone.id),
            isSelected: () => state.sel?.kind === 'zone' && state.sel.zoneId === zone.id
          });
          pageEl.appendChild(zEl);
        });
        if (crops) {
          (field.config.pieces || []).forEach(piece => {
            const pEl = el('div', { class: 'ed-piece', dataset: { id: piece.id } },
              state.files.has(piece.src)
                ? el('img', { class: 'ed-piece-img', src: fileUrl(piece.src), alt: '', draggable: 'false' })
                : null,
              el('span', { class: 'handle' }));
            setRectStyle(pEl, piece.rect);
            attachBoxInteraction(pEl, pageEl, piece.rect, {
              onSelect: () => selectPiece(pi, field.id, piece.id),
              isSelected: () => state.sel?.kind === 'piece' && state.sel.pieceId === piece.id,
              onChange: () => recropPiece(pi, field.id, piece.id)
            });
            pageEl.appendChild(pEl);
          });
        }
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
            isSelected: () => state.sel?.kind === 'amitem' && state.sel.amItemId === item.id
          });
          pageEl.appendChild(aEl);
        });
      }

      if (field.type === 'checkbox') {
        const correctIds = field.config.correct || [];
        (field.config.boxes || []).forEach(b => {
          const cbEl = el('div', {
            class: 'ed-cbbox' + (correctIds.includes(b.id) ? ' correct' : ''),
            dataset: { id: b.id }
          });
          cbEl.innerHTML = CHECKBOX_SVG;
          cbEl.appendChild(el('span', { class: 'handle' }));
          setRectStyle(cbEl, b.rect);
          attachBoxInteraction(cbEl, pageEl, b.rect, {
            onSelect: () => selectCbBox(pi, field.id, b.id),
            isSelected: () => state.sel?.kind === 'cbbox' && state.sel.cbBoxId === b.id
          });
          pageEl.appendChild(cbEl);
        });
      }

      if (field.type === 'textboxes') {
        (field.config.boxes || []).forEach(b => {
          const ans = (b.answers || []).find(a => a && a.trim());
          const tbEl = el('div', { class: 'ed-tbbox', dataset: { id: b.id } },
            el('span', { class: 'chip' }, ans || '—'),
            el('span', { class: 'handle' }));
          setRectStyle(tbEl, b.rect);
          attachBoxInteraction(tbEl, pageEl, b.rect, {
            onSelect: () => selectTbBox(pi, field.id, b.id),
            isSelected: () => state.sel?.kind === 'tbbox' && state.sel.tbBoxId === b.id
          });
          pageEl.appendChild(tbEl);
        });
      }
    });

    attachDrawInteraction(pageEl, pi);

    const head = el('div', { class: 'ed-pagehead' },
      el('span', {}, t('editor.pageN', { n: pi + 1, total: state.manifest.pages.length })),
      el('span', { class: 'spacer' }),
      iconBtn({ class: 'btn small ghost', title: t('editor.moveUp'), onclick: () => movePage(pi, -1), disabled: pi === 0 ? '' : null }, ICONS.chevronUp),
      iconBtn({ class: 'btn small ghost', title: t('editor.moveDown'), onclick: () => movePage(pi, 1), disabled: pi === state.manifest.pages.length - 1 ? '' : null }, ICONS.chevronDown2),
      iconBtn({ class: 'btn small ghost danger', title: t('editor.deletePage'), onclick: () => deletePage(pi) }, ICONS.trash));

    canvas.appendChild(el('div', { class: 'ed-pagebox' }, head, pageEl));
    if (pi < state.manifest.pages.length - 1) canvas.appendChild(makeAddPageBar(pi + 1));
  });
  canvas.appendChild(makeAddPageBar(null));
  refreshSelectionStyles();
  renderThumbs();
}

// ---------- Tira de miniaturas de páginas ----------

const thumbsList = $('#thumbsList');
let thumbDragFrom = null;

// Reordena una página de un índice a otro (usado por el arrastre de miniaturas).
function reorderPage(from, to) {
  if (from === to || from < 0 || to < 0 ||
      from >= state.manifest.pages.length || to >= state.manifest.pages.length) return;
  const [pg] = state.manifest.pages.splice(from, 1);
  state.manifest.pages.splice(to, 0, pg);
  state.sel = null;
  markDirty();
  renderCanvas();
  renderPanel();
}

function renderThumbs() {
  thumbsList.textContent = '';
  state.manifest.pages.forEach((page, pi) => {
    const frame = el('div', { class: 'ed-thumb-frame' },
      el('img', { src: fileUrl(page.image), alt: '', draggable: 'false' }));
    const thumb = el('div', {
      class: 'ed-thumb', draggable: 'true', tabindex: '0', dataset: { page: pi },
      title: t('editor.pageN', { n: pi + 1, total: state.manifest.pages.length })
    }, el('span', { class: 'ed-thumb-num' }, String(pi + 1)), frame);

    thumb.addEventListener('click', () => {
      canvas.querySelector(`.wpf-page[data-page="${pi}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Menú contextual (clic derecho): copiar, cortar, pegar, duplicar, borrar.
    thumb.addEventListener('contextmenu', e => {
      e.preventDefault();
      showPageCtxMenu(e.clientX, e.clientY, pi);
    });

    // Arrastrar para reordenar
    thumb.addEventListener('dragstart', e => {
      thumbDragFrom = pi;
      thumb.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    thumb.addEventListener('dragend', () => {
      thumbDragFrom = null;
      thumbsList.querySelectorAll('.ed-thumb').forEach(t => t.classList.remove('dragging', 'drag-over'));
    });
    thumb.addEventListener('dragover', e => {
      if (thumbDragFrom === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    thumb.addEventListener('dragenter', () => {
      if (thumbDragFrom !== null && thumbDragFrom !== pi) thumb.classList.add('drag-over');
    });
    thumb.addEventListener('dragleave', () => thumb.classList.remove('drag-over'));
    thumb.addEventListener('drop', e => {
      e.preventDefault();
      if (thumbDragFrom !== null) reorderPage(thumbDragFrom, pi);
    });

    thumbsList.appendChild(thumb);
  });
  highlightActiveThumb();
}

// Marca la miniatura de la página más visible en el lienzo.
function highlightActiveThumb() {
  const idx = currentPageIndex();
  thumbsList.querySelectorAll('.ed-thumb').forEach(thumb => {
    thumb.classList.toggle('active', parseInt(thumb.dataset.page, 10) === idx);
  });
}

// Colapso de la tira, persistente en localStorage.
const edLayout = $('.ed-layout');
const btnThumbsToggle = $('#btnThumbsToggle');
const btnThumbsShow = $('#btnThumbsShow');
btnThumbsToggle.innerHTML = ICONS.chevronLeft;
btnThumbsShow.innerHTML = ICONS.chevronRight;

// El colapso de la tira no se guarda: lo que el usuario cambie a mano dura solo
// hasta que abra otra ficha. Al abrir/cargar una ficha se decide según el número
// de páginas (autoThumbs): visible con más de una, oculta con una sola.
function setThumbsCollapsed(collapsed) {
  edLayout.classList.toggle('thumbs-collapsed', collapsed);
}
function autoThumbs() {
  setThumbsCollapsed(state.manifest.pages.length <= 1);
}
btnThumbsToggle.addEventListener('click', () => setThumbsCollapsed(true));
btnThumbsShow.addEventListener('click', () => setThumbsCollapsed(false));
autoThumbs();

// Resaltar la miniatura activa al desplazar el lienzo.
canvas.addEventListener('scroll', () => {
  if (renderThumbs._raf) return;
  renderThumbs._raf = requestAnimationFrame(() => {
    renderThumbs._raf = null;
    highlightActiveThumb();
  });
}, { passive: true });

// ---------- Divisores de columnas (anchura ajustable, no persistente) ----------
// Arrastrar los divisores cambia --thumbs-w (tira) y --panel-w (panel de
// configuración). No se guarda: cada sesión empieza con los anchos por defecto.
const thumbsAside = $('#thumbs');

function setupGutter(gutter, onMove) {
  gutter.addEventListener('pointerdown', e => {
    e.preventDefault();
    gutter.setPointerCapture(e.pointerId);
    gutter.classList.add('active');
    edLayout.classList.add('resizing');
    document.body.classList.add('resizing-col');
    const move = ev => onMove(ev);
    const up = () => {
      gutter.releasePointerCapture(e.pointerId);
      gutter.classList.remove('active');
      edLayout.classList.remove('resizing');
      document.body.classList.remove('resizing-col');
      gutter.removeEventListener('pointermove', move);
      gutter.removeEventListener('pointerup', up);
    };
    gutter.addEventListener('pointermove', move);
    gutter.addEventListener('pointerup', up);
  });
}

setupGutter($('#gutterThumbs'), e => {
  const left = thumbsAside.getBoundingClientRect().left;
  const w = Math.max(110, Math.min(420, e.clientX - left));
  edLayout.style.setProperty('--thumbs-w', w + 'px');
});

setupGutter($('#gutterPanel'), e => {
  const right = edLayout.getBoundingClientRect().right;
  const w = Math.max(260, Math.min(620, right - e.clientX));
  edLayout.style.setProperty('--panel-w', w + 'px');
});

// ---------- Copiar / cortar / pegar / duplicar páginas ----------
// El portapapeles de páginas es interno a esta pestaña: se guarda una copia del
// objeto de la página y de sus blobs (para que sobreviva aunque se corte la
// página original). No se comparte entre pestañas ni ventanas.
let internalPageClip = null; // { page, files: Map<ruta, Blob> }

// Rutas de todos los archivos (state.files) que usa una página.
function collectPageFiles(page) {
  const paths = new Set();
  if (page.image) paths.add(page.image);
  for (const f of page.fields || []) {
    const c = f.config || {};
    if (c.src) paths.add(c.src);
    if (Array.isArray(c.pieces)) c.pieces.forEach(p => p.src && paths.add(p.src));
    if (Array.isArray(c.items)) c.items.forEach(it => it.src && paths.add(it.src));
    if (c.pkg) for (const path of state.files.keys()) {
      if (path.startsWith(c.pkg)) paths.add(path);
    }
  }
  return paths;
}

function copyPage(pi, { cut = false } = {}) {
  const page = state.manifest.pages[pi];
  const files = new Map();
  for (const path of collectPageFiles(page)) {
    const blob = state.files.get(path);
    if (blob) files.set(path, blob);
  }
  internalPageClip = { page: JSON.parse(JSON.stringify(page)), files };
  if (cut) removePage(pi);
  toast(t(cut ? 'toast.pageCut' : 'toast.pageCopied'), 'ok');
}

function pastePageAt(insertAt) {
  if (!internalPageClip) { toast(t('toast.pasteEmpty'), 'error'); return; }
  const { page: src, files } = internalPageClip;
  // Restaurar los blobs que falten (p. ej. si la página se cortó y se borró su
  // imagen de fondo de state.files).
  for (const [path, blob] of files) {
    if (!state.files.has(path)) state.files.set(path, blob);
  }
  // Imagen de fondo: copia con ruta nueva.
  const ext = (src.image || '').split('.').pop() || 'png';
  const newImage = `pages/page-${state.pageSeq++}.${ext}`;
  if (state.files.has(src.image)) state.files.set(newImage, state.files.get(src.image));
  // Clonar la página (cloneField regenera ids y recopia recortes).
  const newPage = {
    ...JSON.parse(JSON.stringify(src)),
    image: newImage,
    fields: (src.fields || []).map(f => cloneField(f))
  };
  // Re-empaquetar paquetes (SCORM/zip/…) con prefijo nuevo.
  for (const f of newPage.fields) {
    const c = f.config || {};
    if (!c.pkg) continue;
    const inside = [...state.files.keys()].filter(p => p.startsWith(c.pkg));
    if (!inside.length) continue;
    const base = c.pkg.split('/')[0];
    const newPre = base + '/' + uid('pkg') + '/';
    inside.forEach(path => state.files.set(newPre + path.slice(c.pkg.length), state.files.get(path)));
    c.pkg = newPre;
  }
  const at = Math.max(0, Math.min(insertAt, state.manifest.pages.length));
  state.manifest.pages.splice(at, 0, newPage);
  state.sel = { kind: 'page', pageIndex: at };
  markDirty();
  renderCanvas();
  renderPanel();
  toast(t('toast.pagePasted'), 'ok');
}

// ---------- Menú contextual genérico ----------
let ctxMenuEl = null;

function closeCtxMenu() {
  if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; }
  document.removeEventListener('mousedown', onCtxOutside, true);
  document.removeEventListener('keydown', onCtxKey, true);
  window.removeEventListener('blur', closeCtxMenu);
}
function onCtxKey(e) { if (e.key === 'Escape') closeCtxMenu(); }
// Cierra al pulsar fuera del menú (los clics dentro los gestiona cada opción).
function onCtxOutside(e) {
  if (ctxMenuEl && !ctxMenuEl.contains(e.target)) closeCtxMenu();
}

// items: array de { icon, label, fn, danger, disabled } o 'sep' para un separador.
function showCtxMenu(x, y, items) {
  closeCtxMenu();
  const menu = el('div', { class: 'ctx-menu' });
  for (const item of items) {
    if (item === 'sep') { menu.appendChild(el('div', { class: 'ctx-sep' })); continue; }
    const ic = el('span', { class: 'ctx-icon', 'aria-hidden': 'true' });
    ic.innerHTML = item.icon || '';
    const b = el('button', { class: 'ctx-item' + (item.danger ? ' danger' : ''), type: 'button' },
      ic, el('span', {}, item.label));
    if (item.disabled) b.disabled = true;
    else b.addEventListener('click', () => { closeCtxMenu(); item.fn(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  ctxMenuEl = menu;
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
  document.addEventListener('mousedown', onCtxOutside, true);
  document.addEventListener('keydown', onCtxKey, true);
  window.addEventListener('blur', closeCtxMenu);
}

function showPageCtxMenu(x, y, pi) {
  showCtxMenu(x, y, [
    { icon: ICONS.copy, label: t('ctx.copy'), fn: () => copyPage(pi) },
    { icon: ICONS.scissors, label: t('ctx.cut'), fn: () => copyPage(pi, { cut: true }) },
    { icon: ICONS.clipboard, label: t('ctx.paste'), fn: () => pastePageAt(pi + 1) },
    { icon: ICONS.copyPlus, label: t('ctx.duplicate'), fn: () => duplicatePage(pi) },
    'sep',
    { icon: ICONS.settings, label: t('menu.settings'), fn: () => openSettings() },
    { icon: ICONS.trash, label: t('ctx.delete'), fn: () => deletePage(pi), danger: true }
  ]);
}

// Menú contextual del lienzo: sobre un campo (copiar/cortar/duplicar/pegar/
// eliminar) o sobre el fondo de la página (pegar campo).
canvas.addEventListener('contextmenu', e => {
  const pageEl = e.target.closest?.('.wpf-page');
  if (!pageEl) {
    // Área del lienzo a los lados de las páginas: acciones globales del documento.
    e.preventDefault();
    showCtxMenu(e.clientX, e.clientY, [
      { icon: ICONS.clipboard, label: t('ctx.paste'), fn: () => pastePageAt(state.manifest.pages.length), disabled: !internalPageClip },
      { icon: ICONS.filePlus, label: t('editor.addBlank'), fn: () => addBlankPage() },
      'sep',
      { icon: ICONS.settings, label: t('menu.settings'), fn: () => openSettings() }
    ]);
    return;
  }
  const pi = parseInt(pageEl.dataset.page, 10);
  const fieldEl = e.target.closest?.('.ed-field');
  e.preventDefault();
  if (fieldEl) {
    selectField(pi, fieldEl.dataset.id);
    showCtxMenu(e.clientX, e.clientY, [
      { icon: ICONS.copy, label: t('editor.copy'), fn: copySelected },
      { icon: ICONS.scissors, label: t('editor.cut'), fn: () => { copySelected(); deleteSelected(); } },
      { icon: ICONS.copyPlus, label: t('editor.duplicate'), fn: duplicateSelected },
      { icon: ICONS.clipboard, label: t('editor.paste'), fn: () => pasteField(pi), disabled: !state.copiedField },
      'sep',
      { icon: ICONS.settings, label: t('menu.settings'), fn: () => openSettings() },
      { icon: ICONS.trash, label: t('editor.delete'), fn: deleteSelected, danger: true }
    ]);
  } else {
    showCtxMenu(e.clientX, e.clientY, [
      { icon: ICONS.clipboard, label: t('editor.paste'), fn: () => pasteField(pi), disabled: !state.copiedField },
      'sep',
      { icon: ICONS.copyPlus, label: t('ctx.duplicate'), fn: () => duplicatePage(pi) },
      { icon: ICONS.settings, label: t('menu.settings'), fn: () => openSettings() },
      { icon: ICONS.trash, label: t('ctx.delete'), fn: () => deletePage(pi), danger: true }
    ]);
  }
});

function setRectStyle(node, rect) {
  node.style.left = rect.x * 100 + '%';
  node.style.top = rect.y * 100 + '%';
  node.style.width = rect.w * 100 + '%';
  node.style.height = rect.h * 100 + '%';
}

// Añade al panel controles para fijar la anchura y la altura exactas (en % de
// la página) de un rectángulo: el del propio campo o el de un subelemento
// (casilla, hueco, zona, item). nodeId = data-id del elemento en el lienzo.
function appendSizeSection(cont, rect, nodeId, onAfter) {
  const section = el('div', { class: 'ed-section' });
  section.appendChild(el('div', { class: 'ed-section-title' }, t('editor.sizeSection')));
  const body = el('div', { class: 'ed-section-body ed-size-grid' });
  const mk = (dim, posDim) => {
    const inp = el('input', { type: 'number', min: '0.1', max: '100', step: '0.01',
      value: (rect[dim] * 100).toFixed(2) });
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value.replace(',', '.'));
      if (isNaN(v)) return;
      rect[dim] = clamp(v / 100, 0.001, 1 - rect[posDim]);
      const node = canvas.querySelector(`[data-id="${nodeId}"]`);
      if (node) setRectStyle(node, rect);
      markDirty();
      if (onAfter) onAfter();
    });
    // Al salir del campo, normaliza el valor mostrado al real (tras el recorte).
    inp.addEventListener('change', () => { inp.value = (rect[dim] * 100).toFixed(2); });
    return inp;
  };
  body.appendChild(el('label', { class: 'f-label' }, t('editor.width')));
  body.appendChild(mk('w', 'x'));
  body.appendChild(el('label', { class: 'f-label' }, t('editor.height')));
  body.appendChild(mk('h', 'y'));
  section.appendChild(body);
  cont.appendChild(section);
}

function refreshSelectionStyles() {
  canvas.querySelectorAll('.ed-field, .ed-zone, .ed-piece, .ed-amitem, .ed-cbbox, .ed-tbbox').forEach(n => n.classList.remove('selected'));
  if (!state.sel) return;
  const id = state.sel.kind === 'zone' ? state.sel.zoneId
    : state.sel.kind === 'piece' ? state.sel.pieceId
    : state.sel.kind === 'amitem' ? state.sel.amItemId
    : state.sel.kind === 'cbbox' ? state.sel.cbBoxId
    : state.sel.kind === 'tbbox' ? state.sel.tbBoxId
    : state.sel.fieldId;
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
function attachBoxInteraction(box, pageEl, rect, { onSelect, isSelected, onChange }) {
  box.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; // solo botón izquierdo (el derecho abre el menú contextual)
    if (state.activeTool || state.pendingAmItem) return; // en modo dibujo, la página gestiona el evento
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
      if (moved) { markDirty(); if (onChange) onChange(); }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

// Handle de rotación para elementos decorativos (image, label).
function attachRotateHandle(rotHandle, box, field) {
  rotHandle.addEventListener('pointerdown', e => {
    if (state.activeTool) return;
    e.stopPropagation();
    e.preventDefault();
    rotHandle.setPointerCapture(e.pointerId);
    const br = box.getBoundingClientRect();
    const cx = (br.left + br.right) / 2;
    const cy = (br.top + br.bottom) / 2;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90;
    const startRotate = field.rotate || 0;
    const offset = startRotate - startAngle;
    function onMove(ev) {
      const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90;
      const deg = Math.round(((angle + offset) % 360 + 360) % 360);
      field.rotate = deg;
      box.style.transform = deg ? `rotate(${deg}deg)` : '';
      const inp = panel.querySelector('.rot-input');
      if (inp) inp.value = deg;
      markDirty();
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

// Dibujar un campo nuevo (o una zona) sobre la página.
function attachDrawInteraction(pageEl, pi) {
  pageEl.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; // solo botón izquierdo (el derecho abre el menú contextual)
    // «Rellenar huecos» aún no es una herramienta de dibujo: hay que elegir el
    // modo en el panel. No hace nada al pulsar sobre la página.
    if (state.activeTool === 'fillgaps') return;
    if (!state.activeTool && !state.pendingAmItem) {
      // Clic en el fondo: seleccionar la página para mostrar sus propiedades.
      if (e.target === pageEl) {
        state.sel = { kind: 'page', pageIndex: pi };
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

      if (state.pendingAmItem) {
        const item = state.pendingAmItem;
        const nextItem = state.pendingAmNext;
        state.pendingAmItem = null;
        state.pendingAmNext = null;
        if (r.w < 0.02 || r.h < 0.015) r = { x: clamp(x0 - 0.06, 0, 0.88), y: clamp(y0 - 0.025, 0, 0.95), w: 0.12, h: 0.05 };
        item.rect = r;
        markDirty();
        const fieldId = state.sel?.fieldId || getFieldIdForItem(pi, item.id);
        renderCanvas();
        selectField(pi, fieldId);
        if (nextItem && !nextItem.rect) {
          state.pendingAmItem = nextItem;
          refreshPaletteState();
          toast(t('toast.amDrawAreaTip'), 'info');
        } else {
          refreshPaletteState();
        }
        return;
      }

      const tool = state.activeTool;
      state.activeTool = null;
      refreshPaletteState();
      if (tool === 'zone') {
        if (r.w < 0.02 || r.h < 0.015) r = { x: clamp(x0 - 0.06, 0, 0.88), y: clamp(y0 - 0.025, 0, 0.95), w: 0.12, h: 0.05 };
        createZone(pi, r);
      } else if (tool === 'cbbox') {
        const def = FIELD_TYPES.checkbox.defRect;
        if (r.w < 0.02 || r.h < 0.015) {
          r = { x: clamp(x0 - def.w / 2, 0, 1 - def.w), y: clamp(y0 - def.h / 2, 0, 1 - def.h), w: def.w, h: def.h };
        }
        createCbBox(pi, r);
      } else if (tool === 'tbbox') {
        const def = FIELD_TYPES.textboxes.defRect;
        if (r.w < 0.02 || r.h < 0.015) {
          r = { x: clamp(x0 - def.w / 2, 0, 1 - def.w), y: clamp(y0 - def.h / 2, 0, 1 - def.h), w: def.w, h: def.h };
        }
        createTbBox(pi, r);
      } else if (tool === 'piece') {
        if (r.w < 0.015 || r.h < 0.01) { toast(t('toast.pieceTooSmall'), 'error'); renderCanvas(); return; }
        createPiece(pi, r);
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
  const page = state.manifest.pages[pi];
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
  state.manifest.pages[pi].fields.push(field);
  // El campo de casillas nace con su primera casilla en el rectángulo dibujado.
  if (type === 'checkbox') {
    const box = { id: uid('cb'), rect: { ...rect } };
    field.config.boxes.push(box);
    markDirty();
    renderCanvas();
    selectCbBox(pi, field.id, box.id);
    return;
  }
  // El campo de huecos nace con su primer hueco en el rectángulo dibujado.
  if (type === 'textboxes') {
    const box = { id: uid('tb'), rect: { ...rect }, answers: [''] };
    field.config.boxes.push(box);
    markDirty();
    renderCanvas();
    selectTbBox(pi, field.id, box.id);
    return;
  }
  markDirty();
  renderCanvas();
  selectField(pi, field.id);
}

// Añade una nueva casilla al campo checkbox seleccionado (modo dibujo).
function createCbBox(pi, rect) {
  const field = state.sel ? getField(state.sel.pageIndex, state.sel.fieldId) : null;
  if (!field || field.type !== 'checkbox' || state.sel.pageIndex !== pi) {
    toast(t('toast.selectCheckboxFirst'), 'error');
    renderCanvas();
    return;
  }
  const box = { id: uid('cb'), rect };
  field.config.boxes.push(box);
  markDirty();
  renderCanvas();
  selectCbBox(pi, field.id, box.id);
}

// Añade un nuevo hueco al campo de huecos seleccionado (modo dibujo).
function createTbBox(pi, rect) {
  const field = state.sel ? getField(state.sel.pageIndex, state.sel.fieldId) : null;
  if (!field || field.type !== 'textboxes' || state.sel.pageIndex !== pi) {
    toast(t('toast.selectTextboxFirst'), 'error');
    renderCanvas();
    return;
  }
  const box = { id: uid('tb'), rect, answers: [''] };
  field.config.boxes.push(box);
  markDirty();
  renderCanvas();
  selectTbBox(pi, field.id, box.id);
}

// Activa la herramienta de dibujo de zona (flujo continuo desde el panel).
function startZoneTool() {
  state.activeTool = 'zone';
  refreshPaletteState();
  canvas.classList.add('drawing');
  toast(t('toast.drawZoneTip'));
}

// Activa la herramienta de dibujo de hueco (flujo continuo desde el panel).
function startTbBoxTool() {
  state.activeTool = 'tbbox';
  refreshPaletteState();
  canvas.classList.add('drawing');
  toast(t('toast.drawTextboxTip'));
}

function createZone(pi, rect) {
  const field = state.sel ? getField(state.sel.pageIndex, state.sel.fieldId) : null;
  if (!field || field.type !== 'dragdrop' || state.sel.pageIndex !== pi) {
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

// Carga la imagen de fondo de una página y recorta la región indicada
// (en fracciones de página) devolviendo un blob PNG.
function loadImageEl(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

async function cropPageRegion(pi, rect) {
  const page = state.manifest.pages[pi];
  if (!page) return null;
  const img = await loadImageEl(fileUrl(page.image));
  const sx = Math.round(rect.x * img.naturalWidth);
  const sy = Math.round(rect.y * img.naturalHeight);
  const sw = Math.max(1, Math.round(rect.w * img.naturalWidth));
  const sh = Math.max(1, Math.round(rect.h * img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return await new Promise(res => c.toBlob(res, 'image/png'));
}

// Marca un recorte del PDF como pieza arrastrable (modo "crops" de dragdrop).
async function createPiece(pi, rect) {
  const field = state.sel ? getField(state.sel.pageIndex, state.sel.fieldId) : null;
  if (!field || field.type !== 'dragdrop' || field.config.mode !== 'crops' || state.sel.pageIndex !== pi) {
    toast(t('toast.selectDragFirst'), 'error');
    renderCanvas();
    return;
  }
  const blob = await cropPageRegion(pi, rect);
  if (!blob) { renderCanvas(); return; }
  const path = 'dtokens/' + uid() + '.png';
  state.files.set(path, blob);
  if (!Array.isArray(field.config.pieces)) field.config.pieces = [];
  // La pieza se recorta desde el panel de una zona y queda asignada a ella.
  const targetZone = state.pendingPieceZone || '';
  state.pendingPieceZone = null;
  const piece = { id: uid('p'), src: path, rect, zoneId: targetZone };
  field.config.pieces.push(piece);
  markDirty();
  renderCanvas();
  if (targetZone && field.config.zones.some(z => z.id === targetZone)) {
    selectZone(pi, field.id, targetZone); // seguir en el panel de la zona
  } else {
    selectPiece(pi, field.id, piece.id);
  }
}

// Vuelve a recortar la imagen de una pieza tras moverla o redimensionarla.
async function recropPiece(pi, fieldId, pieceId) {
  const field = getField(pi, fieldId);
  const piece = (field?.config.pieces || []).find(p => p.id === pieceId);
  if (!piece) return;
  const blob = await cropPageRegion(pi, piece.rect);
  if (!blob) return;
  urls.delete(piece.src);
  state.files.set(piece.src, blob);
  markDirty();
  renderCanvas();
}

function getField(pi, fieldId) {
  return state.manifest.pages[pi]?.fields.find(f => f.id === fieldId) || null;
}

function selectField(pi, fieldId) {
  state.sel = { kind: 'field', pageIndex: pi, fieldId };
  refreshSelectionStyles();
  renderPanel();
}

function selectZone(pi, fieldId, zoneId) {
  state.sel = { kind: 'zone', pageIndex: pi, fieldId, zoneId };
  refreshSelectionStyles();
  renderPanel();
}

function selectAmItem(pi, fieldId, amItemId) {
  state.sel = { kind: 'amitem', pageIndex: pi, fieldId, amItemId };
  refreshSelectionStyles();
  renderPanel(); // muestra el panel del campo (pairs list)
}

function selectPiece(pi, fieldId, pieceId) {
  state.sel = { kind: 'piece', pageIndex: pi, fieldId, pieceId };
  refreshSelectionStyles();
  renderPanel(); // muestra el panel del campo (lista de piezas)
}

function selectCbBox(pi, fieldId, cbBoxId) {
  state.sel = { kind: 'cbbox', pageIndex: pi, fieldId, cbBoxId };
  refreshSelectionStyles();
  renderPanel(); // muestra el panel del campo (lista de casillas)
}

function selectTbBox(pi, fieldId, tbBoxId) {
  state.sel = { kind: 'tbbox', pageIndex: pi, fieldId, tbBoxId };
  refreshSelectionStyles();
  renderPanel(); // muestra el panel del hueco (sus respuestas válidas)
}

function deleteSelected() {
  if (!state.sel) return;
  const field = getField(state.sel.pageIndex, state.sel.fieldId);
  if (!field) return;
  if (state.sel.kind === 'zone') {
    field.config.zones = field.config.zones.filter(z => z.id !== state.sel.zoneId);
    // Las piezas que apuntaban a esta zona quedan sin destino (distractoras).
    (field.config.pieces || []).forEach(p => { if (p.zoneId === state.sel.zoneId) p.zoneId = ''; });
    state.sel = { kind: 'field', pageIndex: state.sel.pageIndex, fieldId: field.id };
  } else if (state.sel.kind === 'piece') {
    const piece = (field.config.pieces || []).find(p => p.id === state.sel.pieceId);
    if (piece?.src) { urls.delete(piece.src); state.files.delete(piece.src); }
    field.config.pieces = (field.config.pieces || []).filter(p => p.id !== state.sel.pieceId);
    state.sel = { kind: 'field', pageIndex: state.sel.pageIndex, fieldId: field.id };
  } else if (state.sel.kind === 'amitem') {
    const item = (field.config.items || []).find(i => i.id === state.sel.amItemId);
    if (item) delete item.rect;
    state.sel = { kind: 'field', pageIndex: state.sel.pageIndex, fieldId: field.id };
  } else if (state.sel.kind === 'cbbox') {
    field.config.boxes = (field.config.boxes || []).filter(b => b.id !== state.sel.cbBoxId);
    field.config.correct = (field.config.correct || []).filter(id => id !== state.sel.cbBoxId);
    if (field.config.boxes.length) {
      state.sel = { kind: 'field', pageIndex: state.sel.pageIndex, fieldId: field.id };
    } else {
      // Sin casillas el campo no tiene sentido: se elimina entero.
      const page = state.manifest.pages[state.sel.pageIndex];
      page.fields = page.fields.filter(f => f.id !== field.id);
      state.sel = null;
    }
  } else if (state.sel.kind === 'tbbox') {
    field.config.boxes = (field.config.boxes || []).filter(b => b.id !== state.sel.tbBoxId);
    if (field.config.boxes.length) {
      state.sel = { kind: 'field', pageIndex: state.sel.pageIndex, fieldId: field.id };
    } else {
      // Sin huecos el campo no tiene sentido: se elimina entero.
      const page = state.manifest.pages[state.sel.pageIndex];
      page.fields = page.fields.filter(f => f.id !== field.id);
      state.sel = null;
    }
  } else {
    if (field.config?.pkg) { clearPackageFiles(field.config.pkg); resetEditorPkgCache(); }
    const page = state.manifest.pages[state.sel.pageIndex];
    page.fields = page.fields.filter(f => f.id !== field.id);
    state.sel = null;
  }
  markDirty();
  renderCanvas();
  renderPanel();
}

// Borra de state.files todos los archivos de un paquete (su prefijo): vale para
// paquetes SCORM y webs incrustadas (embed zip/elpx).
function clearPackageFiles(prefix) {
  if (!prefix) return;
  for (const path of [...state.files.keys()]) {
    if (path.startsWith(prefix)) { urls.delete(path); state.files.delete(path); }
  }
}

// Contexto de hospedaje (SCORM y embed zip/elpx) para la vista en vivo del
// lienzo del editor: registra el Service Worker una sola vez y aprovisiona cada
// paquete bajo demanda (cacheado para no reescribir la caché en cada renderCanvas).
let edPkgReady = null;
const edPkgProvisioned = new Set();
function editorPkgHost() {
  if (!scormSupported()) return { supported: false };
  if (!edPkgReady) edPkgReady = registerScormSw();
  return {
    supported: true,
    ready: edPkgReady,
    token: f => 'editor-' + state.manifest.id + '-' + f.id,
    provision: async (token, pkg) => {
      if (!edPkgProvisioned.has(token)) {
        await releaseScormPackage(token);       // limpia un paquete anterior del mismo campo
        await provisionScormPackage(token, state.files, pkg);
        edPkgProvisioned.add(token);
      }
      return scormRunBase(token);
    },
    studentName: ''
  };
}
// Fuerza el reaprovisionamiento (al subir/sustituir/borrar un paquete).
function resetEditorPkgCache() { edPkgProvisioned.clear(); }

function cloneField(field, offset = 0) {
  const copy = JSON.parse(JSON.stringify(field));
  copy.id = uid('f');
  copy.rect = {
    ...copy.rect,
    x: clamp(copy.rect.x + offset, 0, 1 - copy.rect.w),
    y: clamp(copy.rect.y + offset, 0, 1 - copy.rect.h)
  };
  if (copy.type === 'dragdrop') {
    const zoneIdMap = {};
    copy.config.zones = copy.config.zones.map(z => {
      const nid = uid('z');
      zoneIdMap[z.id] = nid;
      return {
        ...z,
        id: nid,
        rect: { ...z.rect, x: clamp(z.rect.x + offset, 0, 1 - z.rect.w), y: clamp(z.rect.y + offset, 0, 1 - z.rect.h) }
      };
    });
    if (copy.config.mode === 'crops') {
      copy.config.pieces = (copy.config.pieces || []).map(p => {
        const blob = state.files.get(p.src);
        let nsrc = p.src;
        if (blob) { nsrc = 'dtokens/' + uid() + '.png'; state.files.set(nsrc, blob); }
        return {
          ...p,
          id: uid('p'),
          src: nsrc,
          zoneId: zoneIdMap[p.zoneId] || '',
          rect: { ...p.rect, x: clamp(p.rect.x + offset, 0, 1 - p.rect.w), y: clamp(p.rect.y + offset, 0, 1 - p.rect.h) }
        };
      });
    }
  }
  if (copy.type === 'arrowmatch') {
    const idMap = {};
    copy.config.items = (copy.config.items || []).map(i => {
      const nid = uid('ai');
      idMap[i.id] = nid;
      return { ...i, id: nid };
    });
    copy.config.pairs = (copy.config.pairs || []).map(p => ({
      ...p,
      from: idMap[p.from] || p.from,
      to: idMap[p.to] || p.to
    }));
  }
  if (copy.type === 'checkbox') {
    const idMap = {};
    copy.config.boxes = (copy.config.boxes || []).map(b => {
      const nid = uid('cb');
      idMap[b.id] = nid;
      return {
        id: nid,
        rect: {
          ...b.rect,
          x: clamp(b.rect.x + offset, 0, 1 - b.rect.w),
          y: clamp(b.rect.y + offset, 0, 1 - b.rect.h)
        }
      };
    });
    copy.config.correct = (copy.config.correct || []).map(id => idMap[id]).filter(Boolean);
  }
  if (copy.type === 'textboxes') {
    copy.config.boxes = (copy.config.boxes || []).map(b => ({
      id: uid('tb'),
      answers: [...(b.answers || [''])],
      rect: {
        ...b.rect,
        x: clamp(b.rect.x + offset, 0, 1 - b.rect.w),
        y: clamp(b.rect.y + offset, 0, 1 - b.rect.h)
      }
    }));
  }
  return copy;
}

function duplicateSelected() {
  if (!state.sel || state.sel.kind !== 'field') return;
  const field = getField(state.sel.pageIndex, state.sel.fieldId);
  if (!field) return;
  const copy = cloneField(field, 0.03);
  state.manifest.pages[state.sel.pageIndex].fields.push(copy);
  markDirty();
  renderCanvas();
  selectField(state.sel.pageIndex, copy.id);
}

function copySelected() {
  if (!state.sel || state.sel.kind !== 'field') return;
  const field = getField(state.sel.pageIndex, state.sel.fieldId);
  if (!field) return;
  state.copiedField = JSON.parse(JSON.stringify(field));
  toast(t('toast.fieldCopied'), 'ok');
  renderPanel();
}

function pasteField(pi) {
  if (!state.copiedField) return;
  if (pi === undefined || pi === null) return;
  if (!state.manifest.pages[pi]) return;
  const copy = cloneField(state.copiedField);
  state.manifest.pages[pi].fields.push(copy);
  markDirty();
  renderCanvas();
  selectField(pi, copy.id);
}

document.addEventListener('keydown', e => {
  const inForm = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if (inForm) return;

  // Si el foco está en una miniatura de la tira, los atajos actúan sobre páginas.
  const thumbEl = document.activeElement?.closest?.('.ed-thumb');
  if (thumbEl) {
    const pi = parseInt(thumbEl.dataset.page, 10);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copyPage(pi); }
    else if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); copyPage(pi, { cut: true }); }
    else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); pastePageAt(pi + 1); }
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicatePage(pi); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deletePage(pi); }
    return;
  }

  // Copiar y pegar: funcionan con cualquier tipo de selección (campo o página).
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
    if (state.sel?.kind === 'field') { e.preventDefault(); copySelected(); }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
    if (state.copiedField && state.sel?.pageIndex !== undefined) {
      e.preventDefault();
      pasteField(state.sel.pageIndex);
    }
    return;
  }

  // Deshacer / rehacer (no requieren selección).
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault(); undo(); return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
    e.preventDefault(); redo(); return;
  }

  // El resto de atajos requieren un campo seleccionado.
  if (!state.sel) return;
  const field = getField(state.sel.pageIndex, state.sel.fieldId);
  if (!field) return;
  const rect = state.sel.kind === 'zone'
    ? field.config.zones.find(z => z.id === state.sel.zoneId)?.rect
    : state.sel.kind === 'piece'
      ? (field.config.pieces || []).find(p => p.id === state.sel.pieceId)?.rect
      : state.sel.kind === 'amitem'
        ? (field.config.items || []).find(i => i.id === state.sel.amItemId)?.rect
        : state.sel.kind === 'cbbox'
          ? (field.config.boxes || []).find(b => b.id === state.sel.cbBoxId)?.rect
          : state.sel.kind === 'tbbox'
            ? (field.config.boxes || []).find(b => b.id === state.sel.tbBoxId)?.rect
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
    const id = state.sel.kind === 'zone' ? state.sel.zoneId
      : state.sel.kind === 'piece' ? state.sel.pieceId
      : state.sel.kind === 'amitem' ? state.sel.amItemId
      : state.sel.kind === 'cbbox' ? state.sel.cbBoxId
      : state.sel.kind === 'tbbox' ? state.sel.tbBoxId
      : state.sel.fieldId;
    const node = canvas.querySelector(`[data-id="${id}"]`);
    if (node) setRectStyle(node, rect);
    if (state.sel.kind === 'piece') recropPiece(state.sel.pageIndex, field.id, state.sel.pieceId);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    duplicateSelected();
  }
});

// ---------- Panel lateral ----------

function renderPanel() {
  panel.textContent = '';
  $('#btnCopiarCampo').disabled = !(state.sel?.kind === 'field');
  if (state.sel) {
    if (state.sel.kind === 'page') {
      renderPagePanel(state.sel.pageIndex);
    } else {
      const field = getField(state.sel.pageIndex, state.sel.fieldId);
      if (field) {
        if (state.sel.kind === 'zone') renderZonePanel(field);
        else if (state.sel.kind === 'tbbox') renderTbBoxPanel(field);
        else renderFieldPanel(field); // 'field' y 'amitem' muestran el panel del campo
      } else {
        state.sel = null;
      }
    }
  }
  if (!state.sel) {
    const toolType = state.activeTool && FIELD_TYPES[state.activeTool] ? state.activeTool : null;
    const openGroupDef = !toolType && state.openGroup ? PALETTE_GROUPS.find(g => g.id === state.openGroup) : null;
    if (toolType === 'fillgaps') {
      // «Rellenar huecos»: antes de dibujar, el docente elige cómo proceder.
      const glyph = el('span', { class: 'glyph' });
      glyph.innerHTML = FIELD_TYPES.fillgaps.glyph;
      const box = el('div', { class: 'ed-panel-vacio ed-panel-tool-hint' },
        el('div', { class: 'ed-tool-hint-header' }, glyph, el('span', {}, fieldTypeName('fillgaps'))),
        el('p', {}, t('fillgaps.chooseIntro')));
      const pick = realType => {
        state.activeTool = realType; // gaps | textboxes
        refreshPaletteState();
        renderPanel(); // muestra ya la ayuda «qué dibujar» del modo elegido
      };
      box.appendChild(el('div', { class: 'ed-mode-choice' },
        modeChoiceCard(t('fillgaps.textTitle'), t('fillgaps.textDesc'), () => pick('gaps')),
        modeChoiceCard(t('fillgaps.boxesTitle'), t('fillgaps.boxesDesc'), () => pick('textboxes'))));
      panel.appendChild(box);
    } else if (toolType) {
      const ft = FIELD_TYPES[toolType];
      const glyph = el('span', { class: 'glyph' });
      glyph.innerHTML = ft.glyph;
      const descKey = 'field.desc.' + toolType;
      const desc = t(descKey) !== descKey ? t(descKey) : '';
      panel.appendChild(el('div', { class: 'ed-panel-vacio ed-panel-tool-hint' },
        el('div', { class: 'ed-tool-hint-header' },
          glyph,
          el('span', {}, fieldTypeName(toolType))),
        el('p', {}, desc)));
    } else if (openGroupDef) {
      const glyph = el('span', { class: 'glyph' });
      glyph.innerHTML = openGroupDef.glyph;
      const descKey = 'palette.desc.' + openGroupDef.id;
      const desc = t(descKey) !== descKey ? t(descKey) : '';
      panel.appendChild(el('div', { class: 'ed-panel-vacio ed-panel-tool-hint' },
        el('div', { class: 'ed-tool-hint-header' },
          glyph,
          el('span', {}, t('palette.' + openGroupDef.id))),
        el('p', {}, desc)));
    } else {
      panel.appendChild(el('div', { class: 'ed-panel-vacio' },
        el('h3', {}, t('editor.noField')),
        el('p', {}, state.manifest.pages.length
          ? t('editor.noFieldDesc')
          : t('editor.noFieldDescNoPages'))));
    }
  }
  renderFieldList();
}

function renderPagePanel(pi) {
  const page = state.manifest.pages[pi];
  if (!page) return;
  const cont = el('div', {});
  cont.appendChild(el('h3', {},
    el('span', { class: 'tipo-chip' }, t('editor.pageChip')),
    t('editor.pageN', { n: pi + 1, total: state.manifest.pages.length })));
  if (page.bgColor !== undefined) {
    cont.appendChild(el('label', { class: 'f-label' }, t('editor.pageBgColor')));
    const { wrap: colorPickWrap } = colorInput(page.bgColor, v => recolorBlankPage(pi, v));
    cont.appendChild(colorPickWrap);

    const sizes = [
      { key: 'a4p',  w: 1600, h: 2263, label: t('editor.pageSizeA4p') },
      { key: 'a4l',  w: 2263, h: 1600, label: t('editor.pageSizeA4l') },
      { key: 'ltrp', w: 1600, h: 2071, label: t('editor.pageSizeLtrp') },
      { key: 'ltrl', w: 2071, h: 1600, label: t('editor.pageSizeLtrl') },
      { key: 'free', w: null,  h: null, label: t('editor.pageSizeFree') },
    ];
    const curKey = detectSizePreset(page.w, page.h);
    cont.appendChild(el('label', { class: 'f-label' }, t('editor.pageSize')));
    const sizeSel = el('select', {});
    sizes.forEach(s => {
      const opt = el('option', { value: s.key }, s.label);
      if (s.key === curKey) opt.selected = true;
      sizeSel.appendChild(opt);
    });
    cont.appendChild(sizeSel);

    const freeRow = el('div', {});
    freeRow.style.display = curKey === 'free' ? '' : 'none';
    const wIn = el('input', { type: 'number', min: '400', max: '5000', step: '10', value: String(page.w) });
    const hIn = el('input', { type: 'number', min: '400', max: '5000', step: '10', value: String(page.h) });
    freeRow.appendChild(el('label', { class: 'f-label' }, t('editor.pageSizeW')));
    freeRow.appendChild(wIn);
    freeRow.appendChild(el('label', { class: 'f-label' }, t('editor.pageSizeH')));
    freeRow.appendChild(hIn);
    cont.appendChild(freeRow);

    const applyFreeSize = () => {
      const w = parseInt(wIn.value) || page.w;
      const h = parseInt(hIn.value) || page.h;
      if (w !== page.w || h !== page.h) resizePage(pi, w, h);
    };
    wIn.addEventListener('change', applyFreeSize);
    hIn.addEventListener('change', applyFreeSize);

    sizeSel.addEventListener('change', () => {
      const chosen = sizes.find(s => s.key === sizeSel.value);
      if (chosen.key === 'free') {
        freeRow.style.display = '';
      } else {
        freeRow.style.display = 'none';
        if (chosen.w !== page.w || chosen.h !== page.h) resizePage(pi, chosen.w, chosen.h);
      }
    });
  }
  const dupBtn = iconBtn({ class: 'btn small', type: 'button' }, ICONS.copyPlus, t('editor.duplicatePage'));
  dupBtn.addEventListener('click', () => duplicatePage(pi));
  const delBtn = iconBtn({ class: 'btn small danger', type: 'button' }, ICONS.trash, t('editor.deletePage'));
  delBtn.addEventListener('click', () => deletePage(pi));
  cont.appendChild(el('div', { class: 'ed-acciones' }, dupBtn, delBtn));
  panel.appendChild(cont);
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

// Desplegable de tipo de letra. Cada opción se previsualiza con su propia
// fuente. Con `inherit`, añade «Igual que la ficha» (valor vacío = heredar).
function fontSelect(value, onChange, { inherit = false } = {}) {
  const sel = el('select', { class: 'font-select' });
  if (inherit) sel.appendChild(el('option', { value: '' }, t('editor.fontInherit')));
  FONT_OPTIONS.forEach(f => {
    sel.appendChild(el('option', { value: f.id, style: `font-family:${f.stack}` },
      f.id === 'mono' ? t('editor.fontMono') : f.name));
  });
  sel.value = value || '';
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

function renderFieldPanel(field) {
  const cont = el('div', {});
  const descKey = 'field.desc.' + field.type;
  const fieldDesc = t(descKey) !== descKey ? t(descKey) : '';
  const head = el('h3', {},
    el('span', { class: 'tipo-chip' }, fieldTypeName(field.type)),
    t('editor.fieldConfig'));
  if (fieldDesc) {
    const helpBtn = el('button', { class: 'field-help-btn', type: 'button', 'aria-expanded': 'false' }, '?');
    const helpBox = el('p', { class: 'field-help-text', hidden: '' }, fieldDesc);
    helpBtn.addEventListener('click', () => {
      const showing = helpBox.hidden;
      helpBox.hidden = !showing;
      helpBtn.setAttribute('aria-expanded', showing ? 'true' : 'false');
      helpBtn.classList.toggle('is-open', showing);
    });
    head.appendChild(el('span', { class: 'spacer' }));
    head.appendChild(helpBtn);
    cont.appendChild(head);
    cont.appendChild(helpBox);
  } else {
    cont.appendChild(head);
  }

  // "Arrastrar a zonas": antes de mostrar las opciones, el usuario elige el
  // medio (escribir etiquetas o recortar del PDF). Hasta entonces no se muestra
  // nada más, para evitar confusiones. Las fichas anteriores se infieren.
  if (field.type === 'dragdrop') {
    const cfg = field.config;
    if (!Array.isArray(cfg.pieces)) cfg.pieces = [];
    if (!Array.isArray(cfg.distractors)) cfg.distractors = [];
    if (cfg.mode === undefined) {
      const hasLabels = (cfg.zones || []).some(z => Array.isArray(z.answers) && z.answers.some(Boolean)) || cfg.distractors.some(Boolean);
      cfg.mode = hasLabels ? 'labels' : (cfg.pieces.length ? 'crops' : '');
    }
    if (cfg.mode !== 'labels' && cfg.mode !== 'crops') {
      cont.appendChild(el('p', { class: 'cfg-hint' }, t('cfg.dragdropChooseIntro')));
      const pick = m => {
        // Al elegir un medio se descartan los datos del otro para que no queden
        // colgados (recortes y sus imágenes, o distractores de texto).
        if (m === 'labels') {
          (cfg.pieces || []).forEach(p => { if (p.src) { urls.delete(p.src); state.files.delete(p.src); } });
          cfg.pieces = [];
        } else if (m === 'crops') {
          cfg.distractors = [];
        }
        cfg.mode = m;
        markDirty(); renderPanel(); renderCanvas();
      };
      cont.appendChild(el('div', { class: 'ed-mode-choice' },
        modeChoiceCard(t('cfg.dragdropLabelsTitle'), t('cfg.dragdropHintLabels'), () => pick('labels')),
        modeChoiceCard(t('cfg.dragdropCropsTitle'), t('cfg.dragdropHintCrops'), () => pick('crops'))));
      cont.appendChild(el('div', { class: 'ed-acciones' },
        iconBtn({ class: 'btn small danger', onclick: deleteSelected }, ICONS.trash, t('editor.delete'))));
      panel.appendChild(cont);
      return;
    }
  }

  // "Insertar (Web/HTML)": antes de mostrar las opciones, el usuario elige el
  // tipo de contenido (URL, HTML, web en ZIP o paquete eXeLearning .elpx).
  if (field.type === 'embed') {
    const cfg = field.config;
    const MODES = ['url', 'html', 'zip', 'elpx', 'imscp'];
    if (!MODES.includes(cfg.mode)) {
      cont.appendChild(el('p', { class: 'cfg-hint' }, t('cfg.embedChooseIntro')));
      const pick = m => { cfg.mode = m; markDirty(); renderPanel(); renderCanvas(); };
      cont.appendChild(el('div', { class: 'ed-mode-choice' },
        modeChoiceCard(t('cfg.embedUrlTitle'), t('cfg.embedUrlDesc'), () => pick('url')),
        modeChoiceCard(t('cfg.embedHtmlTitle'), t('cfg.embedHtmlDesc'), () => pick('html')),
        modeChoiceCard(t('cfg.embedZipTitle'), t('cfg.embedZipDesc'), () => pick('zip')),
        modeChoiceCard(t('cfg.embedElpxTitle'), t('cfg.embedElpxDesc'), () => pick('elpx')),
        modeChoiceCard(t('cfg.embedImscpTitle'), t('cfg.embedImscpDesc'), () => pick('imscp'))));
      cont.appendChild(el('div', { class: 'ed-acciones' },
        iconBtn({ class: 'btn small danger', onclick: deleteSelected }, ICONS.trash, t('editor.delete'))));
      panel.appendChild(cont);
      return;
    }
  }

  const decor = Boolean(FIELD_TYPES[field.type]?.decor);
  const interactive = !decor && !isShapeField(field.type) && field.type !== 'cover';
  // En "arrastrar a zonas" modo recorte, las piezas son imágenes: el color de
  // texto y el fondo de la bandeja no aplican (el hueco tiene su propio color).
  const dragCrops = field.type === 'dragdrop' && field.config.mode === 'crops';

  // Puntuación
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
      // Los ajustes que solo sirven para corregir (respuestas aceptadas,
      // tolerancia, ignorar mayúsculas/tildes/espacios…) no tienen sentido si el
      // campo no puntúa: se ocultan mientras «No contar para la puntuación» esté
      // marcado. Los marca cada formBuilder con la clase `cfg-scoring-only`.
      cont.querySelectorAll('.cfg-scoring-only').forEach(elm => {
        elm.style.display = field.noScore ? 'none' : '';
      });
      refreshChip(field);
      refreshFieldList();
      markDirty();
    });
    cont.appendChild(el('label', { class: 'check-row' }, noScoreCb, t('editor.noScore')));
    cont.appendChild(ptsRow);
  }

  // Configuración específica del tipo
  const formBuilder = configForms[field.type];
  if (formBuilder) formBuilder(cont, field);

  // Rotación: image, label, cover y las formas de diseño (no vídeo ni audio).
  if (field.type === 'image' || field.type === 'label' || field.type === 'cover' || isShapeField(field.type)) {
    const rotInp = el('input', { type: 'number', class: 'rot-input', step: '1', value: String(field.rotate || 0) });
    const applyRot = (deg, fromInput = false) => {
      field.rotate = deg;
      if (!fromInput) rotInp.value = deg;
      const box = canvas.querySelector(`[data-id="${field.id}"]`);
      if (box) box.style.transform = deg ? `rotate(${deg}deg)` : '';
      markDirty();
    };
    rotInp.addEventListener('input', () => applyRot(parseInt(rotInp.value, 10) || 0, true));
    const row = el('div', { class: 'rot-row' },
      el('label', { class: 'f-label' }, t('editor.rotate')),
      rotInp,
      el('button', { class: 'btn small', type: 'button', onclick: () => applyRot((field.rotate || 0) - 90) }, '-90°'),
      el('button', { class: 'btn small', type: 'button', onclick: () => applyRot((field.rotate || 0) + 90) }, '+90°'),
      el('button', { class: 'btn small', type: 'button', title: t('editor.resetRotation'), onclick: () => applyRot(0) }, '0°'));
    cont.appendChild(row);
  }

  // Tamaño exacto. En campos con subelementos el tamaño relevante es el del
  // subelemento seleccionado (casilla o item), no el del campo contenedor;
  // «Casillas» y «Huecos en documento» no tienen un tamaño de campo propio.
  if (state.sel.kind === 'cbbox') {
    const b = (field.config.boxes || []).find(b => b.id === state.sel.cbBoxId);
    if (b) appendSizeSection(cont, b.rect, b.id);
  } else if (state.sel.kind === 'amitem') {
    const it = (field.config.items || []).find(i => i.id === state.sel.amItemId);
    if (it && it.rect) appendSizeSection(cont, it.rect, it.id);
  } else if (field.type !== 'checkbox' && field.type !== 'textboxes') {
    appendSizeSection(cont, field.rect, field.id);
  }

  // Acciones
  cont.appendChild(el('div', { class: 'ed-acciones' },
    iconBtn({ class: 'btn small', onclick: duplicateSelected }, ICONS.copyPlus, t('editor.duplicate')),
    iconBtn({ class: 'btn small danger', onclick: deleteSelected }, ICONS.trash, t('editor.delete'))));

  // Acordeón de diseño (tamaño/color de texto y fondo — no para image ni label, que gestionan esto inline).
  // En modo recorte solo contiene el color del hueco (los recortes conservan su tamaño y color originales).
  // «Casillas» (checkbox) se excluye: son casillas sueltas sobre la página, sin
  // texto ni un recuadro de fondo que estilizar, así que no hay nada de diseño que ajustar.
  const hasDesign = interactive && field.type !== 'checkbox' && field.type !== 'scorm';
  if (hasDesign) {
    // Sección de diseño siempre visible (sin acordeón).
    const accordion = el('div', { class: 'ed-section' });
    accordion.appendChild(el('div', { class: 'ed-section-title' }, t('editor.designSection')));
    const body = el('div', { class: 'ed-section-body' });
    accordion.appendChild(body);

    // Modo recorte: el único ajuste de diseño es el color del hueco vacío.
    if (dragCrops) {
      const cfg = field.config;
      body.appendChild(el('label', { class: 'f-label' }, t('cfg.holeColor')));
      const { wrap: holeColorWrap } = colorInput(cfg.holeColor || '#ffffff', v => {
        cfg.holeColor = v;
        markDirty();
      });
      body.appendChild(holeColorWrap);
    }

    // Texto: tamaño + color
    if (!dragCrops && field.type !== 'cover' && !isShapeField(field.type)) {
      const fsVal = field.fontScale || 1;
      const fsRange = el('input', { type: 'range', min: '0.6', max: '5', step: '0.1', value: String(fsVal) });
      const fsNum = el('input', { type: 'number', min: '0.1', max: '20', step: '0.1', value: String(fsVal), style: 'width:72px' });
      const applyFs = v => {
        v = Math.max(0.1, parseFloat(v) || 1);
        field.fontScale = v;
        fsRange.value = Math.min(v, 5);
        fsNum.value = v;
        const node = canvas.querySelector(`[data-id="${field.id}"]`);
        if (node) node.style.setProperty('--fs', v);
        markDirty();
      };
      fsRange.addEventListener('input', () => applyFs(fsRange.value));
      fsNum.addEventListener('input', () => applyFs(fsNum.value));
      body.appendChild(el('label', { class: 'f-label' }, t('editor.fontSize')));
      body.appendChild(el('div', { class: 'rot-row' }, fsRange, fsNum, el('span', {}, '×')));
      // Tipo de letra del campo (sobrescribe la fuente global de la ficha).
      const fontSel = fontSelect(field.fontFamily || '', id => {
        if (id) field.fontFamily = id; else delete field.fontFamily;
        const node = canvas.querySelector(`[data-id="${field.id}"]`);
        if (node) {
          if (id) node.style.setProperty('--field-font', fontStack(id));
          else node.style.removeProperty('--field-font');
        }
        markDirty();
      }, { inherit: true });
      body.appendChild(el('label', { class: 'f-label' }, t('editor.font')));
      body.appendChild(fontSel);
      if (interactive) {
        const cfg = field.config;
        const { wrap: fgWrap } = colorInput(cfg.fgColor || '#1d2c42', v => {
          cfg.fgColor = v;
          canvas.querySelector(`[data-id="${field.id}"]`)?.style.setProperty('--field-fg', v);
          markDirty();
        });
        body.appendChild(el('label', { class: 'f-label' }, t('cfg.fieldFg')));
        body.appendChild(fgWrap);
      }
    }

    // Fondo: color + opacidad (solo campos interactivos; no en modo recorte)
    if (interactive && !dragCrops) {
      const cfg = field.config;
      const applyFieldBg = () => {
        const hex = cfg.bg || '#fffdf8';
        const op = cfg.bgOpacity ?? 1;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        canvas.querySelector(`[data-id="${field.id}"]`)?.style.setProperty('--field-bg', `rgba(${r},${g},${b},${op})`);
      };
      body.appendChild(el('label', { class: 'f-label' }, t('cfg.fieldBg')));
      const { inp: bgColor, wrap: bgWrap } = colorInput(cfg.bg || '#fffdf8', v => { cfg.bg = v; applyFieldBg(); markDirty(); });
      const bgOp = el('input', { type: 'range', min: '0', max: '100', step: '1', value: String(Math.round((cfg.bgOpacity ?? 1) * 100)) });
      const bgOpNum = el('input', { type: 'number', min: '0', max: '100', step: '1', value: String(Math.round((cfg.bgOpacity ?? 1) * 100)) });
      const syncBgOp = val => {
        const v = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
        cfg.bgOpacity = v / 100;
        bgOp.value = v;
        bgOpNum.value = v;
        applyFieldBg();
        markDirty();
      };
      bgOp.addEventListener('input', () => syncBgOp(bgOp.value));
      bgOpNum.addEventListener('input', () => syncBgOp(bgOpNum.value));
      body.appendChild(el('div', { class: 'rot-row' },
        bgWrap,
        el('label', { class: 'f-label', style: 'margin-left:0.5em' }, t('cfg.fieldBgOpacity')),
        bgOp, bgOpNum, el('span', {}, '%')));
    }

    cont.appendChild(accordion);
  }

  panel.appendChild(cont);
}

function renderZonePanel(field) {
  const zone = field.config.zones.find(z => z.id === state.sel.zoneId);
  if (!zone) { state.sel = { kind: 'field', pageIndex: state.sel.pageIndex, fieldId: field.id }; renderFieldPanel(field); return; }

  // En modo "recortar del PDF" la zona lleva un nombre opcional y, en el mismo
  // sitio, los recortes del PDF que el alumnado debe traer hasta ella.
  if (field.config.mode === 'crops') {
    if (!Array.isArray(field.config.pieces)) field.config.pieces = [];
    const zi = field.config.zones.indexOf(zone);
    const cont = el('div', {});
    cont.appendChild(el('h3', {},
      el('span', { class: 'tipo-chip' }, t('editor.zoneChip')),
      t('editor.zoneTitle')));
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.zoneName')));
    const nameInp = el('input', { type: 'text', value: zone.name || '', placeholder: t('cfg.zoneN', { n: zi + 1 }) });
    nameInp.addEventListener('input', () => {
      zone.name = nameInp.value;
      const chip = canvas.querySelector(`.ed-zone[data-id="${zone.id}"] .chip`);
      if (chip) chip.textContent = zoneDisplayName(zone, zi);
      markDirty();
    });
    cont.appendChild(nameInp);

    // Recortes que pertenecen a esta zona.
    const zonePieces = () => (field.config.pieces || []).filter(p => p.zoneId === zone.id);
    optionListEditor(cont, {
      label: t('cfg.zonePieces'),
      items: zonePieces,
      render: (row, piece) => {
        const cell = state.files.has(piece.src)
          ? el('img', { src: fileUrl(piece.src), class: 'tok-thumb', alt: '🖼' })
          : el('span', {}, '🖼');
        row.appendChild(cell);
      },
      add: () => {
        state.pendingPieceZone = zone.id;
        state.activeTool = 'piece';
        refreshPaletteState();
        canvas.classList.add('drawing');
        toast(t('toast.drawPieceTip'));
      },
      remove: i => {
        const p = zonePieces()[i];
        if (p?.src) { urls.delete(p.src); state.files.delete(p.src); }
        field.config.pieces = field.config.pieces.filter(x => x.id !== p.id);
        renderCanvas();
      },
      addLabel: t('cfg.drawPieceZone'),
      min: 0
    });

    cont.appendChild(el('p', { class: 'cfg-hint' }, t('editor.zoneHintCrops')));
    const addZoneBtn = el('button', { class: 'btn small add-row', type: 'button' }, t('cfg.addAnotherZone'));
    addZoneBtn.addEventListener('click', startZoneTool);
    cont.appendChild(addZoneBtn);
    appendSizeSection(cont, zone.rect, zone.id);
    cont.appendChild(el('div', { class: 'ed-acciones' },
      iconBtn({ class: 'btn small', onclick: () => selectField(state.sel.pageIndex, field.id) }, ICONS.arrowLeft, t('editor.backToField')),
      iconBtn({ class: 'btn small danger', onclick: deleteSelected }, ICONS.trash, t('editor.deleteZone'))));
    panel.appendChild(cont);
    return;
  }

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
      // Botón/state.preview de imagen.
      const imgBtn = el('button', { class: 'ans-img-btn' + (isImg ? ' has-img' : ''), type: 'button', title: t('cfg.uploadTokenImg') });
      if (isImg && state.files.has(item)) {
        imgBtn.appendChild(el('img', { src: fileUrl(item), class: 'tok-thumb', alt: '' }));
      }
      imgBtn.addEventListener('click', () => {
        const pick = document.createElement('input');
        pick.type = 'file'; pick.accept = 'image/png,image/jpeg,image/gif,image/webp';
        pick.addEventListener('change', () => {
          const f = pick.files[0]; if (!f) return;
          const ext = f.name.split('.').pop().toLowerCase() || 'png';
          const path = 'dtokens/' + uid() + '.' + ext;
          if (isImg) { urls.delete(item); state.files.delete(item); }
          state.files.set(path, f);
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
        const quitImg = iconBtn({ class: 'btn small', type: 'button', title: t('cfg.removeImage') }, ICONS.imageOff);
        quitImg.addEventListener('click', e => {
          e.stopPropagation();
          urls.delete(item); state.files.delete(item);
          zone.answers[i] = ''; updateZoneChip(); markDirty(); repaint();
        });
        row.appendChild(quitImg);
      }
    },
    add: () => zone.answers.push(''),
    remove: i => {
      const a = zone.answers[i];
      if (a.startsWith('dtokens/')) { urls.delete(a); state.files.delete(a); }
      zone.answers.splice(i, 1); updateZoneChip();
    },
    addLabel: t('cfg.addZoneAnswer'),
    min: 1
  });
  cont.appendChild(el('p', { style: 'font-size:.85rem;color:var(--tinta-suave);margin-top:8px' },
    t('editor.zoneHint')));
  const addZoneBtn = el('button', { class: 'btn small add-row', type: 'button' }, t('cfg.addAnotherZone'));
  addZoneBtn.addEventListener('click', startZoneTool);
  cont.appendChild(addZoneBtn);
  appendSizeSection(cont, zone.rect, zone.id);
  cont.appendChild(el('div', { class: 'ed-acciones' },
    iconBtn({ class: 'btn small', onclick: () => selectField(state.sel.pageIndex, field.id) }, ICONS.arrowLeft, t('editor.backToField')),
    iconBtn({ class: 'btn small danger', onclick: deleteSelected }, ICONS.trash, t('editor.deleteZone'))));
  panel.appendChild(cont);
}

function renderTbBoxPanel(field) {
  const box = (field.config.boxes || []).find(b => b.id === state.sel.tbBoxId);
  if (!box) { state.sel = { kind: 'field', pageIndex: state.sel.pageIndex, fieldId: field.id }; renderFieldPanel(field); return; }
  if (!Array.isArray(box.answers)) box.answers = box.answers ? [String(box.answers)] : [''];
  function updateChip() {
    const chip = canvas.querySelector(`.ed-tbbox[data-id="${box.id}"] .chip`);
    if (chip) chip.textContent = (box.answers.find(a => a && a.trim()) || '—');
  }
  const cont = el('div', {});
  cont.appendChild(el('h3', {},
    el('span', { class: 'tipo-chip' }, t('editor.tbBoxChip')),
    t('editor.tbBoxTitle')));
  optionListEditor(cont, {
    label: t('cfg.tbBoxAnswers'),
    items: () => box.answers,
    render: (row, item, i) => row.appendChild(textCell(item, v => { box.answers[i] = v; updateChip(); }, t('cfg.answerPlaceholder'))),
    add: () => box.answers.push(''),
    remove: i => { box.answers.splice(i, 1); updateChip(); },
    addLabel: t('cfg.addAnswer'),
    min: 1
  });
  cont.appendChild(el('p', { class: 'cfg-hint' }, t('editor.tbBoxHint')));
  const addBoxBtn = el('button', { class: 'btn small add-row', type: 'button' }, t('cfg.addAnotherTextbox'));
  addBoxBtn.addEventListener('click', startTbBoxTool);
  cont.appendChild(addBoxBtn);
  appendSizeSection(cont, box.rect, box.id);
  cont.appendChild(el('div', { class: 'ed-acciones' },
    iconBtn({ class: 'btn small', onclick: () => selectField(state.sel.pageIndex, field.id) }, ICONS.arrowLeft, t('editor.backToField')),
    iconBtn({ class: 'btn small danger', onclick: deleteSelected }, ICONS.trash, t('editor.tbBoxDelete'))));
  panel.appendChild(cont);
}

function renderAmItemPanel(field) {
  const item = (field.config.items || []).find(i => i.id === state.sel.amItemId);
  if (!item) { state.sel = { kind: 'field', pageIndex: state.sel.pageIndex, fieldId: field.id }; renderFieldPanel(field); return; }
  const cont = el('div', {});
  const sideLabel = item.side === 'left' ? t('cfg.amLeft') : t('cfg.amRight');
  cont.appendChild(el('h3', {},
    el('span', { class: 'tipo-chip' }, sideLabel),
    t('editor.amItemTitle')));
  cont.appendChild(el('p', { style: 'font-size:.85rem;color:var(--tinta-suave)' }, t('editor.amItemHint')));
  cont.appendChild(el('div', { class: 'ed-acciones' },
    iconBtn({ class: 'btn small', onclick: () => selectField(state.sel.pageIndex, field.id) }, ICONS.arrowLeft, t('editor.backToField')),
    iconBtn({ class: 'btn small danger', onclick: deleteSelected }, ICONS.trash, t('editor.amItemDelete'))));
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

// Campos de título y pie comunes a los medios decorativos (vídeo, audio, embed).
// Reconstruye en el lienzo el contenido de un medio tras cambiar su config (sin
// recargar toda la página: solo ese campo, para que los demás iframes no parpadeen).
function rebuildCanvasMedia(field) {
  const box = canvas.querySelector(`.ed-field[data-id="${field.id}"]`);
  if (!box) return;
  box.querySelector('.wpf-media')?.remove();
  box.appendChild(buildMediaContent(field, fileUrl, { editor: true, host: editorPkgHost() }));
}

function mediaTitleCaption(cont, field, rebuild = rebuildCanvasMedia) {
  const cfg = field.config;
  cont.appendChild(el('label', { class: 'f-label' }, t('cfg.mediaTitle')));
  const ti = el('input', { type: 'text', value: cfg.title || '', maxlength: '140' });
  ti.addEventListener('input', () => { cfg.title = ti.value; markDirty(); });
  ti.addEventListener('change', () => rebuild(field));
  cont.appendChild(ti);
  cont.appendChild(el('label', { class: 'f-label' }, t('cfg.mediaCaption')));
  const ca = el('input', { type: 'text', value: cfg.caption || '', maxlength: '200' });
  ca.addEventListener('input', () => { cfg.caption = ca.value; markDirty(); });
  ca.addEventListener('change', () => rebuild(field));
  cont.appendChild(ca);
  // Alineación del título y el pie: izquierda, centro o derecha.
  selectRow(cont, t('cfg.labelAlign'), cfg.align || 'left', [
    ['left', t('cfg.alignLeft')],
    ['center', t('cfg.alignCenter')],
    ['right', t('cfg.alignRight')]
  ], v => { cfg.align = v; rebuild(field); });
  // El título y el pie son texto: comparten los controles de texto (tamaño,
  // tipo de letra y color) de los campos con texto.
  const fsVal = field.fontScale || 1;
  const fsRange = el('input', { type: 'range', min: '0.6', max: '5', step: '0.1', value: String(fsVal) });
  const fsNum = el('input', { type: 'number', min: '0.1', max: '20', step: '0.1', value: String(fsVal), style: 'width:72px' });
  const applyFs = v => {
    v = Math.max(0.1, parseFloat(v) || 1);
    field.fontScale = v;
    fsRange.value = Math.min(v, 5);
    fsNum.value = v;
    canvas.querySelector(`[data-id="${field.id}"]`)?.style.setProperty('--fs', v);
    markDirty();
  };
  fsRange.addEventListener('input', () => applyFs(fsRange.value));
  fsNum.addEventListener('input', () => applyFs(fsNum.value));
  cont.appendChild(el('label', { class: 'f-label' }, t('editor.fontSize')));
  cont.appendChild(el('div', { class: 'rot-row' }, fsRange, fsNum, el('span', {}, '×')));

  const fontSel = fontSelect(field.fontFamily || '', id => {
    if (id) field.fontFamily = id; else delete field.fontFamily;
    const node = canvas.querySelector(`[data-id="${field.id}"]`);
    if (node) {
      if (id) node.style.setProperty('--field-font', fontStack(id));
      else node.style.removeProperty('--field-font');
    }
    markDirty();
  }, { inherit: true });
  cont.appendChild(el('label', { class: 'f-label' }, t('editor.font')));
  cont.appendChild(fontSel);

  const { wrap: fgWrap } = colorInput(cfg.fgColor || '#1d2c42', v => {
    cfg.fgColor = v;
    canvas.querySelector(`[data-id="${field.id}"]`)?.style.setProperty('--field-fg', v);
    markDirty();
  });
  cont.appendChild(el('label', { class: 'f-label' }, t('cfg.fieldFg')));
  cont.appendChild(fgWrap);
}

// Botón para subir un archivo multimedia (vídeo/audio) a state.files.
function mediaFileRow(cont, field, accept, folder, label) {
  const cfg = field.config;
  if (cfg.src && state.files.has(cfg.src)) {
    cont.appendChild(el('p', { class: 'cfg-hint', style: 'margin:4px 0' }, '✓ ' + cfg.src.split('/').pop()));
  }
  const btn = iconBtn({ class: 'btn small media-upload-btn', type: 'button' }, ICONS.folderOpen, label);
  btn.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.addEventListener('change', () => {
      const f = inp.files[0]; if (!f) return;
      const ext = (f.name.split('.').pop() || 'bin').toLowerCase();
      const path = folder + '/' + uid() + '.' + ext;
      if (cfg.src) { urls.delete(cfg.src); state.files.delete(cfg.src); }
      state.files.set(path, f);
      cfg.src = path;
      markDirty();
      rebuildCanvasMedia(field);
      renderPanel();
    });
    inp.click();
  });
  cont.appendChild(btn);
}

// Cuenta los SCO (items con href) del árbol de navegación de un paquete SCORM.
function scormScoCount(items) {
  let n = 0;
  for (const it of items || []) {
    if (it.href) n++;
    n += scormScoCount(it.children);
  }
  return n;
}

// Sube un paquete SCORM 1.2 (.zip): lo descomprime a state.files bajo un prefijo
// único, valida y parsea el imsmanifest.xml y guarda la entrada y el menú.
function uploadScormPackage(field) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.zip,application/zip';
  inp.addEventListener('change', async () => {
    const file = inp.files[0];
    if (!file) return;
    try {
      const zip = await window.JSZip.loadAsync(file);
      let mEntry = zip.file('imsmanifest.xml');
      if (!mEntry) { const arr = zip.file(/imsmanifest\.xml$/i); mEntry = arr && arr[0]; }
      if (!mEntry) { toast(t('toast.scormNoManifest'), 'error'); return; }
      const parsed = parseImsManifest(await mEntry.async('string'));
      if (parsed.version === '2004') { toast(t('toast.scorm2004'), 'error'); return; }
      if (!parsed.entryHref) { toast(t('toast.scormNoEntry'), 'error'); return; }

      // Carpeta del manifest (normalmente la raíz del zip); las rutas internas
      // del paquete son relativas a ella.
      const rootDir = mEntry.name.slice(0, mEntry.name.length - 'imsmanifest.xml'.length);
      const entries = [];
      zip.forEach((path, entry) => { if (!entry.dir) entries.push({ path, entry }); });

      clearPackageFiles(field.config.pkg); // descarta el paquete anterior si lo hubiera
      resetEditorPkgCache();               // fuerza reaprovisionar la vista en vivo
      const prefix = 'scorm/' + uid() + '/';
      for (const { path, entry } of entries) {
        if (rootDir && !path.startsWith(rootDir)) continue;
        const internal = rootDir ? path.slice(rootDir.length) : path;
        if (!internal) continue;
        state.files.set(prefix + internal, await entry.async('blob'));
      }

      const org = parsed.organizations[0];
      const cfg = field.config;
      cfg.pkg = prefix;
      cfg.entryHref = parsed.entryHref;
      cfg.title = (org && org.title) || file.name.replace(/\.zip$/i, '');
      cfg.toc = (org && org.items) || [];
      markDirty();
      renderCanvas();
      renderPanel();
      toast(t('toast.scormLoaded'), 'ok');
    } catch {
      toast(t('toast.scormError'), 'error');
    }
  });
  inp.click();
}

// Localiza el HTML de entrada de una web empaquetada: prefiere index.html (lo
// menos profundo); si no, el .html/.htm de menor profundidad.
function findWebEntry(zip) {
  const htmls = [];
  zip.forEach((path, entry) => { if (!entry.dir && /\.x?html?$/i.test(path)) htmls.push(path); });
  if (!htmls.length) return '';
  htmls.sort((a, b) => {
    const ai = /(^|\/)index\.x?html?$/i.test(a) ? 0 : 1;
    const bi = /(^|\/)index\.x?html?$/i.test(b) ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return a.split('/').length - b.split('/').length || a.localeCompare(b);
  });
  return htmls[0];
}

// Sube una web empaquetada para el campo «Insertar»: un .zip con un index y sus
// recursos, o un .elpx de eXeLearning (que es un .zip con una web dentro). Se
// descomprime a state.files bajo 'embed/<uid>/' y se guarda la entrada.
function uploadWebPackage(field, kind) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = kind === 'elpx' ? '.elpx' : '.zip,application/zip';
  inp.addEventListener('change', async () => {
    const file = inp.files[0];
    if (!file) return;
    try {
      const zip = await window.JSZip.loadAsync(file);
      const entry = findWebEntry(zip);
      if (!entry) { toast(t('toast.webNoIndex'), 'error'); return; }
      // Carpeta del index: los recursos de la web son relativos a ella.
      const rootDir = entry.slice(0, entry.lastIndexOf('/') + 1);
      const entries = [];
      zip.forEach((path, e) => { if (!e.dir) entries.push({ path, entry: e }); });

      clearPackageFiles(field.config.pkg);  // descarta un paquete anterior
      resetEditorPkgCache();
      const prefix = 'embed/' + uid() + '/';
      for (const { path, entry: e } of entries) {
        if (rootDir && !path.startsWith(rootDir)) continue;
        const internal = rootDir ? path.slice(rootDir.length) : path;
        if (!internal) continue;
        state.files.set(prefix + internal, await e.async('blob'));
      }
      const cfg = field.config;
      cfg.pkg = prefix;
      cfg.entryHref = rootDir ? entry.slice(rootDir.length) : entry;
      markDirty();
      renderCanvas();
      renderPanel();
      toast(t('toast.webLoaded'), 'ok');
    } catch {
      toast(t('toast.webError'), 'error');
    }
  });
  inp.click();
}

// Carga un paquete IMS CP (.zip con imsmanifest.xml) en el campo «Insertar».
// Usa el manifest para localizar el punto de entrada; el resto se sirve igual
// que un embed ZIP normal.
function uploadImscpPackage(field) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.zip,application/zip';
  inp.addEventListener('change', async () => {
    const file = inp.files[0];
    if (!file) return;
    try {
      const zip = await window.JSZip.loadAsync(file);
      let mEntry = zip.file('imsmanifest.xml');
      if (!mEntry) { const arr = zip.file(/imsmanifest\.xml$/i); mEntry = arr && arr[0]; }
      if (!mEntry) { toast(t('toast.scormNoManifest'), 'error'); return; }
      const parsed = parseImsManifest(await mEntry.async('string'));
      if (!parsed.entryHref) { toast(t('toast.scormNoEntry'), 'error'); return; }

      const rootDir = mEntry.name.slice(0, mEntry.name.length - 'imsmanifest.xml'.length);
      const entries = [];
      zip.forEach((path, e) => { if (!e.dir) entries.push({ path, entry: e }); });

      clearPackageFiles(field.config.pkg);
      resetEditorPkgCache();
      const prefix = 'embed/' + uid() + '/';
      for (const { path, entry } of entries) {
        if (rootDir && !path.startsWith(rootDir)) continue;
        const internal = rootDir ? path.slice(rootDir.length) : path;
        if (!internal) continue;
        state.files.set(prefix + internal, await entry.async('blob'));
      }
      const org = parsed.organizations[0];
      const cfg = field.config;
      cfg.pkg = prefix;
      cfg.entryHref = parsed.entryHref;
      cfg.title = (org && org.title) || file.name.replace(/\.zip$/i, '');
      cfg.toc = (org && org.items) || [];
      markDirty();
      renderCanvas();
      renderPanel();
      toast(t('toast.imscpLoaded'), 'ok');
    } catch {
      toast(t('toast.webError'), 'error');
    }
  });
  inp.click();
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
  const { inp: color, wrap: colorWrap } = colorInput(cfg.color || '#1d2c42', v => { cfg.color = v; refreshShapePrev(field); markDirty(); });
  cont.appendChild(colorWrap);
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

function mediaFrameConfig(cont, field, rebuild = rebuildCanvasMedia) {
  const cfg = field.config;
  cont.appendChild(el('label', { class: 'f-label' }, t('cfg.strokeColor')));
  const { wrap: colorWrap } = colorInput(cfg.frameColor || '#1d2c42', v => {
    cfg.frameColor = v;
    rebuild(field);
    markDirty();
  });
  cont.appendChild(colorWrap);
  cont.appendChild(el('label', { class: 'f-label' }, t('cfg.strokeWidth')));
  const widthVal = Math.max(0, parseFloat(cfg.frameWidth) || 0);
  const widthRange = el('input', { type: 'range', min: '0', max: '14', step: '1', value: String(widthVal) });
  const widthNum = el('input', { type: 'number', min: '0', max: '14', step: '1', value: String(widthVal), style: 'width:84px' });
  const applyWidth = v => {
    v = Math.max(0, Math.min(14, parseFloat(v) || 0));
    cfg.frameWidth = v;
    widthRange.value = v;
    widthNum.value = v;
    rebuild(field);
    markDirty();
  };
  widthRange.addEventListener('input', () => applyWidth(widthRange.value));
  widthNum.addEventListener('input', () => applyWidth(widthNum.value));
  cont.appendChild(el('div', { class: 'rot-row' }, widthRange, widthNum, el('span', {}, 'px')));
}

const configForms = {

  line(cont, field) {
    const cfg = field.config;
    shapeStrokeConfig(cont, field);
    selectRow(cont, t('cfg.lineDir'), cfg.dir || 'h', [
      ['h', t('cfg.dirH')],
      ['v', t('cfg.dirV')],
      ['d1', t('cfg.dirD1')],
      ['d2', t('cfg.dirD2')]
    ], v => { cfg.dir = v; refreshShapePrev(field); });
    // Puntas de flecha: ninguna (línea), una o dos.
    const invertRow = el('div', {});
    selectRow(cont, t('cfg.lineHeads'), cfg.heads || 'none', [
      ['none', t('cfg.headsNone')],
      ['end', t('cfg.headsEnd')],
      ['both', t('cfg.headsBoth')]
    ], v => {
      cfg.heads = v;
      invertRow.style.display = v === 'end' ? '' : 'none';
      refreshShapePrev(field);
    });
    // Invertir el sentido: solo tiene efecto con una sola punta.
    checkRow(invertRow, t('cfg.arrowInvert'), Boolean(cfg.invert), v => {
      cfg.invert = v;
      refreshShapePrev(field);
    });
    if ((cfg.heads || 'none') !== 'end') invertRow.style.display = 'none';
    cont.appendChild(invertRow);
  },

  // Tipo heredado: se configura como una línea (los campos antiguos se migran a
  // `line` al cargar, pero por seguridad se reutiliza el mismo formulario).
  arrow(cont, field) {
    configForms.line(cont, field);
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
    const { inp: fillColor, wrap: fillColorWrap } = colorInput(cfg.fill || '#f8e3a1', v => { cfg.fill = v; refreshShapePrev(field); markDirty(); });
    const fillOp = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(cfg.fillOpacity ?? 1) });
    fillOp.addEventListener('input', () => { cfg.fillOpacity = parseFloat(fillOp.value); refreshShapePrev(field); markDirty(); });
    const fillRow = el('div', {},
      el('label', { class: 'f-label' }, t('cfg.fillColor')), fillColorWrap,
      el('label', { class: 'f-label' }, t('cfg.fillOpacity')), fillOp);
    if (!cfg.fill) fillRow.style.display = 'none';
    checkRow(cont, t('cfg.shapeFill'), Boolean(cfg.fill), v => {
      cfg.fill = v ? fillColor.value : '';
      fillRow.style.display = v ? '' : 'none';
      refreshShapePrev(field);
    });
    cont.appendChild(fillRow);

    // Esquinas redondeadas
    const brVal = parseFloat(cfg.borderRadius) || 0;
    const brRange = el('input', { type: 'range', min: '0', max: '50', step: '1', value: String(brVal) });
    const brNum = el('input', { type: 'number', min: '0', max: '50', step: '1', value: String(brVal), style: 'width:60px' });
    const applyBr = v => {
      v = Math.max(0, Math.min(50, parseFloat(v) || 0));
      cfg.borderRadius = v;
      brRange.value = v;
      brNum.value = v;
      refreshShapePrev(field);
      markDirty();
    };
    brRange.addEventListener('input', () => applyBr(brRange.value));
    brNum.addEventListener('input', () => applyBr(brNum.value));
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.borderRadius')));
    cont.appendChild(el('div', { class: 'rot-row' }, brRange, brNum, el('span', {}, '%')));

    checkRow(cont, t('cfg.forceSquare'), Boolean(cfg.square), v => {
      cfg.square = v;
      refreshShapePrev(field);
      markDirty();
    });
  },

  ellipse(cont, field) {
    configForms.rect(cont, field);
    checkRow(cont, t('cfg.forceCircle'), Boolean(field.config.circle), v => {
      field.config.circle = v;
      refreshShapePrev(field);
      markDirty();
    });
  },

  polygon(cont, field) {
    const cfg = field.config;

    // Número de lados
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.polygonSides')));
    const sidesVal = Math.max(3, Math.min(20, parseInt(cfg.sides, 10) || 5));
    const sidesRange = el('input', { type: 'range', min: '3', max: '20', step: '1', value: String(sidesVal) });
    const sidesNum = el('input', { type: 'number', min: '3', max: '20', step: '1', value: String(sidesVal), style: 'width:60px' });
    const applySides = v => {
      v = Math.max(3, Math.min(20, parseInt(v, 10) || 3));
      cfg.sides = v;
      sidesRange.value = v;
      sidesNum.value = v;
      refreshShapePrev(field);
      markDirty();
    };
    sidesRange.addEventListener('input', () => applySides(sidesRange.value));
    sidesNum.addEventListener('input', () => applySides(sidesNum.value));
    cont.appendChild(el('div', { class: 'rot-row' }, sidesRange, sidesNum));

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
    const { inp: fillColor, wrap: fillColorWrap } = colorInput(cfg.fill || '#f8e3a1', v => { cfg.fill = v; refreshShapePrev(field); markDirty(); });
    const fillOp = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(cfg.fillOpacity ?? 1) });
    fillOp.addEventListener('input', () => { cfg.fillOpacity = parseFloat(fillOp.value); refreshShapePrev(field); markDirty(); });
    const fillRow = el('div', {},
      el('label', { class: 'f-label' }, t('cfg.fillColor')), fillColorWrap,
      el('label', { class: 'f-label' }, t('cfg.fillOpacity')), fillOp);
    if (!cfg.fill) fillRow.style.display = 'none';
    checkRow(cont, t('cfg.shapeFill'), Boolean(cfg.fill), v => {
      cfg.fill = v ? fillColor.value : '';
      fillRow.style.display = v ? '' : 'none';
      refreshShapePrev(field);
    });
    cont.appendChild(fillRow);

    // Mantener la forma regular (si no, se deforma para llenar la caja)
    checkRow(cont, t('cfg.polygonRegular'), cfg.regular !== false, v => {
      cfg.regular = v;
      refreshShapePrev(field);
      markDirty();
    });
  },

  label(cont, field) {
    const cfg = field.config;
    const prev = () => canvas.querySelector(`.ed-field[data-id="${field.id}"] .ed-label-prev`);
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.labelText')));
    const syncPrev = () => { const p = prev(); if (p) p.innerHTML = mdToHtml(cfg.text || ''); };
    const ta = el('textarea', { class: 'md-textarea', rows: '4' });
    ta.value = cfg.text || '';
    ta.addEventListener('input', () => { cfg.text = ta.value; syncPrev(); markDirty(); });
    const preview = el('div', { class: 'md-preview', hidden: true });
    // Barra: negrita y cursiva (insertan marcas Markdown en la selección) y
    // conmutador entre edición Markdown y vista con los efectos aplicados.
    const wrapSel = mk => {
      const s = ta.selectionStart, e = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + mk + ta.value.slice(s, e) + mk + ta.value.slice(e);
      cfg.text = ta.value; syncPrev(); markDirty();
      ta.focus();
      ta.selectionStart = s + mk.length; ta.selectionEnd = e + mk.length;
    };
    const tbtn = (label, title, cls, fn) => {
      const b = el('button', { class: 'btn small md-btn ' + cls, type: 'button', title }, label);
      b.addEventListener('click', fn);
      return b;
    };
    const bBtn = tbtn('B', t('md.bold'), 'md-b', () => wrapSel('**'));
    const iBtn = tbtn('I', t('md.italic'), 'md-i', () => wrapSel('*'));
    let showingPreview = false;
    const toggle = el('button', { class: 'btn small ghost md-toggle', type: 'button' }, t('md.preview'));
    toggle.addEventListener('click', () => {
      showingPreview = !showingPreview;
      if (showingPreview) preview.innerHTML = mdToHtml(cfg.text || '');
      preview.hidden = !showingPreview;
      ta.hidden = showingPreview;
      bBtn.disabled = iBtn.disabled = showingPreview;
      toggle.textContent = showingPreview ? t('md.edit') : t('md.preview');
    });
    cont.appendChild(el('div', { class: 'md-bar' }, bBtn, iBtn, el('span', { class: 'md-bar-spacer' }), toggle));
    cont.appendChild(ta);
    cont.appendChild(preview);
    cont.appendChild(el('p', { class: 'cfg-hint' }, t('cfg.labelMdHint')));
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.labelColor')));
    const { wrap: labelColorWrap } = colorInput(cfg.color || '#1d2c42', v => {
      cfg.color = v;
      const p = prev();
      if (p) p.style.color = v;
      markDirty();
    });
    cont.appendChild(labelColorWrap);
    // Alineación del texto: izquierda, centro, derecha o justificado.
    selectRow(cont, t('cfg.labelAlign'), cfg.align || 'left', [
      ['left', t('cfg.alignLeft')],
      ['center', t('cfg.alignCenter')],
      ['right', t('cfg.alignRight')],
      ['justify', t('cfg.alignJustify')]
    ], v => {
      cfg.align = v;
      const p = prev();
      if (p) p.style.textAlign = v;
    });
    // Tamaño de texto (antes en el acordeón de diseño)
    const fsVal = field.fontScale || 1;
    const fsRange = el('input', { type: 'range', min: '0.6', max: '5', step: '0.1', value: String(fsVal) });
    const fsNum = el('input', { type: 'number', min: '0.1', max: '20', step: '0.1', value: String(fsVal), style: 'width:72px' });
    const applyFs = v => {
      v = Math.max(0.1, parseFloat(v) || 1);
      field.fontScale = v;
      fsRange.value = Math.min(v, 5);
      fsNum.value = v;
      const node = canvas.querySelector(`[data-id="${field.id}"]`);
      if (node) node.style.setProperty('--fs', v);
      markDirty();
    };
    fsRange.addEventListener('input', () => applyFs(fsRange.value));
    fsNum.addEventListener('input', () => applyFs(fsNum.value));
    cont.appendChild(el('label', { class: 'f-label' }, t('editor.fontSize')));
    cont.appendChild(el('div', { class: 'rot-row' }, fsRange, fsNum, el('span', {}, '×')));
    // Tipo de letra del texto (sobrescribe la fuente global de la ficha).
    const fontSel = fontSelect(field.fontFamily || '', id => {
      if (id) field.fontFamily = id; else delete field.fontFamily;
      const node = canvas.querySelector(`[data-id="${field.id}"]`);
      if (node) {
        if (id) node.style.setProperty('--field-font', fontStack(id));
        else node.style.removeProperty('--field-font');
      }
      markDirty();
    }, { inherit: true });
    cont.appendChild(el('label', { class: 'f-label' }, t('editor.font')));
    cont.appendChild(fontSel);
  },

  cover(cont, field) {
    const cfg = field.config;
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.coverColor')));
    const { wrap: coverColorWrap } = colorInput(cfg.color || '#ffffff', v => {
      cfg.color = v;
      const box = canvas.querySelector(`.ed-field[data-id="${field.id}"]`);
      if (box) box.style.background = v;
      markDirty();
    });
    cont.appendChild(coverColorWrap);
    cont.appendChild(el('p', { style: 'font-size:.85rem;color:var(--tinta-suave);margin-top:8px' },
      t('cfg.coverHint')));
  },

  image(cont, field) {
    const cfg = field.config;
    if (cfg.src && state.files.has(cfg.src)) {
      const prev = el('div', { class: 'img-field-preview' });
      prev.appendChild(el('img', { src: fileUrl(cfg.src), alt: '', class: 'img-field-thumb' }));
      cont.appendChild(prev);
    }
    const btn = iconBtn({ class: 'btn small image-change-btn', type: 'button' }, ICONS.image, t('cfg.changeImage'));
    btn.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/gif,image/webp';
      inp.addEventListener('change', () => {
        const f = inp.files[0]; if (!f) return;
        const ext = f.name.split('.').pop().toLowerCase() || 'png';
        const path = 'images/' + uid() + '.' + ext;
        if (cfg.src) { urls.delete(cfg.src); state.files.delete(cfg.src); }
        state.files.set(path, f);
        cfg.src = path;
        markDirty();
        renderCanvas();
        renderPanel();
      });
      inp.click();
    });
    cont.appendChild(btn);
    cont.appendChild(el('p', { style: 'font-size:.85rem;color:var(--tinta-suave);margin-top:8px' },
      t('cfg.imageHint')));
  },

  video(cont, field) {
    const cfg = field.config;
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.mediaSource')));
    const sel = el('select', {},
      el('option', { value: 'url' }, t('cfg.mediaSourceUrl')),
      el('option', { value: 'file' }, t('cfg.mediaSourceFile')));
    sel.value = cfg.provider || 'url';
    sel.addEventListener('change', () => { cfg.provider = sel.value; markDirty(); rebuildCanvasMedia(field); renderPanel(); });
    cont.appendChild(sel);
    if ((cfg.provider || 'url') === 'url') {
      cont.appendChild(el('label', { class: 'f-label' }, t('cfg.videoUrl')));
      const url = el('input', { type: 'url', value: cfg.url || '', placeholder: 'https://youtu.be/… , https://vimeo.com/… , …/video.mp4' });
      url.addEventListener('input', () => { cfg.url = url.value; markDirty(); });
      url.addEventListener('change', () => rebuildCanvasMedia(field));
      cont.appendChild(url);
      cont.appendChild(el('p', { class: 'cfg-hint' }, t('cfg.videoUrlHint')));
    } else {
      mediaFileRow(cont, field, 'video/mp4,video/webm,video/ogg', 'media', t('cfg.uploadVideo'));
    }
    checkRow(cont, t('cfg.mediaControls'), cfg.controls !== false, v => { cfg.controls = v; rebuildCanvasMedia(field); });
    checkRow(cont, t('cfg.mediaAutoplay'), Boolean(cfg.autoplay), v => { cfg.autoplay = v; rebuildCanvasMedia(field); });
    checkRow(cont, t('cfg.mediaMuted'), Boolean(cfg.muted), v => { cfg.muted = v; rebuildCanvasMedia(field); });
    checkRow(cont, t('cfg.mediaLoop'), Boolean(cfg.loop), v => { cfg.loop = v; rebuildCanvasMedia(field); });
    mediaTitleCaption(cont, field);
  },

  audio(cont, field) {
    const cfg = field.config;
    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.mediaSource')));
    const sel = el('select', {},
      el('option', { value: 'file' }, t('cfg.mediaSourceFile')),
      el('option', { value: 'url' }, t('cfg.mediaSourceUrl')));
    sel.value = cfg.provider || 'file';
    sel.addEventListener('change', () => { cfg.provider = sel.value; markDirty(); rebuildCanvasMedia(field); renderPanel(); });
    cont.appendChild(sel);
    if ((cfg.provider || 'file') === 'file') {
      mediaFileRow(cont, field, 'audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/webm', 'media', t('cfg.uploadAudio'));
    } else {
      cont.appendChild(el('label', { class: 'f-label' }, t('cfg.audioUrl')));
      const url = el('input', { type: 'url', value: cfg.url || '', placeholder: 'https://…/audio.mp3' });
      url.addEventListener('input', () => { cfg.url = url.value; markDirty(); });
      url.addEventListener('change', () => rebuildCanvasMedia(field));
      cont.appendChild(url);
    }
    checkRow(cont, t('cfg.mediaControls'), cfg.controls !== false, v => { cfg.controls = v; rebuildCanvasMedia(field); });
    checkRow(cont, t('cfg.mediaAutoplay'), Boolean(cfg.autoplay), v => { cfg.autoplay = v; rebuildCanvasMedia(field); });
    checkRow(cont, t('cfg.mediaLoop'), Boolean(cfg.loop), v => { cfg.loop = v; rebuildCanvasMedia(field); });
    mediaTitleCaption(cont, field);
  },

  record(cont, field) {
    const cfg = field.config;
    // Aviso: el audio se incrusta en la entrega; eso deshabilita la entrega por
    // enlace (queda solo la descarga del archivo).
    cont.appendChild(el('p', { class: 'settings-warning' },
      el('small', {}, t('cfg.recordLinkWarning'))));

    selectRow(cont, t('cfg.recordScoreMode'), cfg.scoreMode || 'manual', [
      ['manual', t('cfg.recordScoreManual')],
      ['participation', t('cfg.recordScoreParticipation')]
    ], v => { cfg.scoreMode = v; renderPanel(); });
    cont.appendChild(el('p', { class: 'cfg-hint' },
      (cfg.scoreMode || 'manual') === 'manual' ? t('cfg.recordManualHint') : t('cfg.recordParticipationHint')));

    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.recordMaxSec')));
    const sec = el('input', { type: 'number', min: '5', max: '600', step: '5', value: String(cfg.maxSec || 30) });
    sec.addEventListener('input', () => { cfg.maxSec = Math.max(5, Math.min(600, parseInt(sec.value, 10) || 30)); markDirty(); });
    cont.appendChild(sec);

    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.recordPrompt')));
    const pr = el('input', { type: 'text', value: cfg.prompt || '', maxlength: '200', placeholder: t('cfg.recordPromptPlaceholder') });
    pr.addEventListener('input', () => { cfg.prompt = pr.value; markDirty(); });
    pr.addEventListener('change', () => renderCanvas());
    cont.appendChild(pr);
  },

  embed(cont, field) {
    const cfg = field.config;
    // Tipo elegido + botón para volver a elegir (re-abre el selector inicial).
    const modeName = {
      url: t('cfg.embedUrlTitle'), html: t('cfg.embedHtmlTitle'),
      zip: t('cfg.embedZipTitle'), elpx: t('cfg.embedElpxTitle'),
      imscp: t('cfg.embedImscpTitle')
    }[cfg.mode] || '';
    cont.appendChild(el('div', { class: 'ed-acciones', style: 'margin-bottom:8px' },
      iconBtn({ class: 'btn small ghost', type: 'button',
        onclick: () => { cfg.mode = ''; markDirty(); renderPanel(); renderCanvas(); } },
        ICONS.arrowLeft, t('cfg.embedChangeType'))));
    cont.appendChild(el('p', { class: 'cfg-hint', style: 'margin-top:0' }, modeName));

    if (cfg.mode === 'url') {
      cont.appendChild(el('label', { class: 'f-label' }, t('cfg.embedUrl')));
      const url = el('input', { type: 'url', value: cfg.url || '', placeholder: 'https://…' });
      url.addEventListener('input', () => { cfg.url = url.value; markDirty(); rebuildCanvasMedia(field); });
      url.addEventListener('change', () => rebuildCanvasMedia(field));
      cont.appendChild(url);
    } else if (cfg.mode === 'html') {
      cont.appendChild(el('label', { class: 'f-label' }, t('cfg.embedHtml')));
      const ta = el('textarea', { rows: '5', placeholder: '<iframe src="…"></iframe>' });
      ta.value = cfg.html || '';
      ta.addEventListener('input', () => { cfg.html = ta.value; markDirty(); rebuildCanvasMedia(field); });
      ta.addEventListener('change', () => rebuildCanvasMedia(field));
      cont.appendChild(ta);
      cont.appendChild(el('p', { class: 'settings-warning' },
        el('small', {}, t('cfg.embedHtmlWarning'))));
    } else if (cfg.mode === 'zip' || cfg.mode === 'elpx' || cfg.mode === 'imscp') {
      if (cfg.pkg && cfg.entryHref) {
        cont.appendChild(el('p', { class: 'cfg-hint', style: 'margin:4px 0' }, '✓ ' + cfg.entryHref));
      } else {
        const introKey = cfg.mode === 'elpx' ? 'cfg.embedElpxIntro'
          : cfg.mode === 'imscp' ? 'cfg.embedImscpIntro' : 'cfg.embedZipIntro';
        cont.appendChild(el('p', { class: 'cfg-hint' }, t(introKey)));
      }
      const label = cfg.mode === 'elpx'
        ? (cfg.pkg ? t('cfg.embedReplaceElpx') : t('cfg.embedUploadElpx'))
        : cfg.mode === 'imscp'
          ? (cfg.pkg ? t('cfg.embedReplaceImscp') : t('cfg.embedUploadImscp'))
          : (cfg.pkg ? t('cfg.embedReplaceZip') : t('cfg.embedUploadZip'));
      const btn = iconBtn({ class: 'btn small media-upload-btn', type: 'button' }, ICONS.folderOpen, label);
      btn.addEventListener('click', () => cfg.mode === 'imscp'
        ? uploadImscpPackage(field)
        : uploadWebPackage(field, cfg.mode));
      cont.appendChild(btn);
      if (cfg.mode === 'imscp' && cfg.pkg) {
        checkRow(cont, t('cfg.scormShowMenu'), cfg.showMenu !== false, v => { cfg.showMenu = v; renderCanvas(); });
      }
    }
    // El SCORM/embed-paquete no usa el reconstructor de medios (no lo entiende):
    // su título/pie redibujan el lienzo.
    const isPkg = cfg.mode === 'zip' || cfg.mode === 'elpx' || cfg.mode === 'imscp';
    mediaFrameConfig(cont, field, isPkg ? (() => renderCanvas()) : rebuildCanvasMedia);
    if (isPkg) mediaTitleCaption(cont, field, () => renderCanvas());
    else mediaTitleCaption(cont, field);
  },

  scorm(cont, field) {
    const cfg = field.config;
    if (cfg.pkg && cfg.entryHref) {
      const n = scormScoCount(cfg.toc);
      cont.appendChild(el('p', { class: 'cfg-hint', style: 'margin:4px 0' },
        '✓ ' + (cfg.title || cfg.entryHref) + (n > 1 ? ` · ${t('cfg.scormScos', { n })}` : '')));
    } else {
      cont.appendChild(el('p', { class: 'cfg-hint' }, t('cfg.scormIntro')));
    }
    const btn = iconBtn({ class: 'btn small media-upload-btn', type: 'button' }, ICONS.folderOpen,
      cfg.pkg ? t('cfg.scormReplace') : t('cfg.scormUpload'));
    btn.addEventListener('click', () => uploadScormPackage(field));
    cont.appendChild(btn);

    selectRow(cont, t('cfg.scormScoreMode'), cfg.scoreMode || 'scorm', [
      ['scorm', t('cfg.scormScoreScorm')],
      ['completion', t('cfg.scormScoreCompletion')]
    ], v => { cfg.scoreMode = v; });

    // Re-dibuja el lienzo para que la vista en vivo refleje el cambio de menú.
    checkRow(cont, t('cfg.scormShowMenu'), cfg.showMenu !== false, v => { cfg.showMenu = v; renderCanvas(); });

    mediaFrameConfig(cont, field, () => renderCanvas());

    // Título y pie (con sus controles de texto), como en vídeo/audio/insertar.
    // El SCORM no usa el reconstructor de medios: redibuja el lienzo.
    mediaTitleCaption(cont, field, () => renderCanvas());
  },

  text(cont, field) {
    const cfg = field.config;
    // Todo lo de respuestas y corrección se oculta si el campo no puntúa.
    const wrap = el('div', { class: 'cfg-scoring-only' });
    if (field.noScore) wrap.style.display = 'none';
    optionListEditor(wrap, {
      label: t('cfg.answers'),
      items: () => cfg.answers,
      render: (row, item, i) => row.appendChild(textCell(item, v => { cfg.answers[i] = v; }, t('cfg.answerPlaceholder'))),
      add: () => cfg.answers.push(''),
      remove: i => cfg.answers.splice(i, 1),
      addLabel: t('cfg.addAnswer')
    });
    wrap.appendChild(el('label', { class: 'f-label' }, t('cfg.correction')));
    textNormOptions(wrap, cfg);
    cont.appendChild(wrap);
  },

  number(cont, field) {
    const cfg = field.config;
    // Respuesta correcta, tolerancia y nota: solo aplican si el campo puntúa.
    const wrap = el('div', { class: 'cfg-scoring-only' });
    if (field.noScore) wrap.style.display = 'none';
    wrap.appendChild(el('label', { class: 'f-label' }, t('cfg.correctAnswer')));
    wrap.appendChild(textCell(String(cfg.answer ?? ''), v => { cfg.answer = v; }, 'Ej.: 3,14'));
    wrap.appendChild(el('label', { class: 'f-label' }, t('cfg.tolerance')));
    wrap.appendChild(textCell(String(cfg.tolerance ?? 0), v => { cfg.tolerance = v; }, '0'));
    wrap.appendChild(el('p', { style: 'font-size:.82rem;color:var(--tinta-suave)' },
      t('cfg.numHint')));
    cont.appendChild(wrap);
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
    checkRow(cont, t('cfg.horizontalLayout'), Boolean(cfg.horizontal), v => { cfg.horizontal = v; });
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
    checkRow(cont, t('cfg.horizontalLayout'), Boolean(cfg.horizontal), v => { cfg.horizontal = v; });
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
    checkRow(cont, t('cfg.horizontalLayout'), Boolean(cfg.horizontal), v => { cfg.horizontal = v; });
  },

  checkbox(cont, field) {
    const cfg = field.config;
    if (!Array.isArray(cfg.boxes)) cfg.boxes = [];
    if (!Array.isArray(cfg.correct)) cfg.correct = [];

    // Modo: permitir marcar varias (varias correctas) o una sola.
    checkRow(cont, t('cfg.checkboxMultiple'), Boolean(cfg.multiple), v => {
      cfg.multiple = v;
      if (!v && cfg.correct.length > 1) cfg.correct = cfg.correct.slice(0, 1);
      renderCanvas();
      renderPanel();
    });

    optionListEditor(cont, {
      label: t('cfg.checkboxList', { n: cfg.boxes.length }),
      items: () => cfg.boxes,
      render: (row, b, i) => {
        let mark;
        if (cfg.multiple) {
          mark = el('input', { type: 'checkbox', class: 'marca' });
          mark.checked = cfg.correct.includes(b.id);
          mark.addEventListener('change', () => {
            const set = new Set(cfg.correct);
            mark.checked ? set.add(b.id) : set.delete(b.id);
            cfg.correct = [...set];
            markDirty();
            renderCanvas();
          });
        } else {
          mark = el('input', { type: 'radio', class: 'marca', name: 'cfg-cb-correct' });
          mark.checked = cfg.correct[0] === b.id;
          mark.addEventListener('change', () => {
            cfg.correct = [b.id];
            markDirty();
            renderCanvas();
          });
        }
        row.appendChild(mark);
        const locate = el('button', { class: 'cb-locate', type: 'button' }, t('cfg.checkboxItem', { n: i + 1 }));
        locate.addEventListener('click', () => selectCbBox(state.sel.pageIndex, field.id, b.id));
        row.appendChild(locate);
      },
      add: () => {
        state.activeTool = 'cbbox';
        refreshPaletteState();
        canvas.classList.add('drawing');
        toast(t('toast.drawCheckboxTip'));
      },
      remove: i => {
        const removed = cfg.boxes[i];
        cfg.boxes.splice(i, 1);
        if (removed) cfg.correct = cfg.correct.filter(id => id !== removed.id);
        renderCanvas();
      },
      addLabel: t('cfg.addCheckbox'),
      min: 0
    });

    if (cfg.multiple) checkRow(cont, t('cfg.partialScore'), Boolean(cfg.partial), v => { cfg.partial = v; });
    cont.appendChild(el('p', { class: 'cfg-hint' }, t('cfg.checkboxHint')));
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

  textboxes(cont, field) {
    const cfg = field.config;
    if (!Array.isArray(cfg.boxes)) cfg.boxes = [];

    optionListEditor(cont, {
      label: t('cfg.tbList', { n: cfg.boxes.length }),
      items: () => cfg.boxes,
      render: (row, b, i) => {
        if (!Array.isArray(b.answers)) b.answers = b.answers ? [String(b.answers)] : [''];
        const ans = b.answers.find(a => a && a.trim()) || t('cfg.tbNoAnswer');
        const locate = el('button', { class: 'cb-locate', type: 'button' }, t('cfg.tbItem', { n: i + 1, a: ans }));
        locate.addEventListener('click', () => selectTbBox(state.sel.pageIndex, field.id, b.id));
        row.appendChild(locate);
      },
      add: startTbBoxTool,
      remove: i => {
        cfg.boxes.splice(i, 1);
        renderCanvas();
      },
      addLabel: t('cfg.addTextbox'),
      min: 0
    });

    cont.appendChild(el('label', { class: 'f-label' }, t('cfg.correction')));
    textNormOptions(cont, cfg);
    cont.appendChild(el('p', { class: 'cfg-hint' }, t('cfg.tbHint')));
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
      if (!state.manifest.pages.length) { toast(t('toast.addPdfFirst'), 'error'); return; }
      state.pendingAmItem = item;
      state.pendingAmNext = next || null;
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
        if (left.src && state.files.has(left.src)) {
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
          if (right.src && state.files.has(right.src)) {
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
            if (item.src) { urls.delete(item.src); state.files.delete(item.src); }
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
    checkRow(cont, t('cfg.horizontalLayout'), Boolean(cfg.horizontal), v => { cfg.horizontal = v; });
    cont.appendChild(el('p', { style: 'font-size:.82rem;color:var(--tinta-suave);margin-top:8px' },
      t('cfg.orderHint')));
  },

  dragdrop(cont, field) {
    const cfg = field.config;
    if (!Array.isArray(cfg.pieces)) cfg.pieces = [];
    // El medio ya se eligió (renderFieldPanel filtra el caso sin elegir).
    const crops = cfg.mode === 'crops';

    // Cabecera con el medio elegido y opción de cambiarlo.
    const head = el('div', { class: 'ed-mode-head' },
      el('span', { class: 'ed-mode-head-label' },
        t('cfg.dragdropModeLabel') + ': ',
        el('strong', {}, crops ? t('cfg.dragdropCropsTitle') : t('cfg.dragdropLabelsTitle'))));
    const changeBtn = el('button', { class: 'btn small ghost', type: 'button' }, t('cfg.dragdropChangeMode'));
    changeBtn.addEventListener('click', () => { cfg.mode = ''; markDirty(); renderPanel(); renderCanvas(); });
    head.appendChild(changeBtn);
    cont.appendChild(head);

    // Zonas de destino (común a ambos modos).
    cont.appendChild(el('div', { class: 'zona-bloque' },
      crops ? t('cfg.dragdropZonesCrops', { n: cfg.zones.length }) : t('cfg.dragdropZones', { n: cfg.zones.length })));
    optionListEditor(cont, {
      label: crops ? t('cfg.zonesCrops') : t('cfg.zoneLabels'),
      items: () => cfg.zones,
      render: (row, zone, zi) => {
        if (!Array.isArray(zone.answers)) {
          zone.answers = zone.answer ? [String(zone.answer)] : [''];
          delete zone.answer;
        }
        if (crops) {
          // El resumen abre la zona, donde se marcan sus recortes.
          const n = (cfg.pieces || []).filter(p => p.zoneId === zone.id).length;
          const summary = el('button', { class: 'zone-summary', type: 'button' },
            zoneDisplayName(zone, zi) + (n ? ` · ${n} 🖼` : ''));
          summary.addEventListener('click', () => selectZone(state.sel.pageIndex, field.id, zone.id));
          row.appendChild(summary);
          return;
        }
        const textAnswers = zone.answers.filter(a => a && !a.startsWith('dtokens/'));
        const imgAnswers  = zone.answers.filter(a => a.startsWith('dtokens/'));
        // Resumen de la zona: se edita seleccionándola (panel propio, una etiqueta por fila).
        const labelText = textAnswers.join(' · ') || t('cfg.zoneNoLabel');
        const summary = el('button', { class: 'zone-summary', type: 'button' }, labelText);
        summary.addEventListener('click', () => selectZone(state.sel.pageIndex, field.id, zone.id));
        row.appendChild(summary);
        imgAnswers.forEach(p => {
          if (state.files.has(p)) row.appendChild(el('img', { src: fileUrl(p), class: 'tok-thumb-xs', alt: '🖼', title: p }));
        });
      },
      add: startZoneTool,
      remove: i => {
        const zid = cfg.zones[i]?.id;
        cfg.zones.splice(i, 1);
        (cfg.pieces || []).forEach(p => { if (p.zoneId === zid) p.zoneId = ''; });
        renderCanvas();
      },
      addLabel: t('cfg.drawZone'),
      min: 0
    });

    if (crops) {
      // Los recortes se marcan dentro de cada zona (igual que las etiquetas se
      // escriben dentro de cada zona en el modo clásico): abre una zona arriba.
      // El color del hueco vacío está en la sección «Diseño».
      cont.appendChild(el('p', { class: 'cfg-hint' }, t('cfg.cropsFieldHint')));
    } else {
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
  }
};

// Tarjeta de elección de medio para "arrastrar a zonas". Se presenta como una
// opción seleccionable (círculo tipo radio + flecha) para que se vea que hay
// que elegir una.
function modeChoiceCard(title, desc, onClick) {
  const arrow = el('span', { class: 'ed-mode-card-arrow' });
  arrow.innerHTML = ICONS.chevronRight;
  const card = el('button', { class: 'ed-mode-card', type: 'button' },
    el('span', { class: 'ed-mode-card-radio' }),
    el('span', { class: 'ed-mode-card-body' },
      el('span', { class: 'ed-mode-card-title' }, title),
      el('span', { class: 'ed-mode-card-desc' }, desc)),
    arrow);
  card.addEventListener('click', onClick);
  return card;
}

// Etiqueta resumida de una zona (primera respuesta o icono de imagen).
function firstAnswerLabel(answers) {
  const first = (answers || []).find(Boolean) || '';
  return first.startsWith('dtokens/') ? '🖼' : first;
}

// Nombre visible de una zona en modo "crops": su nombre propio o "Zona N".
function zoneDisplayName(zone, index) {
  if (zone.name && zone.name.trim()) return zone.name.trim();
  const txt = (zone.answers || []).find(a => a && !a.startsWith('dtokens/'));
  return txt || t('cfg.zoneN', { n: index + 1 });
}

// Lista de todos los campos de la ficha con filtro de búsqueda.
let _fieldListQuery = '';

function renderFieldList() {
  const allFields = state.manifest.pages.flatMap(p => p.fields || []);
  if (!allFields.length) return;

  const box = el('div', { class: 'lista-campos' });

  // Cabecera con título y barra de filtro
  const header = el('div', { class: 'lista-campos-header' });
  header.appendChild(el('h3', {}, t('editor.fieldsTitle')));

  const filterWrap = el('div', { class: 'lista-campos-filter' });
  const filterIcon = el('span', { class: 'lista-campos-icon', 'aria-hidden': 'true' });
  filterIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
  filterWrap.appendChild(filterIcon);
  const filterInput = el('input', {
    type: 'search', class: 'lista-campos-input',
    placeholder: t('dlg.search.placeholder'), value: _fieldListQuery,
    autocomplete: 'off', spellcheck: 'false'
  });
  const clearBtn = el('button', { class: 'lista-campos-clear', type: 'button', 'aria-label': 'Borrar búsqueda', hidden: '' }, '✕');
  clearBtn.addEventListener('click', () => {
    filterInput.value = '';
    _fieldListQuery = '';
    clearBtn.hidden = true;
    filterInput.focus();
    renderItems();
  });
  filterInput.addEventListener('input', () => {
    _fieldListQuery = filterInput.value;
    clearBtn.hidden = !filterInput.value;
    renderItems();
  });
  if (_fieldListQuery) clearBtn.hidden = false;
  filterWrap.appendChild(filterInput);
  filterWrap.appendChild(clearBtn);
  header.appendChild(filterWrap);
  box.appendChild(header);

  const listEl = el('div', { class: 'lista-campos-items' });
  box.appendChild(listEl);

  function renderItems() {
    listEl.innerHTML = '';
    const q = normalizeStr(_fieldListQuery);
    let shown = 0;
    state.manifest.pages.forEach((page, pi) => {
      page.fields.forEach(field => {
        const decor = Boolean(FIELD_TYPES[field.type]?.decor);
        const resumen = field.type === 'label'
          ? (field.config.text || fieldTypeName(field.type))
          : (expectedText(field) || fieldTypeName(field.type));
        if (q && !normalizeStr(fieldTypeName(field.type)).includes(q) && !normalizeStr(resumen).includes(q)) return;
        shown++;
        const fieldGlyph = el('span', { class: 'g' });
        fieldGlyph.innerHTML = FIELD_TYPES[field.type]?.glyph || '?';
        const isSel = state.sel?.kind === 'field' && state.sel.fieldId === field.id;
        const item = el('div', { class: 'item' + (isSel ? ' sel' : '') },
          fieldGlyph,
          el('span', { class: 'resumen' }, `P${pi + 1} · ${resumen}`),
          decor ? null : el('span', { class: 'pts' }, field.noScore ? '—' : field.points + ' pt'));
        item.addEventListener('click', () => {
          selectField(pi, field.id);
          canvas.querySelector(`[data-id="${field.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
        listEl.appendChild(item);
      });
    });
    if (q && !shown) {
      listEl.appendChild(el('div', { class: 'buscar-vacio' }, t('dlg.search.empty')));
    }
  }

  renderItems();
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
  $('#ajCryptoPassword').disabled = !enabled;
}

// Pestañas del diálogo de ajustes: muestra una sección a la vez.
function activateSettingsTab(name) {
  const dlg = $('#dlgAjustes');
  dlg.querySelectorAll('.settings-tab').forEach(tab => {
    const on = tab.dataset.tab === name;
    tab.classList.toggle('is-active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  dlg.querySelectorAll('.settings-panel').forEach(p => {
    const on = p.dataset.panel === name;
    p.classList.toggle('is-active', on);
    p.hidden = !on;
  });
}
document.querySelectorAll('#dlgAjustes .settings-tab').forEach(tab => {
  tab.addEventListener('click', () => activateSettingsTab(tab.dataset.tab));
});

// Rellena (una vez) el desplegable de fuente global con las opciones del catálogo.
(function fillFontSelect() {
  const sel = $('#ajFont');
  if (!sel) return;
  FONT_OPTIONS.forEach(f => sel.appendChild(el('option', { value: f.id, style: `font-family:${f.stack}` },
    f.id === 'mono' ? t('editor.fontMono') : f.name)));
})();

function openSettings(afterSave, initialTab = 'basic') {
  const dlg = $('#dlgAjustes');
  dlg._afterSave = afterSave || null;
  activateSettingsTab(initialTab);
  fillTimeSelects();
  $('#ajFont').value = state.manifest.settings.fontFamily || DEFAULT_FONT;
  $('#ajTitulo').value = state.manifest.title || '';
  $('#ajAutor').value = state.manifest.author || '';
  $('#ajInstrucciones').value = state.manifest.instructions || '';
  $('#ajNota').checked = state.manifest.settings.showScore !== false;
  $('#ajCorreccion').checked = state.manifest.settings.showCorrection !== false;
  $('#ajBarajar').checked = Boolean(state.manifest.settings.shuffle);
  $('#ajIntentos').value = String(state.manifest.settings.maxAttempts || 0);
  $('#ajCifrarEntregas').checked = state.manifest.settings.encryptSubmissions !== false;
  $('#ajCryptoPassword').value = state.submissionCryptoPassword;
  updateCryptoSettingsUi();
  const acc = state.manifest.access || {};
  setDateTime(acc.desde, 'ajDesde', '08', '00');
  setDateTime(acc.hasta, 'ajHasta', '23', '59');
  $('#ajAutoEntrega').checked = Boolean(acc.autoEntrega);
  $('#ajTiempo').value = String(acc.tiempoLimite || 0);
  $('#ajPassword').value = acc.password || '';
  const scorm = state.manifest.settings.scorm || {};
  $('#ajScormStatus').value = scorm.statusMode === 'completion' ? 'completion' : 'score';
  $('#ajScormMastery').value = String(scorm.masteryScore != null ? scorm.masteryScore : 50);
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
    activateSettingsTab('correction');
    $('#ajCryptoPassword').focus();
    return;
  }
  if ($('#ajCifrarEntregas').checked && accessPassword && cryptoPassword && accessPassword === cryptoPassword) {
    ev.preventDefault();
    toast(t('crypto.sameAsAccess'), 'error');
    activateSettingsTab('correction');
    $('#ajCryptoPassword').focus();
  }
});

$('#dlgAjustes')?.addEventListener('close', () => {
  const dlg = $('#dlgAjustes');
  if (dlg.returnValue !== 'ok') return;
  const newTitle = $('#ajTitulo').value.trim();
  state.manifest.title = newTitle;
  titleInput.value = newTitle;
  state.manifest.author = $('#ajAutor').value.trim();
  state.manifest.instructions = $('#ajInstrucciones').value.trim();
  state.manifest.settings.showScore = $('#ajNota').checked;
  state.manifest.settings.showCorrection = $('#ajCorreccion').checked;
  state.manifest.settings.shuffle = $('#ajBarajar').checked;
  state.manifest.settings.maxAttempts = Math.max(0, parseInt($('#ajIntentos').value, 10) || 0);
  state.manifest.settings.fontFamily = $('#ajFont').value;
  canvas.style.setProperty('--ficha-font', fontStack(state.manifest.settings.fontFamily));
  state.manifest.settings.encryptSubmissions = $('#ajCifrarEntregas').checked;
  state.submissionCryptoPassword = state.manifest.settings.encryptSubmissions ? $('#ajCryptoPassword').value : '';
  if (!state.manifest.settings.encryptSubmissions) delete state.manifest.submissionCrypto;
  state.manifest.access = {
    desde: getDateTime('ajDesde'),
    hasta: getDateTime('ajHasta'),
    autoEntrega: $('#ajAutoEntrega').checked,
    tiempoLimite: Math.max(0, parseInt($('#ajTiempo').value, 10) || 0),
    password: $('#ajPassword').value.trim()
  };
  state.manifest.settings.scorm = {
    statusMode: $('#ajScormStatus').value === 'completion' ? 'completion' : 'score',
    masteryScore: Math.max(0, Math.min(100, parseInt($('#ajScormMastery').value, 10) || 0))
  };
  markDirty();
  const cb = dlg._afterSave;
  dlg._afterSave = null;
  // Solo es una función cuando openSettings se llamó con un callback (p. ej.
  // exportZip); al abrir con el botón ⚙️, el primer argumento es el evento.
  if (typeof cb === 'function') cb();
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
  const tryBtn = $('#btnProbarEnlace');
  if (tryBtn) tryBtn.href = link;
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
  if (!state.manifest.title.trim()) problems.push(t('validate.noTitle'));
  if (!state.manifest.pages.length) problems.push(t('validate.noPages'));
  if (!state.manifest.pages.some(p => p.fields.length)) problems.push(t('validate.noFields'));
  state.manifest.pages.forEach((p, pi) => {
    p.fields.forEach(f => {
      if (FIELD_TYPES[f.type]?.decor) return; // los decorativos no necesitan respuesta
      // La grabación de voz no tiene respuesta correcta (se valora a mano o por
      // participación): no requiere comprobación de solución.
      if (!f.noScore && f.type !== 'record') {
        const e = expectedText(f);
        if (!e || !e.trim()) problems.push(t('validate.noAnswer', { n: pi + 1, type: fieldTypeName(f.type) }));
      }
      if (f.type === 'dragdrop' && !(f.config.zones || []).length) {
        problems.push(t('validate.noZones', { n: pi + 1 }));
      }
      if (f.type === 'dragdrop' && f.config.mode === 'crops'
          && !(f.config.pieces || []).some(pc => pc.zoneId)) {
        problems.push(t('validate.noPieces', { n: pi + 1 }));
      }
      if (f.type === 'scorm' && (!f.config.pkg || !f.config.entryHref)) {
        problems.push(t('validate.noScormPkg', { n: pi + 1 }));
      }
    });
  });
  return problems;
}

// Solo los ficheros referenciados por el manifiesto (descarta huérfanos, p. ej.
// recortes de campos borrados o paquetes SCORM sustituidos). Se calcula sobre el
// manifiesto en claro, ya que el de exportación puede ir cifrado y ocultar las
// rutas.
function referencedFiles() {
  return usedFiles(state.manifest, state.files);
}

// Valida la ficha y prepara el manifiesto de exportación (cifrado de entrega y
// contraseña de acceso). Devuelve el manifiesto listo, o null si no se puede
// continuar (sin páginas, o falta la contraseña de cifrado: abre Ajustes y
// reintenta con `retry`). Lo comparten la exportación a ZIP y a web.
async function prepareExportManifest(retry) {
  state.manifest.title = titleInput.value.trim();
  const problems = validate();
  if (problems.length) {
    const blocking = !state.manifest.pages.length;
    const msg = t('validate.review', { problems: problems.join('\n· ') });
    if (blocking) { window.alert(msg); return null; }
    if (!window.confirm(msg + t('validate.anyway'))) return null;
  }
  state.manifest.lang = getLang();
  let exportManifest = JSON.parse(JSON.stringify(state.manifest));
  if (exportManifest.settings?.encryptSubmissions !== false) {
    if (!state.submissionCryptoPassword) {
      toast(t('crypto.passwordRequired'), 'error');
      openSettings(retry, 'correction');
      $('#ajCryptoPassword').focus();
      return null;
    }
    exportManifest.submissionCrypto = await createSubmissionCrypto(state.submissionCryptoPassword);
  } else {
    delete exportManifest.submissionCrypto;
  }
  if (exportManifest.access?.password) {
    exportManifest = await encryptManifestForStudent(exportManifest, exportManifest.access.password);
  }
  return exportManifest;
}

async function buildOwpkgBlob() {
  const exportManifest = await prepareExportManifest(exportZip);
  if (!exportManifest) return null;
  toast(t('toast.generating'));
  const clean = referencedFiles();
  const blob = await exportFichaZip({ manifest: exportManifest, files: clean });
  state.files = clean;
  return blob;
}

async function exportZip() {
  try {
    const blob = await buildOwpkgBlob();
    if (!blob) return;

    if (openFileHandle) {
      try {
        const writable = await openFileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        state.dirty = false;
        toast(t('toast.exported'), 'ok');
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
        openFileHandle = null;
      }
    }

    const name = openFileName || (slugify(state.manifest.title || 'ficha') + '.owpkg');
    downloadBlob(blob, name);
    state.dirty = false;
    toast(t('toast.exported'), 'ok');
  } catch (e) {
    console.error(e);
    toast(t('toast.exportError', { msg: e.message }), 'error');
  }
}

async function exportZipAs() {
  try {
    const blob = await buildOwpkgBlob();
    if (!blob) return;

    const suggestedName = openFileName || (slugify(state.manifest.title || 'ficha') + '.owpkg');

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: 'OpenWorksheets', accept: { 'application/zip': ['.owpkg'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        openFileHandle = handle;
        openFileName = handle.name;
        state.dirty = false;
        toast(t('toast.exported'), 'ok');
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
        // Si falla caemos a la descarga
      }
    }

    downloadBlob(blob, suggestedName);
    state.dirty = false;
    toast(t('toast.exported'), 'ok');
  } catch (e) {
    console.error(e);
    toast(t('toast.exportError', { msg: e.message }), 'error');
  }
}

// Exporta la ficha como página web autónoma (ZIP para subir a un sitio web). A
// diferencia del SCORM conserva el cifrado de entrega y la contraseña de acceso.
async function exportWeb() {
  try {
    const exportManifest = await prepareExportManifest(exportWeb);
    if (!exportManifest) return;
    toast(t('toast.generatingWeb'));
    const blob = await exportWebPackage({ manifest: exportManifest, files: referencedFiles() });
    downloadBlob(blob, slugify(state.manifest.title || 'ficha') + '-web.zip');
    state.dirty = false;
    toast(t('toast.webExported'), 'ok');
  } catch (e) {
    console.error(e);
    toast(t('toast.exportError', { msg: e.message }), 'error');
  }
}

async function exportImscp() {
  try {
    const exportManifest = await prepareExportManifest(exportImscp);
    if (!exportManifest) return;
    toast(t('toast.generatingImscp'));
    const blob = await exportImscpPackage({ manifest: exportManifest, files: referencedFiles() });
    downloadBlob(blob, slugify(state.manifest.title || 'ficha') + '-imscp.zip');
    state.dirty = false;
    toast(t('toast.imscpExported'), 'ok');
  } catch (e) {
    console.error(e);
    toast(t('toast.exportError', { msg: e.message }), 'error');
  }
}

// Exporta la ficha como paquete SCORM 1.2 (ZIP para Moodle u otro LMS). El
// saneado del manifiesto (sin cifrado de entrega ni contraseña, que en SCORM
// gestiona el LMS) lo hace exportScormPackage.
async function exportScorm() {
  state.manifest.title = titleInput.value.trim();
  const problems = validate();
  if (problems.length) {
    const blocking = !state.manifest.pages.length;
    const msg = t('validate.review', { problems: problems.join('\n· ') });
    if (blocking) { window.alert(msg); return; }
    if (!window.confirm(msg + t('validate.anyway'))) return;
  }
  state.manifest.lang = getLang();
  try {
    toast(t('toast.generatingScorm'));
    const scorm = state.manifest.settings.scorm || { statusMode: 'score', masteryScore: 50 };
    const blob = await exportScormPackage({ manifest: state.manifest, files: referencedFiles() }, scorm);
    downloadBlob(blob, slugify(state.manifest.title || 'ficha') + '-scorm12.zip');
    state.dirty = false;
    toast(t('toast.scormExported'), 'ok');
  } catch (e) {
    console.error(e);
    toast(t('toast.exportError', { msg: e.message }), 'error');
  }
}

// Migra los campos «Flecha» (tipo heredado) al tipo unificado «Línea / Flecha»
// (line) con puntas: una punta, o dos si tenía `double`. Transparente: el campo
// se ve y comporta igual; al guardar queda ya como `line`.
function migrateArrowFields(manifest) {
  for (const page of manifest.pages || []) {
    for (const f of page.fields || []) {
      if (f.type !== 'arrow') continue;
      f.type = 'line';
      const c = f.config || (f.config = {});
      c.heads = c.double ? 'both' : 'end';
      delete c.double;
    }
  }
}

async function openZipFile(file, handle = null) {
  try {
    const ficha = await importFichaZip(file);
    if (isEncryptedManifest(ficha.manifest)) {
      const password = window.prompt(t('editor.encryptedPrompt'));
      if (!password) return;
      ficha.manifest = await decryptManifestForStudent(ficha.manifest, password, { keepPassword: true });
    }
    openFileHandle = handle || null;
    openFileName = file.name || null;
    state.manifest = ficha.manifest;
    migrateArrowFields(state.manifest);
    state.files = ficha.files;
    state.submissionCryptoPassword = '';
    urls.forEach(u => URL.revokeObjectURL(u));
    urls.clear();
    // Recalcular numeración de páginas para nuevas incorporaciones.
    state.pageSeq = 1 + state.manifest.pages.reduce((max, p) => {
      const m = /page-(\d+)\./.exec(p.image);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    state.sel = null;
    state.activeTool = null;
    titleInput.value = state.manifest.title || '';
    state.dirty = false;
    zoomCtl.set(1); // al abrir una ficha, zoom al 100 %
    autoThumbs(); // mostrar la tira si la ficha tiene más de una página
    renderCanvas();
    renderPanel();
    refreshPaletteState();
    resetHistory();
    toast(t('toast.fichaLoaded', { title: state.manifest.title || file.name }), 'ok');
  } catch (e) {
    console.error(e);
    toast(e.message, 'error');
  }
}

async function mergeZipFile(file, insertAt) {
  try {
    const ficha = await importFichaZip(file);
    if (isEncryptedManifest(ficha.manifest)) {
      const password = window.prompt(t('editor.encryptedPrompt'));
      if (!password) return;
      ficha.manifest = await decryptManifestForStudent(ficha.manifest, password, { keepPassword: true });
    }
    const pfx = `mrg${Date.now()}`;
    const remap = new Map();
    ficha.files.forEach((blob, path) => {
      const newPath = /^pages\/page-\d+\./.test(path)
        ? path.replace(/^pages\/page-\d+(\.[^.]+)$/, (_, ext) => `pages/page-${state.pageSeq++}${ext}`)
        : `${pfx}-${path}`;
      remap.set(path, newPath);
      state.files.set(newPath, blob);
    });
    const newPages = ficha.manifest.pages.map(page => ({
      ...page,
      image: remap.get(page.image) ?? page.image,
      fields: page.fields.map(f => {
        const configSrc = f.config?.src;
        return {
          ...f,
          id: `f${Date.now()}-${Math.random().toString(36).slice(2)}`,
          ...(f.config ? {
            config: {
              ...f.config,
              ...(configSrc ? { src: remap.get(configSrc) ?? configSrc } : {})
            }
          } : {})
        };
      })
    }));
    if (insertAt != null) state.manifest.pages.splice(insertAt, 0, ...newPages);
    else state.manifest.pages.push(...newPages);
    migrateArrowFields(state.manifest);
    markDirty();
    renderCanvas();
    renderPanel();
    toast(t('toast.fichaLoaded', { title: ficha.manifest.title || file.name }), 'ok');
  } catch (e) {
    console.error(e);
    toast(e.message, 'error');
  }
}

// ---------- Vista previa ----------

function openPreview() {
  state.manifest.title = titleInput.value.trim();
  if (!state.manifest.pages.length) { toast(t('toast.addPageFirst'), 'error'); return; }
  const pageIndex = currentEditorPageIndex();
  const overlay = el('div', { class: 'prev-overlay' });
  const root = el('div', {});
  const cerrar = iconBtn({ class: 'btn small' }, ICONS.arrowLeft, t('preview.back'));
  overlay.appendChild(el('div', { class: 'prev-aviso' }, t('preview.banner'), cerrar));
  overlay.appendChild(root);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  state.preview = mountPlayer(root, { manifest: JSON.parse(JSON.stringify(state.manifest)), files: state.files }, { preview: true });
  // Abrir la vista previa en la misma página que se está editando.
  scrollPreviewToPage(overlay, pageIndex);
  cerrar.addEventListener('click', () => {
    // Al volver al editor, situarlo en la misma página que se veía en la previa.
    const backIndex = currentPreviewPageIndex(overlay);
    state.preview.destroy();
    state.preview = null;
    overlay.remove();
    document.body.style.overflow = '';
    requestAnimationFrame(() => scrollEditorToPage(backIndex));
  });
}

// Página más visible en el overlay de la vista previa (centro del área útil,
// descontando la banda superior fija), para reflejarla al volver al editor.
function currentPreviewPageIndex(overlay) {
  const pages = [...overlay.querySelectorAll('.wpf-page')];
  if (pages.length <= 1) return 0;
  const oRect = overlay.getBoundingClientRect();
  const banner = overlay.querySelector('.prev-aviso')?.offsetHeight || 0;
  const mid = oRect.top + banner + (oRect.height - banner) / 2;
  let best = 0, bestDist = Infinity;
  pages.forEach((p, i) => {
    const r = p.getBoundingClientRect();
    const dist = mid < r.top ? r.top - mid : (mid > r.bottom ? mid - r.bottom : 0);
    if (dist < bestDist) { bestDist = dist; best = i; }
  });
  return best;
}

// Desplaza el lienzo del editor hasta la página indicada (descontando la barra
// de zoom fija superior).
function scrollEditorToPage(idx) {
  if (!idx) { canvas.scrollTop = 0; return; }
  const page = canvas.querySelector(`.wpf-page[data-page="${idx}"]`);
  if (!page) return;
  const target = page.closest('.ed-pagebox') || page;
  const offset = (canvas.querySelector('.ed-zoom-wrap')?.offsetHeight || 0) + 8;
  const cRect = canvas.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  canvas.scrollTop += (tRect.top - cRect.top) - offset;
}

// Página del lienzo de edición más visible (centro del visor), para que la
// vista previa arranque en el mismo punto en lugar de siempre en la página 1.
function currentEditorPageIndex() {
  const pages = [...canvas.querySelectorAll('.wpf-page[data-page]')];
  if (pages.length <= 1) return 0;
  const cRect = canvas.getBoundingClientRect();
  const mid = cRect.top + cRect.height / 2;
  let best = 0, bestDist = Infinity;
  for (const p of pages) {
    const r = p.getBoundingClientRect();
    const dist = mid < r.top ? r.top - mid : (mid > r.bottom ? mid - r.bottom : 0);
    if (dist < bestDist) { bestDist = dist; best = Number(p.dataset.page) || 0; }
  }
  return best;
}

// Desplaza el overlay de la vista previa hasta la página indicada. Las imágenes
// de fondo cargan de forma asíncrona, así que reposiciona a medida que se
// conoce la altura de las páginas anteriores.
function scrollPreviewToPage(overlay, idx) {
  if (!idx) return; // página 1: ya está arriba
  const go = () => {
    const target = overlay.querySelectorAll('.wpf-page')[idx];
    if (!target) return;
    const offset = overlay.querySelector('.prev-aviso')?.offsetHeight || 0;
    const oRect = overlay.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    overlay.scrollTop += (tRect.top - oRect.top) - offset;
  };
  requestAnimationFrame(go);
  const imgs = [...overlay.querySelectorAll('.wpf-page img.fondo')].slice(0, idx + 1);
  imgs.filter(im => !im.complete).forEach(im => im.addEventListener('load', go, { once: true }));
}

// ---------- Arranque ----------

titleInput.addEventListener('input', () => { state.manifest.title = titleInput.value; markDirty(); });

// ---------- Menú «Archivo» ----------
// La barra es solo de iconos, así que las operaciones de archivo (nueva, abrir,
// añadir páginas y guardar) se agrupan en un único botón con menú desplegable.
const menuArchivo = $('#menuArchivo');
const btnArchivo = $('#btnArchivo');
const menuArchivoList = menuArchivo.querySelector('.topbar-menu-list');

function closeFileMenu() {
  if (menuArchivoList.hidden) return;
  menuArchivoList.hidden = true;
  btnArchivo.setAttribute('aria-expanded', 'false');
  document.removeEventListener('click', onDocClickFileMenu, true);
  document.removeEventListener('keydown', onKeyFileMenu, true);
}
function openFileMenu() {
  menuArchivoList.hidden = false;
  btnArchivo.setAttribute('aria-expanded', 'true');
  document.addEventListener('click', onDocClickFileMenu, true);
  document.addEventListener('keydown', onKeyFileMenu, true);
}
function onDocClickFileMenu(e) {
  if (!menuArchivo.contains(e.target)) closeFileMenu();
}
function onKeyFileMenu(e) {
  if (e.key === 'Escape') { closeFileMenu(); btnArchivo.focus(); }
}
btnArchivo.addEventListener('click', () => {
  menuArchivoList.hidden ? openFileMenu() : closeFileMenu();
});
// Cada opción ejecuta su acción y cierra el menú.
const fileMenuItem = (id, fn) => $(id).addEventListener('click', () => { closeFileMenu(); fn(); });

// El menú «Archivo» reemplaza la ficha del editor (abrir o empezar de cero); para
// añadir páginas a la ficha actual están los botones entre páginas.
function resetWorksheet() {
  clearOpenFile();
  urls.forEach(u => URL.revokeObjectURL(u));
  urls.clear();
  state.manifest = newManifest();
  state.files = new Map();
  state.pageSeq = 1;
  state.sel = null;
  state.activeTool = null;
  state.submissionCryptoPassword = '';
  titleInput.value = '';
  state.dirty = false;
  resetHistory();
}
// Solo pide confirmación si hay cambios sin guardar que se perderían. Una ficha
// recién cargada o ya guardada (state.dirty = false) se reemplaza sin avisar.
function confirmDiscardCurrent() {
  return !state.dirty || window.confirm(t('editor.confirmReplace'));
}

fileMenuItem('#miBlank', () => {
  if (!confirmDiscardCurrent()) return;
  resetWorksheet();
  renderCanvas();
  renderPanel();
  refreshPaletteState();
  addBlankPage();
});

fileMenuItem('#miAddPdf', () => {
  const input = $('#inputPaginas');
  const handler = async e => {
    const files = Array.from(e.target.files);
    e.target.value = '';
    input.removeEventListener('change', handler);
    if (!files.length || !confirmDiscardCurrent()) return;
    resetWorksheet();
    renderCanvas();
    renderPanel();
    refreshPaletteState();
    await addFiles(files);
  };
  input.addEventListener('change', handler);
  input.click();
});
fileMenuItem('#miOpenZip', async () => {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'OpenWorksheets', accept: { 'application/zip': ['.owpkg', '.zip'] } }],
        multiple: false
      });
      if (!confirmDiscardCurrent()) return;
      const file = await handle.getFile();
      await openZipFile(file, handle);
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e);
    }
  } else {
    $('#inputZip').click();
  }
});
// «Exportar a PDF» reutiliza el flujo de impresión: el diálogo del navegador
// permite elegir «Guardar como PDF» como destino.
fileMenuItem('#miPdf', printWorksheet);
fileMenuItem('#miSaveScorm', exportScorm);
fileMenuItem('#miSaveImscp', exportImscp);
fileMenuItem('#miSaveWeb', exportWeb);
fileMenuItem('#miSaveZip', exportZip);
fileMenuItem('#miSaveZipAs', exportZipAs);
fileMenuItem('#miAjustes', openSettings);

// ---------- Menú Utilidades ----------

const menuUtilidades = $('#menuUtilidades');
const btnUtilidades = $('#btnUtilidades');
const menuUtilidadesList = menuUtilidades.querySelector('.topbar-menu-list');

function closeUtilMenu() {
  if (menuUtilidadesList.hidden) return;
  menuUtilidadesList.hidden = true;
  btnUtilidades.setAttribute('aria-expanded', 'false');
  document.removeEventListener('click', onDocClickUtilMenu, true);
  document.removeEventListener('keydown', onKeyUtilMenu, true);
}
function openUtilMenu() {
  menuUtilidadesList.hidden = false;
  btnUtilidades.setAttribute('aria-expanded', 'true');
  document.addEventListener('click', onDocClickUtilMenu, true);
  document.addEventListener('keydown', onKeyUtilMenu, true);
}
function onDocClickUtilMenu(e) {
  if (!menuUtilidades.contains(e.target)) closeUtilMenu();
}
function onKeyUtilMenu(e) {
  if (e.key === 'Escape') { closeUtilMenu(); btnUtilidades.focus(); }
}
btnUtilidades.addEventListener('click', () => {
  menuUtilidadesList.hidden ? openUtilMenu() : closeUtilMenu();
});
const utilMenuItem = (id, fn) => $(id).addEventListener('click', () => { closeUtilMenu(); fn(); });

// ---------- Búsqueda de campos ----------

function normalizeStr(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function fieldSearchText(field) {
  const cfg = field.config || {};
  const parts = [];
  if (cfg.text) parts.push(cfg.text);
  if (cfg.answers) parts.push(...cfg.answers);
  if (cfg.options) parts.push(...cfg.options);
  if (cfg.pairs) cfg.pairs.forEach(p => { parts.push(p.left, p.right); });
  if (cfg.items) parts.push(...(Array.isArray(cfg.items) ? cfg.items.map(it => typeof it === 'string' ? it : it.label || '') : []));
  if (cfg.title) parts.push(cfg.title);
  if (cfg.caption) parts.push(cfg.caption);
  if (cfg.question) parts.push(cfg.question);
  return parts.filter(Boolean).join(' ');
}

function openSearch() {
  const dlg = $('#dlgBuscar');
  const input = $('#buscarInput');
  const results = $('#buscarResultados');

  function renderResults(query) {
    results.innerHTML = '';
    const q = normalizeStr(query);
    if (!q) return;
    const hits = [];
    state.manifest.pages.forEach((page, pi) => {
      (page.fields || []).forEach(field => {
        const typeName = fieldTypeName(field.type);
        const rawText = fieldSearchText(field);
        if (normalizeStr(typeName).includes(q) || normalizeStr(rawText).includes(q)) {
          hits.push({ pi, field, typeName, rawText });
        }
      });
    });
    if (!hits.length) {
      results.appendChild(el('div', { class: 'buscar-vacio' }, t('dlg.search.empty')));
      return;
    }
    hits.forEach(({ pi, field, typeName, rawText }) => {
      const btn = el('button', { class: 'buscar-resultado', role: 'option', type: 'button' },
        el('span', { class: 'buscar-resultado-meta' }, `${t('stats.pages').replace(/s$/, '')} ${pi + 1} · ${typeName}`),
        el('span', { class: 'buscar-resultado-texto' }, rawText.slice(0, 120) || '—')
      );
      btn.addEventListener('click', () => {
        dlg.close();
        selectField(pi, field.id);
        const pageEl = canvas.querySelector(`.wpf-page[data-page="${pi}"]`);
        if (pageEl) pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      results.appendChild(btn);
    });
  }

  input.value = '';
  results.innerHTML = '';
  dlg.showModal();
  input.focus();
  dlg._abortCtrl = new AbortController();
  input.addEventListener('input', () => renderResults(input.value), { signal: dlg._abortCtrl.signal });
  dlg.addEventListener('close', () => dlg._abortCtrl?.abort(), { once: true });
}

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') { e.preventDefault(); openPreview(); }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'X') { e.preventDefault(); printWorksheet(); }
});

// ---------- Estadísticas de la ficha ----------

function openStats() {
  const dlg = $('#dlgEstadisticas');
  const body = $('#estadisticasBody');

  const allFields = state.manifest.pages.flatMap(p => p.fields || []);
  const withScore = allFields.filter(f => !FIELD_TYPES[f.type]?.decor && !f.noScore);
  const noScore = allFields.filter(f => FIELD_TYPES[f.type]?.decor || f.noScore);

  const counts = {};
  allFields.forEach(f => {
    const name = fieldTypeName(f.type);
    counts[name] = (counts[name] || 0) + 1;
  });

  const table = el('table', { class: 'stats-table' });
  const addRow = (label, value) => {
    const tr = el('tr', {}, el('td', {}, label), el('td', {}, String(value)));
    table.appendChild(tr);
  };
  const addSection = label => {
    const tr = el('tr', {}, el('td', { class: 'stats-section', colspan: '2' }, label));
    table.appendChild(tr);
  };

  const rows = [];
  const pushSection = label => rows.push({ section: label });
  const pushRow = (label, value) => rows.push({ label, value: String(value) });

  pushSection(t('stats.pages'));
  pushRow(t('stats.pages'), state.manifest.pages.length);
  pushSection(t('stats.fields'));
  pushRow(t('stats.fields'), allFields.length);
  pushRow(t('stats.withScore'), withScore.length);
  pushRow(t('stats.noScore'), noScore.length);
  pushSection(t('stats.byType'));
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([name, n]) => pushRow(name, n));

  rows.forEach(r => r.section ? addSection(r.section) : addRow(r.label, r.value));

  function statsAsText() {
    const title = state.manifest.title || t('dlg.stats.title');
    return [title, '', ...rows.map(r => r.section ? `\n${r.section}` : `${r.label}\t${r.value}`)].join('\n');
  }

  function printStats() {
    const title = state.manifest.title || t('dlg.stats.title');
    const tableHtml = table.outerHTML;
    const w = window.open('', '_blank', 'width=520,height=600');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title} — ${t('dlg.stats.title')}</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;max-width:480px;margin:0 auto}
h1{font-size:1.1rem;margin:0 0 20px}
table{width:100%;border-collapse:collapse;font-size:0.9rem}
td{padding:5px 8px}td:last-child{text-align:right;font-weight:600}
tr:nth-child(even) td{background:#f4f4f4}
.stats-section td{font-weight:700;font-size:0.78rem;text-transform:uppercase;letter-spacing:.04em;color:#666;padding:14px 8px 4px}
@media print{body{padding:16px}}</style></head>
<body><h1>${title} — ${t('dlg.stats.title')}</h1>${tableHtml}<script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  body.innerHTML = '';
  body.appendChild(table);

  // Botones de acción
  const actions = el('div', { class: 'stats-actions' });
  const copyBtn = iconBtn({ class: 'btn small', type: 'button' }, ICONS.copy, t('stats.copy'));
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(statsAsText()).then(() => toast(t('stats.copied'), 'ok'));
  });
  const printBtn = iconBtn({ class: 'btn small', type: 'button' }, ICONS.printer, t('stats.print'));
  printBtn.addEventListener('click', printStats);
  actions.appendChild(copyBtn);
  actions.appendChild(printBtn);
  body.appendChild(actions);

  dlg.showModal();
}

utilMenuItem('#miBuscar', openSearch);
utilMenuItem('#miEstadisticas', openStats);
utilMenuItem('#miPrevia', openPreview);

$('#inputZip').addEventListener('change', e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file && confirmDiscardCurrent()) openZipFile(file);
});
$('#btnAjustes').addEventListener('click', openSettings);
$('#btnCompartir').addEventListener('click', openShare);
$('#btnImprimir').addEventListener('click', printWorksheet);

// ---------- Pegar desde portapapeles ----------

function currentPageIndex() {
  if (state.sel) return state.sel.pageIndex;
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
  if (!state.manifest.pages.length) { toast(t('toast.addPdfFirst'), 'error'); return; }
  const pi = currentPageIndex();
  const field = {
    id: uid('f'),
    type: 'label',
    rect: { x: 0.05, y: 0.05, w: 0.9, h: 0.1 },
    points: 0,
    fontScale: 1,
    config: { text, color: '#1d2c42', bold: false }
  };
  state.manifest.pages[pi].fields.push(field);
  markDirty();
  renderCanvas();
  selectField(pi, field.id);
  toast(t('toast.pasteTextLabel'), 'ok');
}

async function pasteImage(blob, mimeType) {
  if (!state.manifest.pages.length) { toast(t('toast.addPdfFirst'), 'error'); return; }
  const pi = currentPageIndex();
  const ext = mimeType.split('/')[1] || 'png';
  const path = 'images/' + uid() + '.' + ext;
  state.files.set(path, blob);
  const def = FIELD_TYPES['image'].defRect;
  const field = {
    id: uid('f'),
    type: 'image',
    rect: { x: 0.05, y: 0.05, w: def.w, h: def.h },
    points: 0,
    fontScale: 1,
    config: { src: path }
  };
  state.manifest.pages[pi].fields.push(field);
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

$('#btnCopiarCampo').addEventListener('click', () => copySelected());

$('#btnPegar').addEventListener('click', async () => {
  // Si hay un campo copiado internamente, pegarlo en la página actual.
  if (state.copiedField && state.sel?.pageIndex !== undefined) {
    pasteField(state.sel.pageIndex);
    return;
  }
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
  const zip = Array.from(e.dataTransfer.files).find(f => /\.(owpkg|zip)$/i.test(f.name));
  if (zip) openZipFile(zip);
  else addFiles(e.dataTransfer.files);
});

// ---------- Historial (deshacer / rehacer) ----------
// Cada paso es una instantánea del manifiesto (+ archivos y numeración). Los
// cambios rápidos se agrupan: la instantánea se confirma tras una breve pausa.
const UNDO_LIMIT = 80;
let undoStack = [];
let redoStack = [];
let committed = null;
let historyTimer = null;

function snapshot() {
  return {
    json: JSON.stringify(state.manifest),
    files: new Map(state.files),
    pageSeq: state.pageSeq,
    cryptoPw: state.submissionCryptoPassword
  };
}

function restoreSnapshot(snap) {
  state.manifest = JSON.parse(snap.json);
  state.files = new Map(snap.files);
  state.pageSeq = snap.pageSeq;
  state.submissionCryptoPassword = snap.cryptoPw;
  state.sel = null;
  state.activeTool = null;
  urls.forEach(u => URL.revokeObjectURL(u));
  urls.clear();
  titleInput.value = state.manifest.title || '';
  state.dirty = true;
  renderCanvas();
  renderPanel();
  refreshPaletteState();
}

function resetHistory() {
  undoStack = [];
  redoStack = [];
  committed = snapshot();
  clearTimeout(historyTimer);
  historyTimer = null;
  updateUndoButtons();
}

function commitHistory() {
  clearTimeout(historyTimer);
  historyTimer = null;
  const snap = snapshot();
  if (!committed) { committed = snap; return; }
  if (snap.json === committed.json && snap.pageSeq === committed.pageSeq) return;
  undoStack.push(committed);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  committed = snap;
  redoStack = [];
  updateUndoButtons();
}

function scheduleCommit() {
  clearTimeout(historyTimer);
  historyTimer = setTimeout(commitHistory, 450);
}

function undo() {
  commitHistory();
  if (!undoStack.length) return;
  redoStack.push(committed);
  committed = undoStack.pop();
  restoreSnapshot(committed);
  updateUndoButtons();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(committed);
  committed = redoStack.pop();
  restoreSnapshot(committed);
  updateUndoButtons();
}

function updateUndoButtons() {
  const u = $('#btnDeshacer'); if (u) u.disabled = undoStack.length === 0;
  const r = $('#btnRehacer'); if (r) r.disabled = redoStack.length === 0;
}

onDirty(scheduleCommit);
$('#btnDeshacer')?.addEventListener('click', undo);
$('#btnRehacer')?.addEventListener('click', redo);

renderPalette();
renderCanvas();
renderPanel();
resetHistory();

// Carga de ficha de ejemplo desde ?ejemplo=<ruta>. Solo se admiten rutas
// relativas del propio sitio (sin esquema ni barra inicial), para no descargar
// recursos arbitrarios de terceros.
(async function loadExampleFromUrl() {
  const path = new URLSearchParams(location.search).get('ejemplo');
  if (!path || /^(https?:)?\/\//i.test(path) || path.startsWith('/')) return;
  try {
    toast(t('toast.generating'));
    const resp = await fetch(path);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    await openZipFile(new File([blob], path.split('/').pop() || 'ficha.owpkg', { type: 'application/zip' }));
  } catch (e) {
    console.error(e);
    toast(t('toast.exportError', { msg: e.message }), 'error');
  }
})();

// Apertura de una ficha elegida en la portada (botón «Abrir ficha»): allí no se
// puede pasar el archivo directamente, así que llega guardado y lo recogemos.
(async function openHandoffFile() {
  if (!new URLSearchParams(location.search).has('abrir')) return;
  try {
    const file = await takeFile();
    if (file) await openZipFile(file);
  } catch (e) {
    console.error(e);
    toast(t('toast.openError'), 'error');
  }
})();
