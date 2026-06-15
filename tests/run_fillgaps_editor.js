// Comprueba la entrada unificada «Rellenar huecos» de la paleta: un solo botón
// que pregunta el modo antes de dibujar y, según la elección, crea un campo de
// «Completar huecos» (gaps) o de «Huecos en documento» (textboxes).
//   node tests/run_fillgaps_editor.js   (con el servidor en el puerto 8765)
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
  await page.goto('http://localhost:8765/editor.html', { waitUntil: 'networkidle0' });

  let fails = 0;
  const check = (name, ok) => { if (!ok) fails++; console.log(`${name}: ${ok ? 'OK' : 'MAL'}`); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const clickTool = type => page.evaluate(t => document.querySelector(`.ed-tool[data-type="${t}"]`)?.click(), type);
  const clickCard = re => page.evaluate(rx => {
    const c = [...document.querySelectorAll('#panel .ed-mode-card')].find(x => new RegExp(rx, 'i').test(x.textContent));
    if (c) c.click();
    return Boolean(c);
  }, re.source);

  // La paleta tiene «Rellenar huecos» y ya no los dos botones por separado.
  await page.click('.ed-group[data-group="write"]');
  const palette = await page.evaluate(() => ({
    fillgaps: !!document.querySelector('.ed-tool[data-type="fillgaps"]'),
    gaps: !!document.querySelector('.ed-tool[data-type="gaps"]'),
    textboxes: !!document.querySelector('.ed-tool[data-type="textboxes"]')
  }));
  check('paleta: existe «Rellenar huecos»', palette.fillgaps);
  check('paleta: sin botones gaps/textboxes sueltos', !palette.gaps && !palette.textboxes);

  // Página en blanco para poder dibujar.
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.ed-empty button')];
    btns[btns.length - 1].click();
  });
  await page.waitForSelector('.wpf-page img.fondo');
  await wait(300);
  const pg = await page.$('.wpf-page');
  const r = await pg.boundingBox();

  async function drag(x1, y1, x2, y2) {
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 3 });
    await page.mouse.up();
    await wait(200);
  }

  // Elegir la herramienta: aparece la pregunta (dos opciones), sin dibujar aún.
  await clickTool('fillgaps');
  await wait(150);
  const q = await page.evaluate(() => ({
    cards: document.querySelectorAll('#panel .ed-mode-card').length,
    drawing: document.querySelector('#lienzo, .ed-canvas, #canvas')?.classList.contains('drawing')
  }));
  check('al elegir «Rellenar huecos» aparece la pregunta (2 opciones)', q.cards === 2);

  // Modo 1: texto con huecos → crea un campo «gaps».
  check('elegir «texto con huecos»', await clickCard(/texto con huecos|text with blanks/));
  await wait(150);
  await drag(r.x + 60, r.y + 60, r.x + 320, r.y + 110);
  check('se crea un campo de «Completar huecos» (gaps)',
    (await page.$$eval('.ed-field-gaps', ns => ns.length)) >= 1);

  // Modo 2: huecos sobre el documento → crea un campo «textboxes».
  await clickTool('fillgaps');
  await wait(150);
  check('elegir «huecos sobre el documento»', await clickCard(/sobre el documento|on the document/));
  await wait(150);
  await drag(r.x + 60, r.y + 200, r.x + 200, r.y + 235);
  check('se crea un campo de «Huecos en documento» (textboxes)',
    (await page.$$eval('.ed-field-textboxes', ns => ns.length)) >= 1);

  // Flujo continuo: «Dibujar nuevo hueco» desde el panel del hueco (sin volver atrás).
  const hasAddBox = await page.evaluate(() =>
    [...document.querySelectorAll('#panel button')].some(b => /Dibujar nuevo hueco|Draw another blank/i.test(b.textContent)));
  check('el panel del hueco permite dibujar otro hueco', hasAddBox);
  await page.evaluate(() => {
    [...document.querySelectorAll('#panel button')].find(b => /Dibujar nuevo hueco|Draw another blank/i.test(b.textContent))?.click();
  });
  await drag(r.x + 60, r.y + 280, r.x + 220, r.y + 315);
  check('se crea un segundo hueco sin volver atrás',
    (await page.$$eval('.ed-tbbox', ns => ns.length)) >= 2);

  if (errors.length) {
    console.log('--- ERRORES DE PÁGINA/CONSOLA ---');
    errors.forEach(e => console.log('  ' + e));
    fails += errors.length;
  }
  console.log(fails ? '__TEST_FAIL__' : '__TEST_OK__');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
