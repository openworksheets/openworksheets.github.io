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

import { el, shuffled, shuffledIndices } from './util.js';
import { parseGaps } from './fieldtypes.js';
import { t } from './i18n.js';

export function renderField(field, pageLayer, ctx) {
  const root = el('div', { class: `wpf-field wpf-field-${field.type}`, dataset: { id: field.id } });
  positionRect(root, field.rect);
  root.style.setProperty('--fs', field.fontScale || 1);
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
    if (src && ctx.fileUrl) {
      const url = ctx.fileUrl(src);
      if (url) root.appendChild(el('img', { src: url, class: 'wpf-img-decor', alt: '' }));
    }
    return emptyRenderer();
  },

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
    const wrap = el('div', { class: 'wpf-choices' });
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

    function paint() {
      list.textContent = '';
      arrangement.forEach((orig, pos) => {
        const up = el('button', { class: 'wpf-mini-btn', type: 'button', 'aria-label': t('render.moveUp') }, '▲');
        const down = el('button', { class: 'wpf-mini-btn', type: 'button', 'aria-label': t('render.moveDown') }, '▼');
        up.disabled = disabled || pos === 0;
        down.disabled = disabled || pos === arrangement.length - 1;
        up.addEventListener('click', () => move(pos, -1));
        down.addEventListener('click', () => move(pos, 1));
        list.appendChild(el('div', { class: 'wpf-order-item' },
          el('span', { class: 'wpf-order-num' }, String(pos + 1)),
          el('span', { class: 'wpf-order-text' }, items[orig]),
          el('span', { class: 'wpf-order-btns' }, up, down)));
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
    const zoneAnswers = z => Array.isArray(z.answers) && z.answers.length
      ? z.answers.map(String) : z.answer ? [String(z.answer)] : [];
    const tokens = zones.flatMap(zoneAnswers).concat(cfg.distractors || []);
    const tokenOrder = shuffledIndices(tokens.length, ctx.rng);

    function tokenImgUrl(label) {
      if (!label.startsWith('dtokens/') || !ctx.fileUrl) return null;
      return ctx.fileUrl(label) || null;
    }
    function tokenContent(label) {
      const url = tokenImgUrl(label);
      if (url) {
        const img = document.createElement('img');
        img.src = url; img.alt = label; img.className = 'wpf-token-img';
        return img;
      }
      return document.createTextNode(label);
    }
    function hasImg(label) { return Boolean(tokenImgUrl(label)); }

    // assignment: zoneId → string[]
    const assignment = {};
    zones.forEach(z => { assignment[z.id] = []; });
    let selectedToken = null;
    let dragToken = null;
    let disabled = false;

    root.classList.add('wpf-tray');
    const trayLabel = el('div', { class: 'wpf-tray-label' }, t('render.trayLabel'));
    const trayBox = el('div', { class: 'wpf-tray-tokens' });
    root.appendChild(trayLabel);
    root.appendChild(trayBox);

    // Devuelve un token a la bandeja eliminándolo de donde esté.
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

    // Permite soltar un token en la bandeja para devolverlo.
    trayBox.addEventListener('dragover', e => { if (!disabled && dragToken) e.preventDefault(); });
    trayBox.addEventListener('drop', e => {
      e.preventDefault();
      if (disabled || !dragToken) return;
      releaseToken(dragToken);
      dragToken = null; selectedToken = null;
      paint(); notify(ctx);
    });

    function usedTokens() {
      return new Set(Object.values(assignment).flat());
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
      btn.addEventListener('dragstart', e => {
        dragToken = tk; selectedToken = null;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', tk);
        requestAnimationFrame(() => btn.classList.add('dragging'));
      });
      btn.addEventListener('dragend', () => {
        dragToken = null;
        btn.classList.remove('dragging');
        paint();
      });
      return btn;
    }

    function paint() {
      trayBox.textContent = '';
      const used = usedTokens();
      tokenOrder.forEach(ti => {
        const tk = tokens[ti];
        if (used.has(tk)) return;
        trayBox.appendChild(makeTokenBtn(tk, { selected: selectedToken === tk }));
      });
      if (!trayBox.children.length) {
        trayBox.appendChild(el('span', { class: 'wpf-tray-empty' }, t('render.allPlaced')));
      }
      zones.forEach(z => {
        const zEl = zoneEls[z.id];
        zEl.textContent = '';
        assignment[z.id].forEach(tk => {
          const chipCls = 'wpf-zone-chip' + (hasImg(tk) ? ' has-img' : '');
          const chip = el('button', { class: chipCls, type: 'button', draggable: 'true', title: tk, dataset: { label: tk } });
          chip.appendChild(tokenContent(tk));
          chip.disabled = disabled;

          chip.addEventListener('click', e => {
            e.stopPropagation();
            if (disabled) return;
            releaseToken(tk);
            if (selectedToken === tk) selectedToken = null;
            paint(); notify(ctx);
          });
          // Drag desde la zona.
          chip.addEventListener('dragstart', e => {
            e.stopPropagation();
            dragToken = tk; selectedToken = null;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', tk);
            requestAnimationFrame(() => chip.classList.add('dragging'));
          });
          chip.addEventListener('dragend', () => {
            dragToken = null;
            paint();
          });
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
          const correct = zoneAnswers(z);
          const zEl = zoneEls[z.id];
          zEl.querySelectorAll('.wpf-zone-chip').forEach(chip => {
            chip.classList.add(correct.includes(chip.dataset.label) ? 'mark-ok' : 'mark-ko');
          });
          if (!assignment[z.id].length) zEl.classList.add('mark-ko');
        });
      }
    };
  },

  arrowmatch(field, root, ctx) {
    const cfg = field.config || {};
    const allItems = cfg.items || [];
    const leftItems = allItems.filter(i => i.side === 'left');
    const rightItems = allItems.filter(i => i.side === 'right');
    const svgNS = 'http://www.w3.org/2000/svg';

    let connections = []; // [{from, to}]
    let pendingFrom = null;
    let disabled = false;

    const wrap = el('div', { class: 'wpf-arrowmatch' });
    root.appendChild(wrap);

    const leftCol  = el('div', { class: 'wpf-am-col wpf-am-left-col'  });
    const rightCol = el('div', { class: 'wpf-am-col wpf-am-right-col' });
    wrap.appendChild(leftCol);
    wrap.appendChild(el('div', { class: 'wpf-am-gap' }));
    wrap.appendChild(rightCol);

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'wpf-am-svg');
    wrap.appendChild(svg);

    const dotMap = new Map(); // id → dot element

    function dotCenter(id) {
      const dot = dotMap.get(id);
      if (!dot) return null;
      const wr = wrap.getBoundingClientRect();
      const dr = dot.getBoundingClientRect();
      if (!wr.width) return null;
      return { x: dr.left + dr.width / 2 - wr.left, y: dr.top + dr.height / 2 - wr.top };
    }

    function redraw() {
      const wr = wrap.getBoundingClientRect();
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
        // wide hit area on top (pointer-events en atributo SVG para no heredar none del padre)
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
        // color existing lines
        svg.querySelectorAll('.wpf-am-line').forEach(line => {
          const from = line.getAttribute('data-from');
          const to   = line.getAttribute('data-to');
          const ok   = (cfg.pairs || []).some(p => p.from === from && p.to === to);
          line.classList.add(ok ? 'am-line-ok' : 'am-line-ko');
        });
        // dashed lines for missing correct pairs
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
  const wrap = el('div', { class: 'wpf-choices' });
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
