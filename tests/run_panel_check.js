// Verificación del armazón común del panel de propiedades tras el rediseño.
// Crea varios tipos de campo, abre su panel y comprueba el orden de secciones
// (Contenido · Tamaño y posición · Estilo) y que las acciones van al final.
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-gpu'],
    headless: 'new'
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('[console.error] ' + m.text()); });

  // Fijar el idioma a español antes de cargar (el headless usa locale inglés).
  await page.evaluateOnNewDocument(() => localStorage.setItem('wpf-lang', 'es'));
  await page.goto('http://localhost:8765/editor.html', { waitUntil: 'networkidle0' });

  let fails = 0;
  const check = (name, ok) => { if (!ok) fails++; console.log(`${name}: ${ok ? 'OK' : 'MAL'}`); };

  // Hoja en blanco
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.ed-empty button')];
    btns[btns.length - 1].click();
  });
  await new Promise(r => setTimeout(r, 400));

  async function createAndSelect(group, type) {
    await page.evaluate(g => document.querySelector(`.ed-group[data-group="${g}"]`).click(), group);
    await new Promise(r => setTimeout(r, 100));
    await page.evaluate(t => document.querySelector(`.ed-tool[data-type="${t}"]`).click(), type);
    const pg = await page.$('.wpf-page');
    const box = await pg.boundingBox();
    // posición variable para no solapar
    const ox = 80 + Math.random() * 40;
    await page.mouse.move(box.x + ox, box.y + 80);
    await page.mouse.down();
    await page.mouse.move(box.x + ox + 180, box.y + 160);
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 400));
  }

  // Lee los títulos de sección y posición de las acciones en el panel actual.
  async function panelLayout() {
    return page.evaluate(() => {
      const panel = document.querySelector('.ed-panel');
      const order = [...panel.querySelectorAll('.ed-section-title, .ed-acciones-foot')]
        .map(n => n.classList.contains('ed-acciones-foot') ? '[ACCIONES]' : n.textContent.trim());
      const lastChild = panel.firstElementChild?.lastElementChild;
      const actionsLast = lastChild?.classList.contains('ed-acciones-foot');
      const colorOpacity = panel.querySelectorAll('.color-opacity').length;
      return { order, actionsLast, colorOpacity };
    });
  }

  // text → Contenido + Tamaño y posición + Estilo, acciones al final
  await createAndSelect('write', 'text');
  let L = await panelLayout();
  check('text: secciones Contenido/Tamaño/Estilo',
    L.order.includes('Contenido') && L.order.includes('Tamaño y posición') && L.order.includes('Estilo'));
  check('text: acciones al final', L.actionsLast === true);
  check('text: acciones tras Estilo (orden)',
    L.order.indexOf('Estilo') < L.order.indexOf('[ACCIONES]'));

  // rect (forma) → usa color+opacidad en relleno; acciones al final
  await createAndSelect('design', 'rect');
  // activar relleno para que aparezca el bloque color-opacidad
  await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.ed-panel .check-row')];
    const fill = labels.find(l => /relleno|fill/i.test(l.textContent));
    if (fill) fill.querySelector('input').click();
  });
  await new Promise(r => setTimeout(r, 150));
  L = await panelLayout();
  check('rect: bloque color+opacidad presente', L.colorOpacity >= 1);
  check('rect: acciones al final', L.actionsLast === true);

  // cover (tapar zona) → color+opacidad
  await createAndSelect('design', 'cover');
  L = await panelLayout();
  check('cover: bloque color+opacidad presente', L.colorOpacity >= 1);
  check('cover: acciones al final', L.actionsLast === true);

  // label (texto decorativo) → ahora con sección Estilo separada del Contenido
  await createAndSelect('design', 'label');
  L = await panelLayout();
  check('label: acciones al final', L.actionsLast === true);
  check('label: sección Tamaño y posición', L.order.includes('Tamaño y posición'));
  check('label: sección Estilo separada', L.order.includes('Contenido') && L.order.includes('Estilo'));
  check('label: Contenido antes que Estilo',
    L.order.indexOf('Contenido') < L.order.indexOf('Estilo'));

  // video (medio) → contenido (fuente/título) + sección Estilo (texto + marco)
  await createAndSelect('design', 'video');
  L = await panelLayout();
  check('video: sección Estilo separada', L.order.includes('Contenido') && L.order.includes('Estilo'));
  check('video: acciones al final', L.actionsLast === true);
  check('video: orden Contenido · Tamaño · Estilo · Acciones',
    L.order.indexOf('Contenido') < L.order.indexOf('Estilo') &&
    L.order.indexOf('Estilo') < L.order.indexOf('[ACCIONES]'));

  if (errors.length) {
    console.log('--- ERRORES ---');
    errors.forEach(e => console.log('  ' + e));
    fails += errors.length;
  } else {
    console.log('sin errores de página/consola: OK');
  }

  console.log(fails === 0 ? '__PANEL_OK__' : `__PANEL_FAIL__ (${fails})`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})();
