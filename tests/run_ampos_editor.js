// Mide la precisión del dibujo de áreas de arrowmatch en el editor:
// dibuja con el ratón en píxeles conocidos y comprueba que el overlay
// .ed-amitem queda exactamente donde se dibujó.
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

  // Página en blanco
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.ed-empty button')];
    btns[1].click(); // «Hoja en blanco»
  });
  await page.waitForSelector('.wpf-page img.fondo');
  await new Promise(r => setTimeout(r, 300));

  // Crear campo arrowmatch dibujándolo (su botón está en el grupo «Relacionar»)
  await page.click('.ed-group[data-group="relate"]');
  await new Promise(r => setTimeout(r, 400)); // esperar la animación del acordeón
  await page.click('.ed-tool[data-type="arrowmatch"]');
  const pg = await page.$('.wpf-page');
  const pgr = await pg.boundingBox();
  console.log('page box:', JSON.stringify(pgr));

  async function drag(x1, y1, x2, y2) {
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 3 });
    await page.mouse.move(x2, y2, { steps: 3 });
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 200));
  }

  // Campo grande
  await drag(pgr.x + 50, pgr.y + 100, pgr.x + pgr.width - 50, pgr.y + 500);
  const hasField = await page.$('.ed-field-arrowmatch');
  console.log('campo arrowmatch creado:', Boolean(hasField));

  // «Añadir par» en el panel
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('#panel button.add-row');
    if (!btn) return false;
    btn.click();
    return true;
  });
  console.log('botón añadir par pulsado:', clicked);
  await new Promise(r => setTimeout(r, 200));

  // Dibujar área izquierda en píxeles conocidos (relativos a la página)
  const L = { x: pgr.x + 100, y: pgr.y + 200, w: 150, h: 60 };
  await drag(L.x, L.y, L.x + L.w, L.y + L.h);

  // Dibujar área derecha (encadenada automáticamente)
  const R = { x: pgr.x + 500, y: pgr.y + 300, w: 150, h: 60 };
  await drag(R.x, R.y, R.x + R.w, R.y + R.h);

  // Medir los overlays resultantes
  const res = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.ed-amitem').forEach(n => {
      const r = n.getBoundingClientRect();
      out.push({ cls: n.className, left: r.left, top: r.top, w: r.width, h: r.height });
    });
    const img = document.querySelector('.wpf-page img.fondo').getBoundingClientRect();
    const pageR = document.querySelector('.wpf-page').getBoundingClientRect();
    return { items: out, img: { left: img.left, top: img.top, w: img.width, h: img.height }, pageR };
  });
  console.log('img:', JSON.stringify(res.img));
  let fails = 0;
  function check(name, exp, got) {
    // El overlay tiene borde 2px: comparamos border-box con lo dibujado
    const dx = Math.abs(got.left - exp.x);
    const dy = Math.abs(got.top - exp.y);
    const dw = Math.abs(got.w - exp.w);
    const dh = Math.abs(got.h - exp.h);
    const ok = dx <= 1.5 && dy <= 1.5 && dw <= 3 && dh <= 3;
    if (!ok) fails++;
    console.log(`${name}: dibujado (${exp.x},${exp.y} ${exp.w}x${exp.h}) → overlay (${got.left.toFixed(1)},${got.top.toFixed(1)} ${got.w.toFixed(1)}x${got.h.toFixed(1)}) desvío px: ${dx.toFixed(1)},${dy.toFixed(1)} ${ok ? 'OK' : 'MAL'}`);
  }
  const leftItem = res.items.find(i => i.cls.includes('ed-amitem-left'));
  const rightItem = res.items.find(i => i.cls.includes('ed-amitem-right'));
  if (!leftItem || !rightItem) { console.log('FALTAN overlays', JSON.stringify(res.items)); fails++; }
  else { check('izquierda', L, leftItem); check('derecha', R, rightItem); }

  // Fracciones normalizadas de lo dibujado, respecto al contenido de la página del editor
  const frac = await page.evaluate((L, R) => {
    const pg2 = document.querySelector('.wpf-page');
    const r = pg2.getBoundingClientRect();
    const cs = getComputedStyle(pg2);
    const left = r.left + parseFloat(cs.borderLeftWidth);
    const top = r.top + parseFloat(cs.borderTopWidth);
    const w = pg2.clientWidth, h = pg2.clientHeight;
    const f = o => ({ x: (o.x - left) / w, y: (o.y - top) / h, w: o.w / w, h: o.h / h });
    return { L: f(L), R: f(R) };
  }, L, R);

  // Abrir la vista previa y medir los hotspots allí
  await page.click('#btnPrevia');
  await page.waitForSelector('.prev-overlay .wpf-am-hotspot');
  await new Promise(r => setTimeout(r, 300));
  const prev = await page.evaluate(() => {
    const ov = document.querySelector('.prev-overlay');
    const img = ov.querySelector('.wpf-page img.fondo').getBoundingClientRect();
    const items = [...ov.querySelectorAll('.wpf-am-hotspot')].map(n => {
      const r = n.getBoundingClientRect();
      return {
        cls: n.className,
        x: (r.left - img.left) / img.width,
        y: (r.top - img.top) / img.height,
        w: r.width / img.width,
        h: r.height / img.height
      };
    });
    return { items };
  });
  function checkFrac(name, exp, got) {
    const dx = Math.abs(got.x - exp.x), dy = Math.abs(got.y - exp.y);
    const ok = dx < 0.003 && dy < 0.003;
    if (!ok) fails++;
    console.log(`previa ${name}: esperado (${exp.x.toFixed(4)},${exp.y.toFixed(4)}) → medido (${got.x.toFixed(4)},${got.y.toFixed(4)}) ${ok ? 'OK' : 'MAL'}`);
  }
  const pL = prev.items.find(i => i.cls.includes('hs-left'));
  const pR = prev.items.find(i => i.cls.includes('hs-right'));
  if (!pL || !pR) { console.log('FALTAN hotspots en previa', JSON.stringify(prev.items)); fails++; }
  else { checkFrac('izquierda', frac.L, pL); checkFrac('derecha', frac.R, pR); }

  console.log(fails ? '__TEST_FAIL__' : '__TEST_OK__');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
