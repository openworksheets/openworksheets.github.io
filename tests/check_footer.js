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
      github: Boolean(pie.querySelector('a[href*="github.com/openworksheets"]')),
      issues: Boolean(pie.querySelector('a[href*="issues"]')),
      priv: Boolean(pie.querySelector('.pie-priv summary')),
      sinContador: !document.querySelector('meta[name^="analytics-"], script[src*="analytics"]'),
      sinCifras: !pie.querySelector('[data-analytics-summary], [data-analytics-total], [data-analytics-today]'),
      ia: Boolean(pie.querySelector('[data-i18n-html="footer.aiNotice"] a[href="https://jjdeharo.github.io/miae/?nivel=4"]')),
      creditos: Boolean(pie.querySelector('[data-i18n-html="footer.creditsNotice"] a[href*="vendor/TERCEROS.md"]')),
      vcer: Boolean(pie.querySelector('a[data-i18n="footer.vcer"][href*="/vcer/?r="]'))
    };
  });
  check('© Juan José de Haro', f.copy);
  check('enlace AGPLv3', f.agpl);
  check('enlace GitHub del repo', f.github);
  check('enlace issues', f.issues);
  check('popover de privacidad', f.priv);
  check('sin contador de visitas', f.sinContador);
  check('sin cifras de visitas en el pie', f.sinCifras);
  check('uso de IA con el nivel del MIAE', f.ia);
  check('créditos con enlace a TERCEROS.md', f.creditos);
  check('mención de la evaluación VCER', f.vcer);

  console.log(fails ? '__TEST_FAIL__' : '__TEST_OK__');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
