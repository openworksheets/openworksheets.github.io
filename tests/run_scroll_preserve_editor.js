// Verifica que al crear/duplicar/pegar un campo el lienzo del editor conserva
// su scroll vertical, en lugar de volver arriba del todo.
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
  const check = (name, ok, extra = '') => {
    if (!ok) fails++;
    console.log(`${name}: ${ok ? 'OK' : 'MAL'}${extra ? ' (' + extra + ')' : ''}`);
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function dragOnPage(x1, y1, x2, y2) {
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 4 });
    await page.mouse.up();
    await wait(250);
  }

  async function canvasScrollTop() {
    return await page.$eval('#canvas', n => n.scrollTop);
  }

  async function setCanvasScrollTop(v) {
    await page.$eval('#canvas', (n, top) => { n.scrollTop = top; }, v);
    await wait(150);
  }

  // Hoja en blanco para disponer del lienzo completo.
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.ed-empty button')];
    btns[btns.length - 1].click();
  });
  await page.waitForSelector('.wpf-page img.fondo');
  await wait(300);

  // Abrir grupo y crear un campo a media página con scroll previo.
  await page.click('.ed-group[data-group="write"]');
  await wait(150);
  await setCanvasScrollTop(900);
  const beforeCreate = await canvasScrollTop();
  await page.evaluate(() => document.querySelector('.ed-tool[data-type="text"]')?.click());
  const pg = await page.$('.wpf-page');
  const box = await pg.boundingBox();
  await dragOnPage(box.x + 120, box.y + 250, box.x + 320, box.y + 315);
  const afterCreate = await canvasScrollTop();
  check('crear campo conserva el scroll',
    Math.abs(afterCreate - beforeCreate) <= 8,
    `${beforeCreate.toFixed(0)} → ${afterCreate.toFixed(0)}`);

  // Duplicar el campo seleccionado no debe recolocar el lienzo.
  await setCanvasScrollTop(1100);
  const beforeDup = await canvasScrollTop();
  await page.keyboard.down('Control');
  await page.keyboard.press('d');
  await page.keyboard.up('Control');
  await wait(250);
  const afterDup = await canvasScrollTop();
  check('duplicar campo conserva el scroll',
    Math.abs(afterDup - beforeDup) <= 8,
    `${beforeDup.toFixed(0)} → ${afterDup.toFixed(0)}`);

  // Copiar y pegar en la misma página tampoco debe subir arriba.
  await setCanvasScrollTop(1300);
  const beforePaste = await canvasScrollTop();
  await page.keyboard.down('Control');
  await page.keyboard.press('c');
  await page.keyboard.press('v');
  await page.keyboard.up('Control');
  await wait(250);
  const afterPaste = await canvasScrollTop();
  check('pegar campo conserva el scroll',
    Math.abs(afterPaste - beforePaste) <= 8,
    `${beforePaste.toFixed(0)} → ${afterPaste.toFixed(0)}`);

  // Señal adicional: tras pegar no debe volver al inicio del lienzo.
  check('el lienzo no vuelve arriba del todo', afterPaste > 100, String(afterPaste.toFixed(0)));

  if (errors.length) {
    console.log('--- ERRORES DE PÁGINA/CONSOLA ---');
    errors.forEach(e => console.log('  ' + e));
    fails += errors.length;
  }

  console.log(fails ? '__TEST_FAIL__' : '__TEST_OK__');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
