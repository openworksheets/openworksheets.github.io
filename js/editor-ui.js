// Helpers de interfaz del editor sin estado propio: construyen y devuelven
// nodos del DOM o utilidades de color. Extraídos de editor.js.

import { el } from './util.js';
import { t } from './i18n.js';
import { ICONS } from './icons.js';

export function iconBtn(attrs, svgStr, label) {
  const b = el('button', attrs);
  b.innerHTML = svgStr + (label ? ' <span>' + label + '</span>' : '');
  return b;
}

// Devuelve true si el color hex es claro (para decidir el color del texto encima).
export function isLightColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

// Modo cuentagotas sobre la imagen de fondo de la ficha (fallback sin EyeDropper API).
export function pickColorFromPage(onPick) {
  const canvas = document.querySelector('#canvas');
  // Precarga todas las páginas con imagen de fondo en canvas ocultos
  const pages = [...canvas.querySelectorAll('.wpf-page')].map(pageEl => {
    const img = pageEl.querySelector('img.fondo');
    if (!img || !img.complete || !img.naturalWidth) return null;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    try {
      c.getContext('2d').drawImage(img, 0, 0);
      return { pageEl, c };
    } catch { return null; }
  }).filter(Boolean);

  const hint = el('div', { class: 'color-pick-hint' }, t('editor.eyedropperHint'));
  const swatch = el('div', { class: 'color-pick-swatch' });
  const swatchHex = el('span', { class: 'color-pick-hex' });
  swatch.appendChild(swatchHex);
  const overlay = el('div', { class: 'color-pick-overlay', tabIndex: '0' }, hint, swatch);
  document.body.appendChild(overlay);
  overlay.focus();

  let currentColor = null;

  overlay.addEventListener('mousemove', e => {
    let found = null;
    for (const { pageEl, c } of pages) {
      const r = pageEl.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        const px = Math.floor((e.clientX - r.left) / r.width  * c.width);
        const py = Math.floor((e.clientY - r.top)  / r.height * c.height);
        const d  = c.getContext('2d').getImageData(px, py, 1, 1).data;
        found = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
        break;
      }
    }
    currentColor = found;
    swatch.style.display = found ? 'flex' : 'none';
    if (found) {
      swatch.style.left = (e.clientX + 18) + 'px';
      swatch.style.top  = (e.clientY + 18) + 'px';
      swatch.style.background = found;
      swatchHex.textContent = found;
      swatchHex.style.color = isLightColor(found) ? '#000' : '#fff';
    }
  });

  overlay.addEventListener('click', () => {
    if (currentColor) onPick(currentColor);
    overlay.remove();
  });

  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') overlay.remove();
  });
}

// Input de color con botón cuentagotas.
// - Chromium: usa EyeDropper API (captura de cualquier punto de la pantalla).
// - Otros: captura de la imagen de fondo de la ficha.
// Devuelve { inp, wrap } — usar `wrap` para insertar en el DOM, `inp` para leer el valor.
export function colorInput(initValue, onChange) {
  const inp = el('input', { type: 'color', value: initValue });
  inp.addEventListener('input', () => onChange(inp.value));
  const wrap = el('div', { class: 'color-input-wrap' }, inp);
  if (window.EyeDropper) {
    const btn = iconBtn({ class: 'btn small ghost', type: 'button', title: t('editor.eyedropper') }, ICONS.pipette);
    btn.addEventListener('click', () => {
      new EyeDropper().open().then(r => {
        inp.value = r.sRGBHex;
        onChange(r.sRGBHex);
      }).catch(() => {});
    });
    wrap.appendChild(btn);
  } else {
    const btn = iconBtn({ class: 'btn small ghost', type: 'button', title: t('editor.eyedropperPage') }, ICONS.pipette);
    btn.addEventListener('click', () => pickColorFromPage(hex => { inp.value = hex; onChange(hex); }));
    wrap.appendChild(btn);
  }
  return { inp, wrap };
}

const EYE_SVG = '<svg class="eye-show" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-hide" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

export function pwToggleBtn(title) {
  const btn = el('button', { type: 'button', class: 'pw-toggle', title });
  btn.innerHTML = EYE_SVG;
  return btn;
}

export function askExportPassword() {
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

// Listener delegado para los botones de mostrar/ocultar contraseña.
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
