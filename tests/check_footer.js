const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-gpu'],
    headless: 'new'
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  page.on('pageerror', e => console.log('  [pageerror]', e.message));
  await page.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle0' });
  let fails = 0;
  const check = (n, ok) => { if (!ok) fails++; console.log(`${n}: ${ok ? 'OK' : 'MAL'}`); };

  const f = await page.evaluate(() => {
    const pie = document.querySelector('footer.pie');
    return {
      copy: /Juan José de Haro/.test(pie.textContent),
      agpl: Boolean(pie.querySelector('a[href*="agpl"]')),
      github: Boolean(pie.querySelector('a[href*="github.com/workpdf"]')),
      issues: Boolean(pie.querySelector('a[href*="issues"]')),
      priv: Boolean(pie.querySelector('.pie-priv summary')),
      metas: Boolean(document.querySelector('meta[name="analytics-site-id"]')),
      summaryHidden: getComputedStyle(pie.querySelector('[data-analytics-summary]')).display === 'none'
    };
  });
  check('© Juan José de Haro', f.copy);
  check('enlace AGPLv3', f.agpl);
  check('enlace GitHub del repo', f.github);
  check('enlace issues', f.issues);
  check('popover de privacidad', f.priv);
  check('metadatos analytics presentes', f.metas);
  check('resumen de visitas oculto al público', f.summaryHidden);

  // Abrir el popover de privacidad y capturar
  await page.click('footer.pie .pie-priv summary');
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => document.querySelector('footer.pie').scrollIntoView());
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: '/tmp/footer.png', clip: { x: 0, y: 400, width: 1200, height: 400 } });

  console.log(fails ? '__TEST_FAIL__' : '__TEST_OK__');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
