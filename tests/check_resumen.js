const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('../vendor/jszip.min.js');

// La prueba fabrica sus dos fichas (con nota y sin nota): una página con un
// campo de respuesta corta cuya respuesta correcta es «azul».
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
async function makeFicha(file, showScore) {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({
    format: 'workpdf-ficha', version: 1, id: 'wpfresumen' + (showScore ? 'a' : 'b'),
    title: 'Ficha de prueba', author: '', instructions: '', lang: 'es',
    settings: { showScore, showCorrection: showScore, shuffle: false, maxAttempts: 0, encryptSubmissions: false },
    access: { desde: '', hasta: '', autoEntrega: false, tiempoLimite: 0, password: '' },
    pages: [{ image: 'pages/page-1.png', w: 1000, h: 1414, fields: [
      { id: 'f1', type: 'text', rect: { x: 0.1, y: 0.1, w: 0.4, h: 0.04 }, points: 1, fontScale: 1,
        config: { answers: ['azul'], ignoreCase: true, ignoreAccents: true, collapseSpaces: true } }
    ] }]
  }));
  zip.file('pages/page-1.png', PNG_1PX);
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }));
}

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
  // Pulsar «Copiar resumen». Si la ficha oculta la nota, el botón está
  // desactivado (decisión de junio de 2026, commit 92baf2d): no se copia nada.
  const disabled = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.al-resultado .acciones button')]
      .find(b => /Copiar resumen|Copy summary/.test(b.textContent));
    btn.click();
    return btn.disabled;
  });
  await new Promise(r => setTimeout(r, 300));
  const copied = await page.evaluate(() => window.__copied);
  console.log(`--- ${label} ---`);
  console.log(copied);
  await page.close();
  return { copied, disabled };
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-gpu'],
    headless: 'new'
  });
  let fails = 0;
  const check = (n, ok) => { if (!ok) fails++; console.log(`${n}: ${ok ? 'OK' : 'MAL'}`); };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ows-resumen-'));
  const fichaConNota = path.join(dir, 'ficha-de-prueba.owpkg');
  const fichaSinNota = path.join(dir, 'ficha-sin-nota.owpkg');
  await makeFicha(fichaConNota, true);
  await makeFicha(fichaSinNota, false);

  const conNota = await run(browser, fichaConNota, 'showScore: true');
  check('con nota: el botón está activo', !conNota.disabled);
  check('con nota: incluye puntuación', /Puntuación|Score/.test(conNota.copied));
  check('con nota: incluye recuento', /correcta|correct/.test(conNota.copied));
  check('con nota: incluye alumno y ficha', /Alumno X/.test(conNota.copied) && /Ficha de prueba/.test(conNota.copied));

  const sinNota = await run(browser, fichaSinNota, 'showScore: false');
  check('sin nota: el botón está desactivado', sinNota.disabled);
  check('sin nota: no se copia nada', sinNota.copied === '');

  console.log(fails ? '__TEST_FAIL__' : '__TEST_OK__');
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(fails ? 1 : 0);
})();
