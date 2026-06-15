// Smoke test del editor: carga editor.html, captura errores de página/consola
// y comprueba lo esencial que NO depende del entorno headless completo
// (paleta agrupada, apertura de grupos, creación y borrado de campo,
// y «ficha nueva» — que ejercita las rutas de limpieza de estado/recursos).
// Útil como señal de regresión para refactors de editor.js.
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
  page.on('dialog', d => d.accept()); // aceptar el confirm() de «ficha nueva»

  await page.goto('http://localhost:8765/editor.html', { waitUntil: 'networkidle0' });

  let fails = 0;
  const check = (name, ok) => { if (!ok) fails++; console.log(`${name}: ${ok ? 'OK' : 'MAL'}`); };

  // Paleta: 4 grupos, todos colapsados al inicio
  const groups = await page.$$eval('.ed-group', ns => ns.map(n => n.dataset.group));
  check('4 grupos en la paleta', groups.join(',') === 'write,choose,relate,design');
  let open = await page.$$eval('.ed-group-tools.open', ns => ns.length);
  check('grupos colapsados al inicio', open === 0);

  // Abrir un grupo y comprobar que muestra herramientas
  await page.click('.ed-group[data-group="write"]');
  open = await page.$$eval('.ed-group-tools.open', ns => ns.length);
  check('abrir grupo «write»', open === 1);

  // Añadir hoja en blanco (no esperamos img.fondo: depende del entorno)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.ed-empty button')];
    btns[btns.length - 1].click(); // último = «Hoja en blanco»
  });
  await new Promise(r => setTimeout(r, 400));
  const pages = await page.$$eval('.wpf-page', ns => ns.length);
  check('se crea una página', pages >= 1);

  // Título editable sin romper estado
  await page.type('#titulo', 'Prueba');
  const titulo = await page.$eval('#titulo', n => n.value);
  check('título escribible', titulo.includes('Prueba'));

  // Dibujar un campo (createField + selección de estado)
  await page.evaluate(() => {
    (document.querySelector('.ed-tool[data-type="shorttext"]') || document.querySelector('.ed-tool')).click();
  });
  const pg = await page.$('.wpf-page');
  if (pg) {
    const box = await pg.boundingBox();
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 180);
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 300));
  }
  check('se dibuja un campo', (await page.$$eval('.ed-field', ns => ns.length)) >= 1);

  // «Ficha nueva»: limpia manifest, files y la cache de object URLs.
  // Es la ruta que dependía de `urls` compartido entre módulos.
  await page.click('#btnNueva');
  await new Promise(r => setTimeout(r, 400));
  check('ficha nueva vuelve al estado vacío', (await page.$$eval('.ed-empty', ns => ns.length)) === 1);
  check('ficha nueva no deja páginas', (await page.$$eval('.wpf-page', ns => ns.length)) === 0);
  check('ficha nueva limpia el título', (await page.$eval('#titulo', n => n.value)) === '');

  if (errors.length) {
    console.log('--- ERRORES DE PÁGINA/CONSOLA ---');
    errors.forEach(e => console.log('  ' + e));
    fails += errors.length;
  } else {
    console.log('sin errores de página/consola: OK');
  }

  console.log(fails === 0 ? '__SMOKE_OK__' : `__SMOKE_FAIL__ (${fails})`);
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})();
