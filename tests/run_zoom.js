// Comprueba el zoom de página en el editor (botones y Ctrl+rueda)
// y en el visor del alumno (vista previa del editor).
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-gpu'],
    headless: 'new'
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.on('pageerror', e => console.log('  [pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('  [console.error]', m.text()); });
  await page.goto('http://localhost:8765/editor.html', { waitUntil: 'networkidle0' });

  let fails = 0;
  function check(name, ok, extra = '') {
    if (!ok) fails++;
    console.log(`${name}: ${ok ? 'OK' : 'MAL'}${extra ? ' (' + extra + ')' : ''}`);
  }

  // Página en blanco
  await page.evaluate(() => {
    [...document.querySelectorAll('.ed-empty button')][1].click();
  });
  await page.waitForSelector('.wpf-page img.fondo');
  await new Promise(r => setTimeout(r, 300));

  const boxWidth = () => page.$eval('.ed-pagebox', n => n.getBoundingClientRect().width);

  // --- Editor: botones de zoom ---
  check('control de zoom visible en el editor', Boolean(await page.$('.ed-zoom-wrap .zoom-ctrl')));
  const w0 = await boxWidth();
  await page.click('.ed-zoom-wrap .zoom-ctrl button:last-child'); // +
  const w1 = await boxWidth();
  check('zoom + agranda la página', w1 > w0 * 1.1, `${w0.toFixed(0)} → ${w1.toFixed(0)}`);

  await page.click('.ed-zoom-wrap .zoom-ctrl .zoom-pct'); // restablecer
  const w2 = await boxWidth();
  check('pulsar el porcentaje vuelve al 100%', Math.abs(w2 - w0) < 2, `${w2.toFixed(0)}`);

  await page.click('.ed-zoom-wrap .zoom-ctrl button:first-child'); // −
  const w3 = await boxWidth();
  check('zoom − encoge la página', w3 < w0 * 0.92, `${w3.toFixed(0)}`);
  await page.click('.ed-zoom-wrap .zoom-ctrl .zoom-pct');

  // --- Editor: Ctrl+rueda ---
  const pg = await page.$('.wpf-page');
  const b = await pg.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + 100);
  await page.keyboard.down('Control');
  await page.mouse.wheel({ deltaY: -120 });
  await page.keyboard.up('Control');
  await new Promise(r => setTimeout(r, 200));
  const w4 = await boxWidth();
  check('Ctrl+rueda acerca', w4 > w0 * 1.05, `${w0.toFixed(0)} → ${w4.toFixed(0)}`);
  await page.click('.ed-zoom-wrap .zoom-ctrl .zoom-pct');

  // --- Visor (vista previa): control en la barra inferior ---
  await page.click('#btnPrevia');
  await page.waitForSelector('.prev-overlay .al-barra .zoom-ctrl');
  await new Promise(r => setTimeout(r, 300));
  const docWidth = () => page.$eval('.prev-overlay .al-doc', n => n.getBoundingClientRect().width);
  const d0 = await docWidth();
  await page.click('.prev-overlay .al-barra .zoom-ctrl button:last-child'); // +
  const d1 = await docWidth();
  check('visor: zoom + agranda el documento', d1 > d0 * 1.1, `${d0.toFixed(0)} → ${d1.toFixed(0)}`);
  await page.click('.prev-overlay .al-barra .zoom-ctrl .zoom-pct');
  const d2 = await docWidth();
  check('visor: vuelta al 100%', Math.abs(d2 - d0) < 2, `${d2.toFixed(0)}`);

  // --- Acordeón con transición suave ---
  const trans = await page.$eval('.ed-group-tools', n => getComputedStyle(n).transitionDuration);
  check('acordeón con transición CSS', parseFloat(trans) > 0, `duración ${trans}`);

  console.log(fails ? '__TEST_FAIL__' : '__TEST_OK__');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
