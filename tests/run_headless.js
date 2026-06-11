const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-gpu'],
    headless: 'new'
  });
  let fails = 0;
  for (const target of process.argv.slice(2)) {
    const page = await browser.newPage();
    page.on('pageerror', e => console.log('  [pageerror]', e.message));
    page.on('console', m => { if (m.type() === 'error') console.log('  [console.error]', m.text()); });
    await page.goto('http://localhost:8765/' + target, { waitUntil: 'networkidle0' });
    try {
      await page.waitForFunction(
        () => document.getElementById('out').textContent.includes('__TEST_'),
        { timeout: 30000 });
    } catch { /* timeout: se muestra lo que haya */ }
    const text = await page.evaluate(() => document.getElementById('out').textContent);
    console.log('===', target, '===');
    console.log(text.trim());
    if (!text.includes('__TEST_OK__')) fails++;
    await page.close();
  }
  await browser.close();
  process.exit(fails);
})();
