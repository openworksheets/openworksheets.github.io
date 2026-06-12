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
        const size = Math.max(4, Math.min(20, (seg.answers[0] || '').length + 2));
        const input = el('input', {
          class: 'wpf-gap-input', type: 'text', size: String(size), autocomplete: 'off',
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
    const zones = field.config.zones || [];
    const tokens = zones.map(z => String(z.answer ?? '')).filter(Boolean)
      .concat(field.config.distractors || []);
    const tokenOrder = shuffledIndices(tokens.length, ctx.rng);

    // assignment: zoneId → token (string) | null
    const assignment = {};
    zones.forEach(z => { assignment[z.id] = null; });
    let selectedToken = null;
    let disabled = false;

    root.classList.add('wpf-tray');
    const trayLabel = el('div', { class: 'wpf-tray-label' }, t('render.trayLabel'));
    const trayBox = el('div', { class: 'wpf-tray-tokens' });
    root.appendChild(trayLabel);
    root.appendChild(trayBox);

    // Las zonas de destino se colocan directamente sobre la página.
    const zoneEls = {};
    zones.forEach(z => {
      const zEl = el('div', { class: 'wpf-zone', dataset: { zone: z.id } });
      positionRect(zEl, z.rect);
      zEl.style.setProperty('--fs', field.fontScale || 1);
      zEl.addEventListener('click', () => {
        if (disabled) return;
        if (selectedToken !== null) {
          // Si la etiqueta estaba en otra zona, se libera.
          for (const id of Object.keys(assignment)) {
            if (assignment[id] === selectedToken) assignment[id] = null;
          }
          assignment[z.id] = selectedToken;
          selectedToken = null;
        } else if (assignment[z.id]) {
          assignment[z.id] = null;
        }
        paint();
        notify(ctx);
      });
      root.parentElement.appendChild(zEl);
      zoneEls[z.id] = zEl;
    });

    function usedTokens() {
      return new Set(Object.values(assignment).filter(Boolean));
    }

    function paint() {
      trayBox.textContent = '';
      const used = usedTokens();
      tokenOrder.forEach(ti => {
        const tk = tokens[ti];
        if (used.has(tk)) return;
        const btn = el('button', { class: 'wpf-token', type: 'button' }, tk);
        if (selectedToken === tk) btn.classList.add('selected');
        btn.disabled = disabled;
        btn.addEventListener('click', () => {
          selectedToken = selectedToken === tk ? null : tk;
          paint();
        });
        trayBox.appendChild(btn);
      });
      if (!trayBox.children.length) {
        trayBox.appendChild(el('span', { class: 'wpf-tray-empty' }, t('render.allPlaced')));
      }
      zones.forEach(z => {
        const zEl = zoneEls[z.id];
        zEl.textContent = assignment[z.id] || '';
        zEl.classList.toggle('filled', Boolean(assignment[z.id]));
        zEl.classList.toggle('armed', selectedToken !== null);
      });
    }
    paint();

    return {
      getAnswer: () => ({ ...assignment }),
      setAnswer: v => {
        const obj = v && typeof v === 'object' ? v : {};
        zones.forEach(z => { assignment[z.id] = obj[z.id] ?? null; });
        selectedToken = null;
        paint();
      },
      isAnswered: () => Object.values(assignment).some(Boolean),
      setDisabled: b => { disabled = b; selectedToken = null; paint(); },
      markDetail(result) {
        zones.forEach(z => {
          const ok = String(assignment[z.id] ?? '') === String(z.answer ?? '');
          zoneEls[z.id].classList.add(ok ? 'mark-ok' : 'mark-ko');
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
