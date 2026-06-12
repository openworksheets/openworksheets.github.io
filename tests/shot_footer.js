const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-gpu'], headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  await page.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.querySelector('footer.pie .pie-priv').open = true);
  await new Promise(r => setTimeout(r, 200));
  const box = await page.evaluate(() => {
    const r = document.querySelector('footer.pie').getBoundingClientRect();
    return { y: r.top + scrollY, h: r.height };
  });
  await page.screenshot({ path: '/tmp/footer3.png', clip: { x: 0, y: Math.max(0, box.y - 180), width: 1200, height: box.h + 200 } });
  await browser.close();
})();
