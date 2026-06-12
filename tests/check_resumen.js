const puppeteer = require('puppeteer-core');

async function run(browser, zipPath, label) {
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());
  await page.goto('http://localhost:8765/alumno.html', { waitUntil: 'networkidle0' });
  // Capturar lo que se copia al portapapeles
  await page.evaluate(() => {
    window.__copied = '';
    navigator.clipboard.writeText = txt => { window.__copied = txt; return Promise.resolve(); };
  });
  const input = await page.$('input[type="file"]');
  await input.uploadFile(zipPath);
  await page.waitForSelector('.al-tarjeta form input[type="text"]');
  await page.type('.al-tarjeta form input[type="text"]', 'Alumno X');
  await page.click('.al-tarjeta form button[type="submit"]');
  await page.waitForSelector('.wpf-page');
  await page.evaluate(() => {
    const i = document.querySelector('.wpf-field-text input');
    i.value = 'azul'; i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('.al-barra .btn.primary');
  await page.waitForSelector('.al-resultado');
  // Pulsar «Copiar resumen» (segundo botón)
  await page.evaluate(() => {
    [...document.querySelectorAll('.al-resultado .acciones button')]
      .find(b => /Copiar resumen|Copy summary/.test(b.textContent)).click();
  });
  await new Promise(r => setTimeout(r, 300));
  const copied = await page.evaluate(() => window.__copied);
  console.log(`--- ${label} ---`);
  console.log(copied);
  await page.close();
  return copied;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-gpu'],
    headless: 'new'
  });
  let fails = 0;
  const check = (n, ok) => { if (!ok) fails++; console.log(`${n}: ${ok ? 'OK' : 'MAL'}`); };

  const conNota = await run(browser, '/tmp/ficha-de-prueba.zip', 'showScore: true');
  check('con nota: incluye puntuación', /Puntuación|Score/.test(conNota));
  check('con nota: incluye recuento', /correcta|correct/.test(conNota));

  const sinNota = await run(browser, '/tmp/ficha-sin-nota.zip', 'showScore: false');
  check('sin nota: NO incluye puntuación', !/Puntuación|Score/.test(sinNota));
  check('sin nota: NO incluye recuento', !/correcta|incorrect|blanco|blank/.test(sinNota));
  check('sin nota: mantiene el código', /[0-9A-F]{4}-[0-9A-F]{4}/.test(sinNota));
  check('sin nota: mantiene alumno y ficha', /Alumno X/.test(sinNota) && /Ficha de prueba/.test(sinNota));

  console.log(fails ? '__TEST_FAIL__' : '__TEST_OK__');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
