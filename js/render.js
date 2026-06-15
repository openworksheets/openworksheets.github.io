// Renderizado de los campos interactivos en modo alumno.
//
// renderField(field, pageLayer, ctx) crea el campo dentro de la capa de la
// página y devuelve un controlador:
//   { field, root, getAnswer(), setAnswer(a), isAnswered(),
//     setDisabled(b), mark(result, expectedText) }
//
// ctx = { rng, shuffle, onChange }
//   - rng: generador con semilla, para que el barajado persista en la sesión.
//   - shuffle: si la ficha baraja las opciones de single/multi/select.
//     (match, order y dragdrop se barajan siempre: su orden delataría la solución).

import { el, shuffled, shuffledIndices, normalizeText } from './util.js';
import { parseGaps } from './fieldtypes.js';
import { t } from './i18n.js';

// SVG de una casilla de verificación dibujable (campo checkbox).
// El marco se ve siempre; la marca (✓) se muestra al estar activada vía CSS.
// preserveAspectRatio mantiene la casilla cuadrada dentro de cualquier rectángulo.
export const CHECKBOX_SVG =
  '<svg class="wpf-cb-svg" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect class="wpf-cb-frame" x="2.5" y="2.5" width="19" height="19" rx="3.5"/>' +
  '<path class="wpf-cb-tick" d="M6 12.5 10 16.5 18 7.5"/></svg>';

export function renderField(field, pageLayer, ctx) {
  const root = el('div', { class: `wpf-field wpf-field-${field.type}`, dataset: { id: field.id } });
  positionRect(root, field.rect);
  if (field.rotate) root.style.transform = `rotate(${field.rotate}deg)`;
  root.style.setProperty('--fs', field.fontScale || 1);
  if (field.config?.bg) {
    const hex = field.config.bg;
    const op = field.config.bgOpacity ?? 1;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    root.style.setProperty('--field-bg', `rgba(${r},${g},${b},${op})`);
  }
  if (field.config?.fgColor) root.style.setProperty('--field-fg', field.config.fgColor);
  pageLayer.appendChild(root);

  const maker = renderers[field.type];
  const inner = maker ? maker(field, root, ctx) : emptyRenderer();

  const ctl = {
    field,
    root,
    getAnswer: inner.getAnswer,
    setAnswer: inner.setAnswer,
    isAnswered: inner.isAnswered,
    setDisabled(b) {
      root.classList.toggle('disabled', b);
      inner.setDisabled(b);
    },
    mark(result, expected) {
      root.classList.remove('mark-ok', 'mark-ko', 'mark-partial', 'mark-blank');
      const cls = result.ok === true ? 'mark-ok'
        : result.ok === 'partial' ? 'mark-partial'
        : result.ok === 'blank' ? 'mark-blank' : 'mark-ko';
      root.classList.add(cls);
      let badge = root.querySelector(':scope > .wpf-badge');
      if (!badge) {
        badge = el('span', { class: 'wpf-badge' });
        root.appendChild(badge);
      }
      badge.textContent = result.ok === true ? '✓' : result.ok === 'partial' ? '½' : '✗';
      if (expected && result.ok !== true) {
        let exp = root.querySelector(':scope > .wpf-expected');
        if (!exp) {
          exp = el('div', { class: 'wpf-expected' });
          root.appendChild(exp);
        }
        exp.textContent = expected;
      }
      if (inner.markDetail) inner.markDetail(result);
    },
    clearMark() {
      root.classList.remove('mark-ok', 'mark-ko', 'mark-partial', 'mark-blank');
      root.querySelector(':scope > .wpf-badge')?.remove();
      root.querySelector(':scope > .wpf-expected')?.remove();
    }
  };
  return ctl;
}

export function positionRect(node, rect) {
  node.style.left = (rect.x * 100) + '%';
  node.style.top = (rect.y * 100) + '%';
  node.style.width = (rect.w * 100) + '%';
  node.style.minHeight = (rect.h * 100) + '%';
}

function emptyRenderer() {
  return {
    getAnswer: () => null,
    setAnswer: () => {},
    isAnswered: () => false,
    setDisabled: () => {}
  };
}

// Construye el SVG de una forma de dibujo (line, arrow, rect, ellipse).
// Compartido por el editor (vista previa) y el modo alumno.
export function buildShapeSvg(field) {
  const cfg = field.config || {};
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'wpf-shape');
  const sw = Math.max(0.5, parseFloat(cfg.width) || 2);
  const color = cfg.color || '#1d2c42';
  const dash = cfg.style === 'dashed' ? `${sw * 3} ${sw * 2}`
    : cfg.style === 'dotted' ? `0.1 ${sw * 2.2}` : '';

  function stroke(node) {
    node.setAttribute('stroke', color);
    node.setAttribute('stroke-width', sw);
    if (dash) {
      node.setAttribute('stroke-dasharray', dash);
      node.setAttribute('stroke-linecap', 'round');
    }
  }

  if (field.type === 'rect' || field.type === 'ellipse') {
    let node;
    if (field.type === 'rect' && cfg.square) {
      // Cuadrado: viewBox cuadrado + non-scaling-stroke para que el grosor no escale
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      node = document.createElementNS(NS, 'rect');
      node.setAttribute('x', '0');
      node.setAttribute('y', '0');
      node.setAttribute('width', '100');
      node.setAttribute('height', '100');
      node.setAttribute('vector-effect', 'non-scaling-stroke');
      const br = parseFloat(cfg.borderRadius) || 0;
      if (br > 0) {
        node.setAttribute('rx', String(br));
        node.setAttribute('ry', String(br));
      }
    } else if (field.type === 'rect') {
      node = document.createElementNS(NS, 'rect');
      node.setAttribute('x', '0');
      node.setAttribute('y', '0');
      node.setAttribute('width', '100%');
      node.setAttribute('height', '100%');
      const br = parseFloat(cfg.borderRadius) || 0;
      if (br > 0) {
        node.setAttribute('rx', br + '%');
        node.setAttribute('ry', br + '%');
      }
    } else if (cfg.circle) {
      // Círculo: viewBox cuadrado para que sea redondo independientemente de las proporciones del campo.
      // non-scaling-stroke evita que el grosor escale al redimensionar.
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      node = document.createElementNS(NS, 'circle');
      node.setAttribute('cx', '50');
      node.setAttribute('cy', '50');
      node.setAttribute('r', '49');
      node.setAttribute('vector-effect', 'non-scaling-stroke');
    } else {
      node = document.createElementNS(NS, 'ellipse');
      node.setAttribute('cx', '50%');
      node.setAttribute('cy', '50%');
      node.setAttribute('rx', '50%');
      node.setAttribute('ry', '50%');
    }
    node.setAttribute('fill', cfg.fill || 'none');
    if (cfg.fill) node.setAttribute('fill-opacity', String(cfg.fillOpacity ?? 1));
    if (cfg.noStroke) node.setAttribute('stroke', 'none');
    else stroke(node);
    svg.appendChild(node);
  } else {
    // line y arrow: extremos según la dirección dentro de la caja
    const dirs = {
      h:  ['0%', '50%', '100%', '50%'],
      v:  ['50%', '0%', '50%', '100%'],
      d1: ['0%', '0%', '100%', '100%'],
      d2: ['0%', '100%', '100%', '0%']
    };
    let [x1, y1, x2, y2] = dirs[cfg.dir] || dirs.h;
    if (field.type === 'arrow' && cfg.invert) [x1, y1, x2, y2] = [x2, y2, x1, y1];
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('x1', x1);
    ln.setAttribute('y1', y1);
    ln.setAttribute('x2', x2);
    ln.setAttribute('y2', y2);
    stroke(ln);
    if (field.type === 'arrow') {
      // id único: editor y vista previa pueden convivir en el mismo documento
      const mid = 'wpfah-' + Math.random().toString(36).slice(2, 9);
      const marker = document.createElementNS(NS, 'marker');
      marker.setAttribute('id', mid);
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '8');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '5');
      marker.setAttribute('markerHeight', '5');
      marker.setAttribute('orient', 'auto-start-reverse');
      const tip = document.createElementNS(NS, 'path');
      tip.setAttribute('d', 'M0,0 L10,5 L0,10 z');
      tip.setAttribute('fill', color);
      marker.appendChild(tip);
      const defs = document.createElementNS(NS, 'defs');
      defs.appendChild(marker);
      svg.appendChild(defs);
      ln.setAttribute('marker-end', `url(#${mid})`);
      if (cfg.double) ln.setAttribute('marker-start', `url(#${mid})`);
    }
    svg.appendChild(ln);
  }
  return svg;
}

function shapeRenderer(field, root) {
  // Altura exacta (como image): la caja debe coincidir con la del editor.
  root.style.height = (field.rect.h * 100) + '%';
  root.appendChild(buildShapeSvg(field));
  return emptyRenderer();
}

function notify(ctx) {
  if (ctx.onChange) ctx.onChange();
}

const renderers = {

  // Decorativos: no son preguntas, solo se muestran.
  label(field, root) {
    const cfg = field.config || {};
    root.appendChild(el('div', {
      class: 'wpf-label-text',
      style: `color:${cfg.color || 'inherit'};font-weight:${cfg.bold ? '700' : '400'}`
    }, cfg.text || ''));
    return emptyRenderer();
  },

  cover(field, root) {
    const cfg = field.config || {};
    root.appendChild(el('div', {
      class: 'wpf-cover-fill',
      style: `background:${cfg.color || '#ffffff'}`
    }));
    return emptyRenderer();
  },

  image(field, root, ctx) {
    const src = field.config?.src;
    // Altura exacta: con solo min-height la imagen tomaría su proporción
    // natural y no coincidiría con la caja dibujada en el editor.
    root.style.height = (field.rect.h * 100) + '%';
    if (src && ctx.fileUrl) {
      const url = ctx.fileUrl(src);
      if (url) root.appendChild(el('img', { src: url, class: 'wpf-img-decor', alt: '' }));
    }
    return emptyRenderer();
  },

  line: shapeRenderer,
  arrow: shapeRenderer,
  rect: shapeRenderer,
  ellipse: shapeRenderer,

  text(field, root, ctx) {
    const input = el('input', {
      class: 'wpf-input', type: 'text', autocomplete: 'off',
      'aria-label': t('render.textAria')
    });
    input.addEventListener('input', () => notify(ctx));
    root.appendChild(input);
    return {
      getAnswer: () => input.value,
      setAnswer: v => { input.value = v ?? ''; },
      isAnswered: () => input.value.trim() !== '',
      setDisabled: b => { input.disabled = b; }
    };
  },

  number(field, root, ctx) {
    const input = el('input', {
      class: 'wpf-input', type: 'text', inputmode: 'decimal', autocomplete: 'off',
      'aria-label': t('render.numberAria')
    });
    input.addEventListener('input', () => notify(ctx));
    root.appendChild(input);
    return {
      getAnswer: () => input.value,
      setAnswer: v => { input.value = v ?? ''; },
      isAnswered: () => input.value.trim() !== '',
      setDisabled: b => { input.disabled = b; }
    };
  },

  single(field, root, ctx) {
    return choiceList(field, root, ctx);
  },

  truefalse(field, root, ctx) {
    const labels = field.config.labels || ['Verdadero', 'Falso'];
    const group = uid();
    let value = null;
    const inputs = [];
    const wrap = el('div', { class: 'wpf-tf' });
    [true, false].forEach((val, i) => {
      const input = el('input', { type: 'radio', name: group });
      input.addEventListener('change', () => { value = val; notify(ctx); });
      inputs.push({ input, val });
      wrap.appendChild(el('label', { class: 'wpf-choice' }, input, el('span', {}, labels[i])));
    });
    root.appendChild(wrap);
    return {
      getAnswer: () => value,
      setAnswer: v => {
        value = (v === true || v === false) ? v : null;
        inputs.forEach(o => { o.input.checked = o.val === value; });
      },
      isAnswered: () => value !== null,
      setDisabled: b => inputs.forEach(o => { o.input.disabled = b; })
    };
  },

  multi(field, root, ctx) {
    const options = field.config.options || [];
    const order = ctx.shuffle ? shuffled(options.map((_, i) => i), ctx.rng) : options.map((_, i) => i);
    const inputs = [];
    const wrap = el('div', { class: 'wpf-choices' + (field.config.horizontal ? ' wpf-choices--row' : '') });
    order.forEach(origIdx => {
      const input = el('input', { type: 'checkbox' });
      input.addEventListener('change', () => notify(ctx));
      inputs.push({ input, origIdx });
      wrap.appendChild(el('label', { class: 'wpf-choice' }, input, el('span', {}, options[origIdx])));
    });
    root.appendChild(wrap);
    return {
      getAnswer: () => inputs.filter(o => o.input.checked).map(o => o.origIdx),
      setAnswer: v => {
        const set = new Set((Array.isArray(v) ? v : []).map(Number));
        inputs.forEach(o => { o.input.checked = set.has(o.origIdx); });
      },
      isAnswered: () => inputs.some(o => o.input.checked),
      setDisabled: b => inputs.forEach(o => { o.input.disabled = b; })
    };
  },

  checkbox(field, root, ctx) {
    const cfg = field.config || {};
    const boxes = cfg.boxes || [];
    const multiple = Boolean(cfg.multiple);
    // El root del campo es solo un ancla transparente; las casillas se colocan
    // libremente sobre la página (igual que las zonas de dragdrop).
    root.classList.add('wpf-cb-hostfield');
    const page = root.parentElement;

    let selected = new Set();
    let disabled = false;
    const boxEls = new Map();

    function paint() {
      boxes.forEach(b => {
        boxEls.get(b.id)?.classList.toggle('checked', selected.has(b.id));
      });
    }

    boxes.forEach(b => {
      const node = el('div', { class: 'wpf-cbbox', dataset: { id: b.id } });
      node.style.left   = (b.rect.x * 100) + '%';
      node.style.top    = (b.rect.y * 100) + '%';
      node.style.width  = (b.rect.w * 100) + '%';
      node.style.height = (b.rect.h * 100) + '%';
      node.innerHTML = CHECKBOX_SVG;
      node.addEventListener('click', () => {
        if (disabled) return;
        if (multiple) {
          selected.has(b.id) ? selected.delete(b.id) : selected.add(b.id);
        } else {
          if (selected.has(b.id)) selected.clear();
          else selected = new Set([b.id]);
        }
        paint();
        notify(ctx);
      });
      page.appendChild(node);
      boxEls.set(b.id, node);
    });
    paint();

    return {
      getAnswer: () => [...selected],
      setAnswer: v => {
        selected = new Set((Array.isArray(v) ? v : []).map(String).filter(id => boxes.some(b => b.id === id)));
        paint();
      },
      isAnswered: () => selected.size > 0,
      setDisabled: b => { disabled = b; },
      markDetail() {
        const correct = new Set((cfg.correct || []).map(String));
        boxes.forEach(b => {
          const node = boxEls.get(b.id);
          if (!node) return;
          const marked = selected.has(b.id);
          const isCorrect = correct.has(b.id);
          node.classList.remove('checked');
          node.classList.toggle('checked', marked);
          if (marked && isCorrect) node.classList.add('cb-ok');
          else if (marked && !isCorrect) node.classList.add('cb-ko');
          else if (!marked && isCorrect) node.classList.add('cb-missing');
        });
      }
    };
  },

  textboxes(field, root, ctx) {
    const cfg = field.config || {};
    const boxes = cfg.boxes || [];
    // El root es solo un ancla transparente; los cuadros de texto se colocan
    // libremente sobre la página (igual que las casillas de checkbox).
    root.classList.add('wpf-tb-hostfield');
    const page = root.parentElement;

    const inputs = new Map();
    boxes.forEach((b, i) => {
      const node = el('input', {
        class: 'wpf-tbbox wpf-input', type: 'text', autocomplete: 'off',
        dataset: { id: b.id },
        'aria-label': t('render.gapAria', { n: i + 1 })
      });
      node.style.left   = (b.rect.x * 100) + '%';
      node.style.top    = (b.rect.y * 100) + '%';
      node.style.width  = (b.rect.w * 100) + '%';
      node.style.height = (b.rect.h * 100) + '%';
      node.addEventListener('input', () => notify(ctx));
      page.appendChild(node);
      inputs.set(b.id, node);
    });

    return {
      getAnswer: () => {
        const o = {};
        inputs.forEach((inp, id) => { o[id] = inp.value; });
        return o;
      },
      setAnswer: v => {
        const obj = v && typeof v === 'object' ? v : {};
        inputs.forEach((inp, id) => { inp.value = obj[id] ?? ''; });
      },
      isAnswered: () => [...inputs.values()].some(inp => inp.value.trim() !== ''),
      setDisabled: b => inputs.forEach(inp => { inp.disabled = b; }),
      markDetail() {
        const norm = s => normalizeText(s, cfg);
        page.querySelectorAll(`.wpf-tb-exp[data-f="${field.id}"]`).forEach(n => n.remove());
        boxes.forEach(b => {
          const inp = inputs.get(b.id);
          if (!inp) return;
          const v = inp.value;
          const answers = (b.answers || []).filter(a => a.trim() !== '');
          const ok = v.trim() !== '' && answers.some(a => norm(a) === norm(v));
          inp.classList.remove('tb-ok', 'tb-ko');
          inp.classList.add(ok ? 'tb-ok' : 'tb-ko');
          if (!ok && answers.length) {
            const exp = el('div', { class: 'wpf-tb-exp', dataset: { f: field.id } }, answers[0]);
            exp.style.left = (b.rect.x * 100) + '%';
            exp.style.top  = ((b.rect.y + b.rect.h) * 100) + '%';
            exp.style.minWidth = (b.rect.w * 100) + '%';
            page.appendChild(exp);
          }
        });
      }
    };
  },

  select(field, root, ctx) {
    const options = field.config.options || [];
    const order = ctx.shuffle ? shuffled(options.map((_, i) => i), ctx.rng) : options.map((_, i) => i);
    const sel = el('select', { class: 'wpf-select', 'aria-label': t('render.selectAria') },
      el('option', { value: '' }, '—'));
    order.forEach(origIdx => {
      sel.appendChild(el('option', { value: String(origIdx) }, options[origIdx]));
    });
    sel.addEventListener('change', () => notify(ctx));
    root.appendChild(sel);
    return {
      getAnswer: () => sel.value === '' ? null : Number(sel.value),
      setAnswer: v => { sel.value = (v === null || v === undefined) ? '' : String(v); },
      isAnswered: () => sel.value !== '',
      setDisabled: b => { sel.disabled = b; }
    };
  },

  gaps(field, root, ctx) {
    const segments = parseGaps(field.config.text || '');
    const inputs = [];
    const wrap = el('div', { class: 'wpf-gaps' });
    segments.forEach(seg => {
      if (seg.kind === 'text') {
        wrap.appendChild(document.createTextNode(seg.value));
      } else {
        // Ancho proporcional a la respuesta más larga del hueco
        const len = Math.max(...seg.answers.map(a => a.length), 1);
        const ch = Math.max(4, Math.min(28, len + 2));
        const input = el('input', {
          class: 'wpf-gap-input', type: 'text', autocomplete: 'off',
          style: 'width:' + ch + 'ch',
          'aria-label': t('render.gapAria', { n: inputs.length + 1 })
        });
        input.addEventListener('input', () => notify(ctx));
        inputs.push(input);
        wrap.appendChild(input);
      }
    });
    root.appendChild(wrap);
    return {
      getAnswer: () => inputs.map(i => i.value),
      setAnswer: v => {
        const arr = Array.isArray(v) ? v : [];
        inputs.forEach((inp, i) => { inp.value = arr[i] ?? ''; });
      },
      isAnswered: () => inputs.some(i => i.value.trim() !== ''),
      setDisabled: b => inputs.forEach(i => { i.disabled = b; })
    };
  },

  match(field, root, ctx) {
    const pairs = field.config.pairs || [];
    const rights = pairs.map(p => p.right).concat(field.config.distractors || []);
    // El orden de las opciones de la derecha se baraja siempre.
    const order = shuffledIndices(rights.length, ctx.rng);
    const selects = [];
    const wrap = el('div', { class: 'wpf-match' });
    pairs.forEach((pair, i) => {
      const sel = el('select', { class: 'wpf-select', 'aria-label': t('render.matchAria', { left: pair.left }) },
        el('option', { value: '' }, '—'));
      order.forEach(ri => {
        sel.appendChild(el('option', { value: String(ri) }, rights[ri]));
      });
      sel.addEventListener('change', () => notify(ctx));
      selects.push(sel);
      wrap.appendChild(el('div', { class: 'wpf-match-row' },
        el('span', { class: 'wpf-match-left' }, pair.left), sel));
    });
    root.appendChild(wrap);
    return {
      getAnswer: () => selects.map(s => s.value === '' ? null : Number(s.value)),
      setAnswer: v => {
        const arr = Array.isArray(v) ? v : [];
        selects.forEach((s, i) => {
          s.value = (arr[i] === null || arr[i] === undefined) ? '' : String(arr[i]);
        });
      },
      isAnswered: () => selects.some(s => s.value !== ''),
      setDisabled: b => selects.forEach(s => { s.disabled = b; })
    };
  },

  order(field, root, ctx) {
    const items = field.config.items || [];
    // arrangement[pos] = índice original mostrado en esa posición. Se baraja siempre.
    let arrangement = shuffledIndices(items.length, ctx.rng);
    let disabled = false;
    let touched = false;
    let dragPos = null;
    const list = el('div', { class: 'wpf-order' });
    root.appendChild(list);

    function move(pos, delta) {
      const j = pos + delta;
      if (j < 0 || j >= arrangement.length) return;
      [arrangement[pos], arrangement[j]] = [arrangement[j], arrangement[pos]];
      touched = true;
      paint();
      notify(ctx);
    }

    function moveTo(from, to) {
      if (from === to || from < 0 || to < 0 || from >= arrangement.length || to >= arrangement.length) return;
      const next = arrangement.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      arrangement = next;
      touched = true;
      paint();
      notify(ctx);
    }

    function paint() {
      list.textContent = '';
      arrangement.forEach((orig, pos) => {
        const item = el('div', { class: 'wpf-order-item', draggable: disabled ? null : 'true' });
        const up = el('button', { class: 'wpf-mini-btn', type: 'button', 'aria-label': t('render.moveUp') }, '▲');
        const down = el('button', { class: 'wpf-mini-btn', type: 'button', 'aria-label': t('render.moveDown') }, '▼');
        up.disabled = disabled || pos === 0;
        down.disabled = disabled || pos === arrangement.length - 1;
        up.addEventListener('click', () => move(pos, -1));
        down.addEventListener('click', () => move(pos, 1));
        item.addEventListener('dragstart', e => {
          if (disabled) return;
          dragPos = pos;
          item.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(pos));
        });
        item.addEventListener('dragend', () => {
          dragPos = null;
          item.classList.remove('dragging');
          list.querySelectorAll('.drag-over').forEach(n => n.classList.remove('drag-over'));
        });
        item.addEventListener('dragover', e => {
          if (disabled || dragPos === null || dragPos === pos) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          item.classList.add('drag-over');
        });
        item.addEventListener('dragleave', e => {
          if (!item.contains(e.relatedTarget)) item.classList.remove('drag-over');
        });
        item.addEventListener('drop', e => {
          e.preventDefault();
          item.classList.remove('drag-over');
          if (disabled || dragPos === null) return;
          moveTo(dragPos, pos);
          dragPos = null;
        });
        item.append(
          el('span', { class: 'wpf-order-num' }, String(pos + 1)),
          el('span', { class: 'wpf-order-text' }, items[orig]),
          el('span', { class: 'wpf-order-btns' }, up, down));
        list.appendChild(item);
      });
    }
    paint();

    return {
      getAnswer: () => arrangement.slice(),
      setAnswer: v => {
        if (Array.isArray(v) && v.length === items.length) {
          arrangement = v.map(Number);
          touched = true;
        }
        paint();
      },
      isAnswered: () => touched,
      setDisabled: b => { disabled = b; paint(); }
    };
  },

  dragdrop(field, root, ctx) {
    const cfg = field.config;
    const zones = cfg.zones || [];
    const crops = cfg.mode === 'crops';
    const pieces = crops ? (cfg.pieces || []) : [];
    const pieceMap = {};
    pieces.forEach(p => { pieceMap[p.id] = p; });

    const zoneAnswers = z => Array.isArray(z.answers) && z.answers.length
      ? z.answers.map(String) : z.answer ? [String(z.answer)] : [];

    // Tokens arrastrables: ids de pieza (modo recorte) o etiquetas (modo clásico).
    const tokens = crops
      ? pieces.map(p => p.id)
      : zones.flatMap(zoneAnswers).concat(cfg.distractors || []);
    const tokenOrder = shuffledIndices(tokens.length, ctx.rng);

    function tokenImgUrl(label) {
      if (crops) {
        const p = pieceMap[label];
        return p && ctx.fileUrl ? (ctx.fileUrl(p.src) || null) : null;
      }
      if (!label.startsWith('dtokens/') || !ctx.fileUrl) return null;
      return ctx.fileUrl(label) || null;
    }
    function tokenContent(label) {
      const url = tokenImgUrl(label);
      if (url) {
        const img = document.createElement('img');
        img.src = url; img.alt = crops ? '' : label; img.className = 'wpf-token-img';
        return img;
      }
      return document.createTextNode(label);
    }
    function hasImg(label) { return Boolean(tokenImgUrl(label)); }

    // Tokens correctos para una zona (por nombre en modo clásico, por pieza
    // asignada en modo recorte).
    function correctTokens(z) {
      return crops
        ? pieces.filter(p => p.zoneId === z.id).map(p => p.id)
        : zoneAnswers(z);
    }

    // assignment: zoneId → string[]
    const assignment = {};
    zones.forEach(z => { assignment[z.id] = []; });
    let selectedToken = null;
    let dragToken = null;
    let disabled = false;

    // Devuelve un token a su origen eliminándolo de donde esté.
    function releaseToken(tk) {
      for (const id of Object.keys(assignment)) {
        assignment[id] = assignment[id].filter(t => t !== tk);
      }
    }

    // Coloca un token en una zona.
    function placeToken(tk, zoneId) {
      releaseToken(tk);
      assignment[zoneId] = [...assignment[zoneId], tk];
    }

    function usedTokens() {
      return new Set(Object.values(assignment).flat());
    }

    // --- Zona de partida: bandeja (clásico) o huecos sobre la página (recorte) ---
    let trayBox = null;
    const homeEls = {};
    if (crops) {
      root.classList.add('wpf-crops-host');
      pieces.forEach(p => {
        const hEl = el('div', { class: 'wpf-hole', dataset: { piece: p.id } });
        positionRect(hEl, p.rect);
        hEl.style.setProperty('--fs', field.fontScale || 1);
        hEl.style.setProperty('--field-bg', cfg.holeColor || '#ffffff');
        // Soltar cualquier pieza sobre un hueco la devuelve a su origen.
        hEl.addEventListener('dragover', e => {
          if (disabled || !dragToken) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          hEl.classList.add('drag-over');
        });
        hEl.addEventListener('dragleave', e => {
          if (!hEl.contains(e.relatedTarget)) hEl.classList.remove('drag-over');
        });
        hEl.addEventListener('drop', e => {
          e.preventDefault();
          hEl.classList.remove('drag-over');
          if (disabled || !dragToken) return;
          releaseToken(dragToken);
          dragToken = null; selectedToken = null;
          paint(); notify(ctx);
        });
        hEl.addEventListener('click', () => {
          if (disabled || selectedToken === null) return;
          releaseToken(selectedToken);
          selectedToken = null;
          paint(); notify(ctx);
        });
        root.parentElement.appendChild(hEl);
        homeEls[p.id] = hEl;
      });
    } else {
      root.classList.add('wpf-tray');
      trayBox = el('div', { class: 'wpf-tray-tokens' });
      root.appendChild(trayBox);
      // Permite soltar un token en la bandeja para devolverlo.
      trayBox.addEventListener('dragover', e => { if (!disabled && dragToken) e.preventDefault(); });
      trayBox.addEventListener('drop', e => {
        e.preventDefault();
        if (disabled || !dragToken) return;
        releaseToken(dragToken);
        dragToken = null; selectedToken = null;
        paint(); notify(ctx);
      });
    }

    // Las zonas de destino se colocan directamente sobre la página.
    const zoneEls = {};
    zones.forEach(z => {
      const zEl = el('div', { class: 'wpf-zone', dataset: { zone: z.id } });
      positionRect(zEl, z.rect);
      zEl.style.setProperty('--fs', field.fontScale || 1);

      // Clic: coloca el token seleccionado por clic.
      zEl.addEventListener('click', () => {
        if (disabled || selectedToken === null) return;
        placeToken(selectedToken, z.id);
        selectedToken = null;
        paint(); notify(ctx);
      });

      // Drag-and-drop sobre zona.
      zEl.addEventListener('dragover', e => {
        if (disabled || !dragToken) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zEl.classList.add('drag-over');
      });
      zEl.addEventListener('dragleave', e => {
        if (!zEl.contains(e.relatedTarget)) zEl.classList.remove('drag-over');
      });
      zEl.addEventListener('drop', e => {
        e.preventDefault();
        zEl.classList.remove('drag-over');
        if (disabled || !dragToken) return;
        placeToken(dragToken, z.id);
        dragToken = null; selectedToken = null;
        paint(); notify(ctx);
      });

      root.parentElement.appendChild(zEl);
      zoneEls[z.id] = zEl;
    });

    // Añade los manejadores de arrastre comunes a un chip/botón de token.
    function wireDrag(btn, tk) {
      btn.addEventListener('dragstart', e => {
        e.stopPropagation();
        dragToken = tk; selectedToken = null;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tk);
        // Imagen de arrastre explícita: con la imagen del hueco a tamaño
        // completo (y dimensiones en %), el "fantasma" por defecto no se
        // genera bien en el primer arrastre. Fijarla lo soluciona.
        const im = btn.querySelector('img');
        if (im) {
          const w = im.clientWidth || im.naturalWidth || 1;
          const h = im.clientHeight || im.naturalHeight || 1;
          try { e.dataTransfer.setDragImage(im, w / 2, h / 2); } catch (_) {}
        }
        requestAnimationFrame(() => btn.classList.add('dragging'));
      });
      btn.addEventListener('dragend', () => {
        dragToken = null;
        btn.classList.remove('dragging');
        paint();
      });
    }

    function makeTokenBtn(tk, opts = {}) {
      const cls = 'wpf-token' + (hasImg(tk) ? ' has-img' : '');
      const btn = el('button', { class: cls, type: 'button', draggable: 'true', title: tk, dataset: { label: tk } });
      btn.appendChild(tokenContent(tk));
      if (opts.selected) btn.classList.add('selected');
      btn.disabled = disabled;
      btn.addEventListener('click', () => {
        if (disabled) return;
        selectedToken = selectedToken === tk ? null : tk;
        paint();
      });
      wireDrag(btn, tk);
      return btn;
    }

    // Pieza descansando en su hueco de origen (modo recorte).
    function makeHomeChip(tk) {
      const btn = el('button', { class: 'wpf-hole-piece', type: 'button', draggable: 'true', dataset: { label: tk } });
      btn.appendChild(tokenContent(tk));
      if (selectedToken === tk) btn.classList.add('selected');
      btn.disabled = disabled;
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (disabled) return;
        selectedToken = selectedToken === tk ? null : tk;
        paint();
      });
      wireDrag(btn, tk);
      return btn;
    }

    function paint() {
      const used = usedTokens();
      if (trayBox) {
        trayBox.textContent = '';
        tokenOrder.forEach(ti => {
          const tk = tokens[ti];
          if (used.has(tk)) return;
          trayBox.appendChild(makeTokenBtn(tk, { selected: selectedToken === tk }));
        });
      }
      if (crops) {
        pieces.forEach(p => {
          const hEl = homeEls[p.id];
          hEl.textContent = '';
          const atHome = !used.has(p.id);
          hEl.classList.toggle('empty', !atHome);
          hEl.classList.toggle('armed', !atHome && selectedToken !== null);
          if (atHome) hEl.appendChild(makeHomeChip(p.id));
        });
      }

      zones.forEach(z => {
        const zEl = zoneEls[z.id];
        zEl.textContent = '';
        assignment[z.id].forEach(tk => {
          const chipCls = 'wpf-zone-chip' + (hasImg(tk) ? ' has-img' : '');
          const chip = el('button', { class: chipCls, type: 'button', draggable: 'true', title: crops ? '' : tk, dataset: { label: tk } });
          chip.appendChild(tokenContent(tk));
          chip.disabled = disabled;

          chip.addEventListener('click', e => {
            e.stopPropagation();
            if (disabled) return;
            releaseToken(tk);
            if (selectedToken === tk) selectedToken = null;
            paint(); notify(ctx);
          });
          wireDrag(chip, tk);
          zEl.appendChild(chip);
        });
        zEl.classList.toggle('filled', assignment[z.id].length > 0);
        zEl.classList.toggle('armed', selectedToken !== null);
      });
    }
    paint();

    return {
      getAnswer: () => {
        const out = {};
        zones.forEach(z => { out[z.id] = [...assignment[z.id]]; });
        return out;
      },
      setAnswer: v => {
        const obj = v && typeof v === 'object' ? v : {};
        zones.forEach(z => {
          const val = obj[z.id];
          assignment[z.id] = Array.isArray(val) ? [...val] : (val ? [String(val)] : []);
        });
        selectedToken = null;
        paint();
      },
      isAnswered: () => Object.values(assignment).some(arr => arr.length > 0),
      setDisabled: b => { disabled = b; selectedToken = null; paint(); },
      markDetail() {
        zones.forEach(z => {
          const correct = correctTokens(z);
          const zEl = zoneEls[z.id];
          zEl.querySelectorAll('.wpf-zone-chip').forEach(chip => {
            chip.classList.add(correct.includes(chip.dataset.label) ? 'mark-ok' : 'mark-ko');
          });
          if (!assignment[z.id].length && correct.length) zEl.classList.add('mark-ko');
        });
        if (crops) {
          const used = usedTokens();
          // Pieza que debía colocarse y sigue en su hueco: incompleta.
          pieces.forEach(p => {
            if (p.zoneId && !used.has(p.id)) homeEls[p.id]?.classList.add('mark-ko');
          });
        }
      }
    };
  },

  arrowmatch(field, root, ctx) {
    const cfg = field.config || {};
    const allItems = cfg.items || [];
    const leftItems = allItems.filter(i => i.side === 'left');
    const rightItems = allItems.filter(i => i.side === 'right');
    const svgNS = 'http://www.w3.org/2000/svg';

    // Modo hotspot: al menos un item tiene rect definido en coords de página.
    const hotspotMode = allItems.some(i => i.rect);

    let connections = []; // [{from, to}]
    let pendingFrom = null;
    let disabled = false;

    // Contenedor SVG y referencia al elemento de medición para el redraw.
    let svg, svgContainer, dotMap;

    if (hotspotMode) {
      // El root del campo se hace transparente; los items y el SVG van en la página.
      root.classList.add('wpf-am-hotspot-field');
      const page = root.parentElement;

      svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('class', 'wpf-am-svg wpf-am-svg-page');
      page.appendChild(svg);
      svgContainer = page;

      dotMap = new Map();

      // Origen del área de contenido de la página: el SVG se coloca dentro
      // del borde, así que las coordenadas deben excluirlo.
      function contentOrigin() {
        const pr = svgContainer.getBoundingClientRect();
        const cs = getComputedStyle(svgContainer);
        return {
          left: pr.left + (parseFloat(cs.borderLeftWidth) || 0),
          top: pr.top + (parseFloat(cs.borderTopWidth) || 0)
        };
      }

      function dotCenter(id) {
        const dot = dotMap.get(id);
        if (!dot) return null;
        const o = contentOrigin();
        const dr = dot.getBoundingClientRect();
        if (!svgContainer.clientWidth) return null;
        return { x: dr.left + dr.width / 2 - o.left, y: dr.top + dr.height / 2 - o.top };
      }

      function redraw() {
        svg.setAttribute('width', svgContainer.clientWidth || 0);
        svg.setAttribute('height', svgContainer.clientHeight || 0);
        svg.textContent = '';
        function drawLine(fromId, toId, extraClass) {
          const f = dotCenter(fromId), t2 = dotCenter(toId);
          if (!f || !t2) return;
          const cx = (f.x + t2.x) / 2;
          const d = `M${f.x},${f.y} C${cx},${f.y} ${cx},${t2.y} ${t2.x},${t2.y}`;
          const vis = document.createElementNS(svgNS, 'path');
          vis.setAttribute('d', d);
          vis.setAttribute('class', 'wpf-am-line' + (extraClass ? ' ' + extraClass : ''));
          vis.setAttribute('data-from', fromId);
          vis.setAttribute('data-to', toId);
          svg.appendChild(vis);
          const hit = document.createElementNS(svgNS, 'path');
          hit.setAttribute('d', d);
          hit.setAttribute('class', 'wpf-am-hit');
          hit.setAttribute('pointer-events', 'stroke');
          hit.addEventListener('click', e => {
            if (disabled) return;
            e.stopPropagation();
            connections = connections.filter(c => !(c.from === fromId && c.to === toId));
            pendingFrom = null;
            updateDots(); redraw(); notify(ctx);
          });
          svg.appendChild(hit);
        }
        connections.forEach(c => drawLine(c.from, c.to, ''));
      }

      function updateDots() {
        dotMap.forEach((dot, id) => {
          dot.classList.toggle('am-dot-active', id === pendingFrom);
          dot.classList.toggle('am-dot-connected',
            connections.some(c => c.from === id || c.to === id));
        });
      }

      function handleHotspotClick(item) {
        if (disabled) return;
        if (item.side === 'left') {
          if (pendingFrom === item.id) {
            pendingFrom = null;
          } else {
            connections = connections.filter(c => c.from !== item.id);
            pendingFrom = item.id;
          }
          updateDots(); redraw();
        } else {
          if (!pendingFrom) return;
          connections = connections.filter(c => c.to !== item.id);
          connections.push({ from: pendingFrom, to: item.id });
          pendingFrom = null;
          updateDots(); redraw(); notify(ctx);
        }
      }

      // Crear overlays de hotspot para cada item con rect.
      allItems.forEach(item => {
        if (!item.rect) return;
        const hs = el('div', { class: `wpf-am-hotspot wpf-am-hs-${item.side}`, dataset: { id: item.id } });
        // Usar height exacto (no minHeight) para que el dot quede siempre centrado.
        hs.style.left   = (item.rect.x * 100) + '%';
        hs.style.top    = (item.rect.y * 100) + '%';
        hs.style.width  = (item.rect.w * 100) + '%';
        hs.style.height = (item.rect.h * 100) + '%';
        // Dot en el borde: derecho para izquierda, izquierdo para derecha.
        const dot = el('div', { class: 'wpf-am-dot' });
        hs.appendChild(dot);
        dotMap.set(item.id, dot);
        hs.addEventListener('click', e => { e.stopPropagation(); handleHotspotClick(item); });
        page.appendChild(hs);
      });

      const ro = new ResizeObserver(redraw);
      ro.observe(svgContainer);
      requestAnimationFrame(redraw);

      return {
        getAnswer: () => connections.slice(),
        setAnswer: v => {
          connections = Array.isArray(v) ? v.filter(c => c.from && c.to) : [];
          updateDots(); requestAnimationFrame(redraw);
        },
        isAnswered: () => connections.length > 0,
        setDisabled: b => { disabled = b; },
        markDetail() {
          svg.querySelectorAll('.wpf-am-line').forEach(line => {
            const from = line.getAttribute('data-from');
            const to   = line.getAttribute('data-to');
            const ok   = (cfg.pairs || []).some(p => p.from === from && p.to === to);
            line.classList.add(ok ? 'am-line-ok' : 'am-line-ko');
          });
          (cfg.pairs || []).forEach(pair => {
            if (connections.some(c => c.from === pair.from && c.to === pair.to)) return;
            const f = dotCenter(pair.from), t2 = dotCenter(pair.to);
            if (!f || !t2) return;
            const cx = (f.x + t2.x) / 2;
            const miss = document.createElementNS(svgNS, 'path');
            miss.setAttribute('d', `M${f.x},${f.y} C${cx},${f.y} ${cx},${t2.y} ${t2.x},${t2.y}`);
            miss.setAttribute('class', 'wpf-am-line am-line-missing');
            svg.insertBefore(miss, svg.firstChild);
          });
        }
      };
    }

    // ── Modo columnas (comportamiento original) ───────────────────────────────

    const wrap = el('div', { class: 'wpf-arrowmatch' });
    root.appendChild(wrap);

    const leftCol  = el('div', { class: 'wpf-am-col wpf-am-left-col'  });
    const rightCol = el('div', { class: 'wpf-am-col wpf-am-right-col' });
    wrap.appendChild(leftCol);
    wrap.appendChild(el('div', { class: 'wpf-am-gap' }));
    wrap.appendChild(rightCol);

    svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'wpf-am-svg');
    wrap.appendChild(svg);
    svgContainer = wrap;

    dotMap = new Map();

    function dotCenter(id) {
      const dot = dotMap.get(id);
      if (!dot) return null;
      const wr = svgContainer.getBoundingClientRect();
      const dr = dot.getBoundingClientRect();
      if (!wr.width) return null;
      return { x: dr.left + dr.width / 2 - wr.left, y: dr.top + dr.height / 2 - wr.top };
    }

    function redraw() {
      const wr = svgContainer.getBoundingClientRect();
      svg.setAttribute('width', wr.width || 0);
      svg.setAttribute('height', wr.height || 0);
      svg.textContent = '';

      function drawLine(fromId, toId, extraClass) {
        const f = dotCenter(fromId), t2 = dotCenter(toId);
        if (!f || !t2) return;
        const cx = (f.x + t2.x) / 2;
        const d = `M${f.x},${f.y} C${cx},${f.y} ${cx},${t2.y} ${t2.x},${t2.y}`;
        const vis = document.createElementNS(svgNS, 'path');
        vis.setAttribute('d', d);
        vis.setAttribute('class', 'wpf-am-line' + (extraClass ? ' ' + extraClass : ''));
        vis.setAttribute('data-from', fromId);
        vis.setAttribute('data-to', toId);
        svg.appendChild(vis);
        const hit = document.createElementNS(svgNS, 'path');
        hit.setAttribute('d', d);
        hit.setAttribute('class', 'wpf-am-hit');
        hit.setAttribute('pointer-events', 'stroke');
        hit.addEventListener('click', e => {
          if (disabled) return;
          e.stopPropagation();
          connections = connections.filter(c => !(c.from === fromId && c.to === toId));
          pendingFrom = null;
          wrap.classList.remove('am-pending');
          updateDots(); redraw(); notify(ctx);
        });
        svg.appendChild(hit);
      }

      connections.forEach(c => drawLine(c.from, c.to, ''));
    }

    function updateDots() {
      dotMap.forEach((dot, id) => {
        dot.classList.toggle('am-dot-active', id === pendingFrom);
        dot.classList.toggle('am-dot-connected',
          connections.some(c => c.from === id || c.to === id));
      });
    }

    function handleDotClick(item) {
      if (disabled) return;
      if (item.side === 'left') {
        if (pendingFrom === item.id) {
          pendingFrom = null; wrap.classList.remove('am-pending');
        } else {
          connections = connections.filter(c => c.from !== item.id);
          pendingFrom = item.id; wrap.classList.add('am-pending');
        }
        updateDots(); redraw();
      } else {
        if (!pendingFrom) return;
        connections = connections.filter(c => c.to !== item.id);
        connections.push({ from: pendingFrom, to: item.id });
        pendingFrom = null; wrap.classList.remove('am-pending');
        updateDots(); redraw(); notify(ctx);
      }
    }

    function makeItem(item) {
      const div = el('div', { class: 'wpf-am-item' });
      const content = el('div', { class: 'wpf-am-content' });
      if (item.src && ctx.fileUrl) {
        content.appendChild(el('img', { src: ctx.fileUrl(item.src), class: 'wpf-am-img', alt: item.label || '' }));
      } else {
        content.appendChild(el('span', { class: 'wpf-am-text' }, item.label || ''));
      }
      div.appendChild(content);
      const dot = el('div', { class: 'wpf-am-dot' });
      div.appendChild(dot);
      dotMap.set(item.id, dot);
      dot.addEventListener('click', e => { e.stopPropagation(); handleDotClick(item); });
      return div;
    }

    if (!leftItems.length && !rightItems.length) {
      wrap.appendChild(el('p', { class: 'wpf-am-empty' }, t('render.amEmpty')));
    }
    leftItems.forEach(item => leftCol.appendChild(makeItem(item)));
    rightItems.forEach(item => rightCol.appendChild(makeItem(item)));

    const ro = new ResizeObserver(redraw);
    ro.observe(wrap);
    requestAnimationFrame(redraw);

    return {
      getAnswer: () => connections.slice(),
      setAnswer: v => {
        connections = Array.isArray(v) ? v.filter(c => c.from && c.to) : [];
        updateDots(); requestAnimationFrame(redraw);
      },
      isAnswered: () => connections.length > 0,
      setDisabled: b => { disabled = b; wrap.classList.toggle('am-disabled', b); },
      markDetail() {
        svg.querySelectorAll('.wpf-am-line').forEach(line => {
          const from = line.getAttribute('data-from');
          const to   = line.getAttribute('data-to');
          const ok   = (cfg.pairs || []).some(p => p.from === from && p.to === to);
          line.classList.add(ok ? 'am-line-ok' : 'am-line-ko');
        });
        (cfg.pairs || []).forEach(pair => {
          if (connections.some(c => c.from === pair.from && c.to === pair.to)) return;
          const f = dotCenter(pair.from), t2 = dotCenter(pair.to);
          if (!f || !t2) return;
          const cx = (f.x + t2.x) / 2;
          const miss = document.createElementNS(svgNS, 'path');
          miss.setAttribute('d', `M${f.x},${f.y} C${cx},${f.y} ${cx},${t2.y} ${t2.x},${t2.y}`);
          miss.setAttribute('class', 'wpf-am-line am-line-missing');
          svg.insertBefore(miss, svg.firstChild);
        });
      }
    };
  }
};

// Opción única: radios con barajado opcional.
function choiceList(field, root, ctx) {
  const options = field.config.options || [];
  const order = ctx.shuffle ? shuffled(options.map((_, i) => i), ctx.rng) : options.map((_, i) => i);
  const group = uid();
  let value = null;
  const inputs = [];
  const wrap = el('div', { class: 'wpf-choices' + (field.config.horizontal ? ' wpf-choices--row' : '') });
  order.forEach(origIdx => {
    const input = el('input', { type: 'radio', name: group });
    input.addEventListener('change', () => { value = origIdx; notify(ctx); });
    inputs.push({ input, origIdx });
    wrap.appendChild(el('label', { class: 'wpf-choice' }, input, el('span', {}, options[origIdx])));
  });
  root.appendChild(wrap);
  return {
    getAnswer: () => value,
    setAnswer: v => {
      value = (v === null || v === undefined) ? null : Number(v);
      inputs.forEach(o => { o.input.checked = o.origIdx === value; });
    },
    isAnswered: () => value !== null,
    setDisabled: b => inputs.forEach(o => { o.input.disabled = b; })
  };
}

let uidCounter = 0;
function uid() {
  return 'wpfgrp' + (++uidCounter);
}
