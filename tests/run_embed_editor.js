// Comprueba el campo «Insertar (Web/HTML)»: al crearlo pregunta el tipo (URL,
// HTML, web en ZIP o paquete .elpx); al elegir «Web en ZIP» y subir un .zip con
// un index.html, la web se sirve en vivo en el lienzo (iframe).
//   node tests/run_embed_editor.js   (con el servidor en el puerto 8765)
const puppeteer = require('puppeteer-core');
const path = require('path');

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
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Failed to load resource:/i.test(text)) return;
    errors.push('[console.error] ' + text);
  });
  await page.goto('http://localhost:8765/editor.html', { waitUntil: 'networkidle0' });

  let fails = 0;
  const check = (name, ok) => { if (!ok) fails++; console.log(`${name}: ${ok ? 'OK' : 'MAL'}`); };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // Grupo «Interactivo» → herramienta embed.
  await page.click('.ed-group[data-group="external"]');
  await wait(150);
  check('paleta: existe el campo Insertar', await page.evaluate(() =>
    !!document.querySelector('.ed-tool[data-type="embed"]')));

  // Página en blanco y dibujar el campo.
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.ed-empty button')];
    btns[btns.length - 1].click();
  });
  await page.waitForSelector('.wpf-page img.fondo');
  await wait(300);
  const r = await (await page.$('.wpf-page')).boundingBox();
  await page.evaluate(() => document.querySelector('.ed-tool[data-type="embed"]').click());
  await wait(150);
  await page.mouse.move(r.x + 60, r.y + 60);
  await page.mouse.down();
  await page.mouse.move(r.x + 420, r.y + 320, { steps: 4 });
  await page.mouse.up();
  await wait(250);

  // Debe aparecer el selector de tipo con 4 opciones, sin opciones concretas aún.
  const cards = await page.$$eval('#panel .ed-mode-card', ns => ns.length);
  check('al crear «Insertar» pregunta el tipo (4 opciones)', cards === 4);

  // Elegir «URL» y comprobar que una URL conocida se normaliza para el iframe
  // del editor, igual que ocurre en otros medios basados en URL.
  await page.evaluate(() => document.querySelectorAll('#panel .ed-mode-card')[0].click());
  await wait(200);
  await page.type('#panel input[type="url"]', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await wait(250);
  const embedSrc = await page.evaluate(() =>
    document.querySelector('.ed-field-embed iframe.wpf-media-el')?.getAttribute('src') || '');
  check('la URL incrustada usa la ruta embed en la vista previa del editor',
    embedSrc === 'https://www.youtube.com/embed/dQw4w9WgXcQ');

  await page.evaluate(() => {
    const color = document.querySelector('#panel input[type="color"]');
    color.value = '#2a9d8f';
    color.dispatchEvent(new Event('input', { bubbles: true }));
    const num = [...document.querySelectorAll('#panel input[type="number"]')]
      .find(el => el.min === '0' && el.max === '14');
    num.value = '5';
    num.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await wait(250);
  const frame = await page.evaluate(() => {
    const body = document.querySelector('.ed-field-embed .wpf-media-body');
    if (!body) return null;
    const cs = getComputedStyle(body);
    return { width: cs.borderTopWidth, color: cs.borderTopColor };
  });
  check('el marco de Insertar se pinta en el lienzo con grosor configurable',
    frame && frame.width === '5px' && /42,\s*157,\s*143/.test(frame.color));

  // Elegir «Web en ZIP» (3.ª tarjeta: url, html, zip, elpx).
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#panel button')]
      .find(x => /Cambiar tipo|Change type|Canviar tipus|Aldatu mota/i.test(x.textContent));
    if (b) b.click();
  });
  await wait(200);
  await page.evaluate(() => document.querySelectorAll('#panel .ed-mode-card')[2].click());
  await wait(200);
  check('tras elegir, aparece el botón de subir la web', await page.evaluate(() =>
    !!document.querySelector('#panel .media-upload-btn')));

  // Subir el .zip de ejemplo y comprobar la vista en vivo (iframe) en el lienzo.
  const sample = path.resolve(__dirname, 'web-ejemplo.zip');
  const [chooser] = await Promise.all([
    page.waitForFileChooser(),
    page.click('#panel .media-upload-btn')
  ]);
  await chooser.accept([sample]);
  let liveFrame = false;
  for (let i = 0; i < 40; i++) {
    await wait(150);
    liveFrame = await page.evaluate(() =>
      !!document.querySelector('.ed-field-embed .wpf-media-el'));
    if (liveFrame) break;
  }
  check('la web del .zip se ve en vivo en el lienzo (iframe)', liveFrame);

  // Cambiar de tipo vuelve a mostrar el selector.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#panel button')]
      .find(x => /Cambiar tipo|Change type|Canviar tipus|Aldatu mota/i.test(x.textContent));
    if (b) b.click();
  });
  await wait(200);
  check('«Cambiar tipo» vuelve a mostrar el selector',
    (await page.$$eval('#panel .ed-mode-card', ns => ns.length)) === 4);

  if (errors.length) {
    console.log('--- ERRORES DE PÁGINA/CONSOLA ---');
    errors.forEach(e => console.log('  ' + e));
    fails += errors.length;
  }
  console.log(fails ? '__TEST_FAIL__' : '__TEST_OK__');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
