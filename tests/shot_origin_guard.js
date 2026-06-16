// Captura el aviso de dominio ajeno en cada idioma de la aplicación.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const PORT = 8767;
const HOST = 'mifork.example.com';
const LANGS = ['es', 'ca', 'gl', 'eu', 'en'];

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

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-gpu', `--host-resolver-rules=MAP ${HOST} 127.0.0.1`],
    headless: 'new'
  });

  for (const lang of LANGS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 220 });
    // Fija el idioma como hace la app (localStorage 'wpf-lang') antes de cargar.
    await page.goto(`http://${HOST}:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(l => localStorage.setItem('wpf-lang', l), lang);
    await page.goto(`http://${HOST}:${PORT}/index.html`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#ows-foreign-notice');
    const txt = await page.evaluate(() =>
      document.getElementById('ows-foreign-notice').innerText.replace(/\s+/g, ' ').trim());
    console.log(`[${lang}] ${txt}`);
    const bar = await page.$('#ows-foreign-notice');
    await bar.screenshot({ path: path.join(__dirname, `origin_guard_${lang}.png`) });
    await page.close();
  }

  await browser.close();
  server.close();
  console.log('\nCapturas: tests/origin_guard_<idioma>.png');
})();
