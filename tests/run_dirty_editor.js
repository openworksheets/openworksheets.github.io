// Comprueba el control de cambios sin guardar (state.dirty): una ficha nueva
// en blanco NO debe avisar de "se perderan los cambios" al reemplazarla (no se
// ha tocado nada), pero si tras colocar un campo.
//   node tests/run_dirty_editor.js   (con el servidor en el puerto 8765)
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-gpu'], headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.evaluateOnNewDocument(() => localStorage.setItem('wpf-lang', 'es'));
  let dialogShown = false;
  page.on('dialog', async d => { dialogShown = true; await d.accept(); });
  await page.goto('http://localhost:8765/editor.html', { waitUntil: 'networkidle0' });
  let fails=0; const check=(n,ok)=>{ if(!ok)fails++; console.log(`${n}: ${ok?'OK':'MAL'}`); };
  const wait=ms=>new Promise(r=>setTimeout(r,ms));

  // 1) Ficha nueva en blanco desde la pantalla inicial
  await page.evaluate(()=>{ const b=[...document.querySelectorAll('.ed-empty button')]; b[b.length-1].click(); });
  await wait(500);
  check('se crea la página en blanco', (await page.$$eval('.wpf-page', n=>n.length))===1);

  // 2) Abrir «ficha nueva» otra vez: no debe avisar (no hay cambios)
  dialogShown=false;
  await page.click('#btnArchivo'); await wait(150);
  await page.click('#miBlank'); await wait(500);
  check('ficha en blanco NO avisa de cambios al reemplazar', dialogShown===false);

  // 3) Colocar un campo → ahora sí hay cambios
  await page.evaluate(()=>document.querySelector('.ed-group[data-group="write"]').click()); await wait(80);
  await page.evaluate(()=>document.querySelector('.ed-tool[data-type="text"]').click());
  const pg=await page.$('.wpf-page'); const box=await pg.boundingBox();
  await page.mouse.move(box.x+80,box.y+80); await page.mouse.down(); await page.mouse.move(box.x+300,box.y+140); await page.mouse.up();
  await wait(600); // dejar que el historial/commit corra
  // 4) Reemplazar ahora SÍ debe avisar
  dialogShown=false;
  await page.click('#btnArchivo'); await wait(150);
  await page.click('#miBlank'); await wait(400);
  check('tras colocar un campo SÍ avisa de cambios', dialogShown===true);

  console.log(fails? '__FAIL__':'__OK__');
  await browser.close();
  process.exit(fails?1:0);
})();
