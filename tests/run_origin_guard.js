// Prueba la protección de dominio de config.js sirviendo el sitio en local y
// simulando distintos hostnames con --host-resolver-rules.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const PORT = 8766;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const cases = [
  { name: 'local (localhost)',        host: 'localhost',                 expectGas: true,  expectNotice: false },
  { name: 'oficial (github.io)',      host: 'openworksheets.github.io',  expectGas: true,  expectNotice: false },
  { name: 'fork ajeno (otro dominio)',host: 'mifork.example.com',        expectGas: false, expectNotice: true  },
];

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const rules = cases.map(c => `MAP ${c.host} 127.0.0.1`).join(',');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-gpu', `--host-resolver-rules=${rules}`],
    headless: 'new'
  });

  let fails = 0;
  for (const c of cases) {
    const page = await browser.newPage();
    await page.goto(`http://${c.host}:${PORT}/index.html`, { waitUntil: 'networkidle0' });
    const r = await page.evaluate(() => ({
      gasUrl: window.OPENWORKSHEETS_CONFIG && window.OPENWORKSHEETS_CONFIG.gasUrl,
      foreign: !!(window.OPENWORKSHEETS_CONFIG && window.OPENWORKSHEETS_CONFIG.foreignDeployment),
      hasNotice: !!document.getElementById('ows-foreign-notice'),
      noticeText: (document.getElementById('ows-foreign-notice') || {}).textContent || '',
      docsLink: (document.querySelector('#ows-foreign-notice a') || {}).href || ''
    }));
    const gasOk = c.expectGas ? !!r.gasUrl : !r.gasUrl;
    const noticeOk = r.hasNotice === c.expectNotice;
    const ok = gasOk && noticeOk;
    if (!ok) fails++;
    console.log(`\n=== ${c.name} (${c.host}) ===`);
    console.log(`  gasUrl presente : ${!!r.gasUrl}  (esperado ${c.expectGas})  ${gasOk ? 'OK' : 'FALLO'}`);
    console.log(`  foreignDeployment: ${r.foreign}`);
    console.log(`  aviso visible   : ${r.hasNotice}  (esperado ${c.expectNotice})  ${noticeOk ? 'OK' : 'FALLO'}`);
    if (r.hasNotice) console.log(`  enlace docs     : ${r.docsLink}`);
    await page.close();
  }

  await browser.close();
  server.close();
  console.log(`\n${fails === 0 ? '__TEST_OK__ todos los escenarios correctos' : '__TEST_FAIL__ ' + fails + ' fallo(s)'}`);
  process.exit(fails);
})();
