// Smoke test del editor: carga editor.html, captura errores de página/consola
// y comprueba lo esencial que NO depende del entorno headless completo
// (paleta agrupada, apertura de grupos, creación de campo, panel).
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
