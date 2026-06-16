// Comprueba el campo SCORM en el editor: existe en la paleta (grupo
// «Interactivo»), se crea dibujándolo y muestra su panel de configuración
// (subida del paquete, modo de puntuación y menú de navegación).
//   node tests/run_scorm_editor.js   (con el servidor en el puerto 8765)
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

  // El grupo «Interactivo» (external) contiene el campo SCORM.
  await page.click('.ed-group[data-group="external"]');
  await wait(150);
  check('paleta: existe el campo SCORM', await page.evaluate(() =>
    !!document.querySelector('.ed-tool[data-type="scorm"]')));

  // Página en blanco para poder dibujar.
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.ed-empty button')];
    btns[btns.length - 1].click();
  });
  await page.waitForSelector('.wpf-page img.fondo');
  await wait(300);
  const pg = await page.$('.wpf-page');
  const r = await pg.boundingBox();

  // Elegir la herramienta SCORM y dibujar el campo.
  await page.evaluate(() => document.querySelector('.ed-tool[data-type="scorm"]').click());
  await wait(150);
  await page.mouse.move(r.x + 60, r.y + 60);
  await page.mouse.down();
  await page.mouse.move(r.x + 420, r.y + 320, { steps: 4 });
  await page.mouse.up();
  await wait(250);

  check('se crea un campo SCORM en el lienzo',
    (await page.$$eval('.ed-field-scorm', ns => ns.length)) >= 1);
  check('el campo muestra el placeholder',
    await page.evaluate(() => !!document.querySelector('.ed-field-scorm .ed-scorm-prev')));

  // El panel del campo ofrece subir paquete, modo de puntuación y menú.
  const panel = await page.evaluate(() => ({
    upload: !!document.querySelector('#panel .media-upload-btn'),
    selects: document.querySelectorAll('#panel select').length,
    checks: document.querySelectorAll('#panel input[type="checkbox"]').length
  }));
  check('el panel ofrece subir el paquete SCORM', panel.upload);
  check('el panel tiene el selector de puntuación', panel.selects >= 1);
  check('el panel tiene el conmutador de menú', panel.checks >= 1);

  await page.evaluate(() => {
    const color = document.querySelector('#panel input[type="color"]');
    color.value = '#e76f51';
    color.dispatchEvent(new Event('input', { bubbles: true }));
    const num = [...document.querySelectorAll('#panel input[type="number"]')]
      .find(el => el.min === '0' && el.max === '14');
    num.value = '4';
    num.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await wait(200);
  const placeholderFrame = await page.evaluate(() => {
    const box = document.querySelector('.ed-field-scorm .ed-scorm-prev');
    if (!box) return null;
    const cs = getComputedStyle(box);
    return { width: cs.borderTopWidth, color: cs.borderTopColor };
  });
  check('el marco del SCORM se pinta también en el placeholder del editor',
    placeholderFrame && placeholderFrame.width === '4px' && /231,\s*111,\s*81/.test(placeholderFrame.color));

  // Subir el paquete SCORM de ejemplo y comprobar la vista en vivo en el lienzo.
  const path = require('path');
  const sample = path.resolve(__dirname, '../ejemplos/scorm-ejemplo.zip');
  const [chooser] = await Promise.all([
    page.waitForFileChooser(),
    page.click('#panel .media-upload-btn')
  ]);
  await chooser.accept([sample]);
  // Esperar a que se descomprima, se aprovisione (SW) y cargue el iframe.
  let liveFrame = false;
  for (let i = 0; i < 40; i++) {
    await wait(150);
    liveFrame = await page.evaluate(() =>
      !!document.querySelector('.ed-field-scorm .wpf-scorm-frame'));
    if (liveFrame) break;
  }
  check('vista en vivo del SCORM en el lienzo (iframe)', liveFrame);
  check('el campo ya no muestra el placeholder vacío',
    await page.evaluate(() => !document.querySelector('.ed-field-scorm .ed-scorm-prev')));
  const liveFrameBorder = await page.evaluate(() => {
    const body = document.querySelector('.ed-field-scorm .wpf-media-body');
    if (!body) return null;
    const cs = getComputedStyle(body);
    return { width: cs.borderTopWidth, color: cs.borderTopColor };
  });
  check('el marco del SCORM se mantiene en la vista en vivo',
    liveFrameBorder && liveFrameBorder.width === '4px' && /231,\s*111,\s*81/.test(liveFrameBorder.color));

  // Paquete con varios SCO: el menú de navegación debe verse en el lienzo y
  // ocultarse al desmarcar «Mostrar menú» (sin pasar por la vista previa).
  const multi = path.resolve(__dirname, 'scorm-multi.zip');
  const [chooser2] = await Promise.all([
    page.waitForFileChooser(),
    page.click('#panel .media-upload-btn')
  ]);
  await chooser2.accept([multi]);
  let menuVisible = false;
  for (let i = 0; i < 40; i++) {
    await wait(150);
    menuVisible = await page.evaluate(() => {
      const m = document.querySelector('.ed-field-scorm .wpf-scorm-toc');
      return !!m && !m.hidden && m.querySelectorAll('.wpf-scorm-tocitem').length >= 2;
    });
    if (menuVisible) break;
  }
  check('menú de navegación visible en el lienzo (paquete multi-SCO)', menuVisible);

  // Desmarcar el conmutador «Mostrar menú» (2.º checkbox del panel: 1.º es «no puntúa»).
  await page.evaluate(() => {
    const cbs = document.querySelectorAll('#panel input[type="checkbox"]');
    cbs[cbs.length - 1].click();
  });
  let menuHidden = false;
  for (let i = 0; i < 20; i++) {
    await wait(150);
    menuHidden = await page.evaluate(() => {
      const m = document.querySelector('.ed-field-scorm .wpf-scorm-toc');
      return !m || m.hidden;
    });
    if (menuHidden) break;
  }
  check('al desmarcar «Mostrar menú» el menú desaparece en el lienzo', menuHidden);

  // Título: escribirlo en el panel debe mostrarlo en el lienzo (como vídeo/audio).
  await page.evaluate(() => {
    const inp = document.querySelector('#panel input[type="text"]');
    inp.value = 'Mi actividad SCORM';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  let titleShown = false;
  for (let i = 0; i < 20; i++) {
    await wait(150);
    titleShown = await page.evaluate(() => {
      const tEl = document.querySelector('.ed-field-scorm .wpf-media-title');
      return !!tEl && /Mi actividad SCORM/.test(tEl.textContent);
    });
    if (titleShown) break;
  }
  check('el título se muestra en el lienzo', titleShown);

  if (errors.length) {
    console.log('--- ERRORES DE PÁGINA/CONSOLA ---');
    errors.forEach(e => console.log('  ' + e));
    fails += errors.length;
  }
  console.log(fails ? '__TEST_FAIL__' : '__TEST_OK__');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
