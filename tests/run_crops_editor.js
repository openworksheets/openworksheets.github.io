// Comprueba el modo "recortar del PDF" del campo «Arrastrar a zonas»:
// alternar el modo, dibujar una zona y marcar un recorte (que recorta la
// imagen de la página), asignar la zona correcta y, en la vista previa del
// alumno, colocar la pieza en su zona por clic.
//   node tests/run_crops_editor.js   (con el servidor en el puerto 8765)
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

  async function drag(x1, y1, x2, y2) {
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 3 });
    await page.mouse.up();
    await wait(200);
  }

  // Página en blanco (tiene img.fondo, necesaria para recortar).
  await page.click('.ed-group[data-group="relate"]');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.ed-empty button')];
    btns[btns.length - 1].click(); // «Hoja en blanco»
  });
  await page.waitForSelector('.wpf-page img.fondo');
  await wait(300);
  const pg = await page.$('.wpf-page');
  const r = await pg.boundingBox();

  // Dibujar el campo «Arrastrar a zonas».
  await page.click('.ed-tool[data-type="dragdrop"]');
  await drag(r.x + 60, r.y + 40, r.x + 260, r.y + 90);
  check('campo dragdrop creado', (await page.$$eval('.ed-field', ns => ns.length)) >= 1);

  // Antes de elegir, el panel solo muestra la pregunta (dos opciones), no la config.
  const choiceShown = await page.evaluate(() => ({
    cards: document.querySelectorAll('#panel .ed-mode-card').length,
    hasZoneBtn: [...document.querySelectorAll('#panel .add-row')].some(b => /Dibujar zona|Draw drop zone/i.test(b.textContent))
  }));
  check('antes de elegir: pregunta con 2 opciones', choiceShown.cards === 2);
  check('antes de elegir: sin opciones del campo', choiceShown.hasZoneBtn === false);

  // Elegir el medio "recortar del PDF".
  const chosen = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#panel .ed-mode-card')]
      .find(c => /Recortar del PDF|Cut from the PDF/i.test(c.textContent));
    if (!card) return false;
    card.click();
    return true;
  });
  check('elegir "recortar del PDF"', chosen);
  await wait(200);

  // Dibujar una zona de destino. Al crearla se abre su panel.
  await page.evaluate(() => {
    [...document.querySelectorAll('#panel .add-row')].find(b => /Dibujar zona|Draw drop zone/i.test(b.textContent)).click();
  });
  await drag(r.x + 320, r.y + 250, r.x + 470, r.y + 320);
  check('zona de destino creada', (await page.$$eval('.ed-zone', ns => ns.length)) >= 1);

  // El panel de la zona ofrece marcar sus recortes (mismo sitio que la zona).
  const hasPieceBtn = await page.evaluate(() =>
    [...document.querySelectorAll('#panel .add-row')].some(b => /Marcar recorte|Mark a cut-out/i.test(b.textContent)));
  check('el panel de la zona permite marcar recortes', hasPieceBtn);

  // Flujo continuo: añadir otra zona desde el propio panel, sin volver atrás.
  const hasAddZone = await page.evaluate(() =>
    [...document.querySelectorAll('#panel .add-row')].some(b => /Añadir otra zona|Add another drop zone/i.test(b.textContent)));
  check('el panel de la zona permite añadir otra zona', hasAddZone);
  await page.evaluate(() => {
    [...document.querySelectorAll('#panel .add-row')].find(b => /Añadir otra zona|Add another drop zone/i.test(b.textContent)).click();
  });
  await drag(r.x + 320, r.y + 360, r.x + 460, r.y + 420);
  check('se crea una segunda zona sin volver atrás', (await page.$$eval('.ed-zone', ns => ns.length)) >= 2);

  // Marcar un recorte para esta zona.
  await page.evaluate(() => {
    [...document.querySelectorAll('#panel .add-row')].find(b => /Marcar recorte|Mark a cut-out/i.test(b.textContent)).click();
  });
  await drag(r.x + 80, r.y + 150, r.x + 200, r.y + 195);
  // El recorte se genera de forma asíncrona (carga de imagen + toBlob).
  await page.waitForSelector('.ed-piece', { timeout: 4000 }).catch(() => {});
  await wait(200);
  const piece = await page.evaluate(() => {
    const p = document.querySelector('.ed-piece');
    return { exists: Boolean(p), hasImg: Boolean(p?.querySelector('img.ed-piece-img')?.src?.startsWith('blob:')) };
  });
  check('recorte creado en el editor', piece.exists);
  check('recorte genera imagen (blob)', piece.hasImg);

  // El recorte queda asignado a la zona: aparece su miniatura en el panel de zona.
  const assigned = await page.evaluate(() =>
    document.querySelectorAll('#panel .opt-list img.tok-thumb').length >= 1);
  check('recorte asignado a la zona', assigned);

  // Volver al panel del campo y elegir un color de hueco en «Diseño».
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#panel button')].find(x => /Volver al campo|Back to field/i.test(x.textContent));
    if (b) b.click();
  });
  await wait(150);
  const colored = await page.evaluate(() => {
    const inp = document.querySelector('#panel .color-input-wrap input[type="color"]');
    if (!inp) return false;
    inp.value = '#ffeecc';
    inp.dispatchEvent(new Event('input'));
    return true;
  });
  check('selector de color del hueco en «Diseño»', colored);

  // Vista previa del alumno: la pieza parte de su hueco y la zona existe.
  await page.click('#btnPrevia');
  await page.waitForSelector('.prev-overlay .wpf-page');
  await wait(400);
  const pv = await page.evaluate(() => {
    const ov = document.querySelector('.prev-overlay');
    return {
      holes: ov.querySelectorAll('.wpf-hole').length,
      homePiece: ov.querySelectorAll('.wpf-hole-piece').length,
      zones: ov.querySelectorAll('.wpf-zone').length,
      hostNoPointer: getComputedStyle(ov.querySelector('.wpf-crops-host')).pointerEvents,
      holeBg: getComputedStyle(ov.querySelector('.wpf-hole')).backgroundColor,
      ...(() => {
        const hole = ov.querySelector('.wpf-hole');
        const img = ov.querySelector('.wpf-hole-piece img');
        const hr = hole.getBoundingClientRect();
        const ir = img.getBoundingClientRect();
        return { fillW: ir.width / hr.width, fillH: ir.height / hr.height };
      })()
    };
  });
  check('previa: hueco de origen', pv.holes >= 1);
  check('previa: pieza en su hueco', pv.homePiece >= 1);
  check('previa: zona de destino', pv.zones >= 1);
  check('previa: el host no intercepta clics', pv.hostNoPointer === 'none');
  check('previa: color del hueco aplicado', pv.holeBg === 'rgb(255, 238, 204)');
  check(`previa: el recorte llena el hueco (ancho ${pv.fillW.toFixed(2)}, alto ${pv.fillH.toFixed(2)})`,
    pv.fillW > 0.95 && pv.fillH > 0.95);

  // Colocar la pieza en la zona por clic (sin DnD nativo).
  await page.click('.prev-overlay .wpf-hole-piece');
  await wait(150);
  await page.click('.prev-overlay .wpf-zone');
  await wait(250);
  const placed = await page.evaluate(() => {
    const ov = document.querySelector('.prev-overlay');
    return {
      chip: ov.querySelectorAll('.wpf-zone .wpf-zone-chip').length,
      emptyHole: ov.querySelectorAll('.wpf-hole.empty').length
    };
  });
  check('previa: la pieza se coloca en la zona', placed.chip >= 1);
  check('previa: el hueco de origen queda vacío', placed.emptyHole >= 1);

  // Cerrar la previa y comprobar que cambiar de medio descarta los recortes
  // (evita imágenes huérfanas). Volvemos al campo y elegimos «Escribir las etiquetas».
  await page.click('.prev-aviso .btn');
  await wait(200);
  // En modo recorte el recuadro principal ya no es interactivo: se selecciona el
  // campo desde la lista de campos del panel.
  await page.evaluate(() => { document.querySelector('.lista-campos .item')?.click(); });
  await wait(150);
  await page.evaluate(() => { document.querySelector('#panel .ed-mode-head button')?.click(); });
  await wait(150);
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('#panel .ed-mode-card')]
      .find(c => /Escribir las etiquetas|Type the labels/i.test(c.textContent));
    if (card) card.click();
  });
  await wait(250);
  const piecesAfterSwitch = await page.$$eval('.ed-piece', ns => ns.length);
  check('cambiar de medio descarta los recortes', piecesAfterSwitch === 0);

  if (errors.length) {
    console.log('--- ERRORES DE PÁGINA/CONSOLA ---');
    errors.forEach(e => console.log('  ' + e));
    fails += errors.length;
  }
  console.log(fails ? '__TEST_FAIL__' : '__TEST_OK__');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
