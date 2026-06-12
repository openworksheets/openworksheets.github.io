// Comprueba la paleta agrupada (acordeón) y las formas de dibujo
// (line, arrow, rect, ellipse): creación en el editor, configuración
// y renderizado en la vista previa del alumno.
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

  let fails = 0;
  function check(name, ok) {
    if (!ok) fails++;
    console.log(`${name}: ${ok ? 'OK' : 'MAL'}`);
  }

  // --- Paleta agrupada ---
  const groups = await page.$$eval('.ed-group', ns => ns.map(n => n.dataset.group));
  check('4 grupos en la paleta', groups.join(',') === 'write,choose,relate,design');

  // Al entrar, todos los grupos están colapsados
  let open = await page.$$eval('.ed-group-tools.open', ns => ns.map(n => n.dataset.group));
  check('todos los grupos colapsados al inicio', open.length === 0);

  // Abrir «design» cierra el anterior
  await page.click('.ed-group[data-group="write"]');
  await page.click('.ed-group[data-group="design"]');
  open = await page.$$eval('.ed-group-tools.open', ns => ns.map(n => n.dataset.group));
  check('al abrir «design» solo queda ese grupo', open.join(',') === 'design');

  const designTools = await page.$$eval('.ed-group-tools[data-group="design"] .ed-tool',
    ns => ns.map(n => n.dataset.type));
  check('grupo design contiene las formas',
    ['line', 'arrow', 'rect', 'ellipse'].every(t => designTools.includes(t)));

  // Volver a pulsar lo cierra
  await page.click('.ed-group[data-group="design"]');
  open = await page.$$eval('.ed-group-tools.open', ns => ns.length);
  check('pulsar de nuevo cierra el grupo', open === 0);
  await page.click('.ed-group[data-group="design"]');

  // --- Página en blanco ---
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.ed-empty button')];
    btns[1].click(); // «Hoja en blanco»
  });
  await page.waitForSelector('.wpf-page img.fondo');
  await new Promise(r => setTimeout(r, 300));

  const pg = await page.$('.wpf-page');
  const pgr = await pg.boundingBox();

  async function drag(x1, y1, x2, y2) {
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 3 });
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 200));
  }

  // --- Crear cada forma ---
  const shapes = [
    { type: 'line', y: 100 },
    { type: 'arrow', y: 180 },
    { type: 'rect', y: 260 },
    { type: 'ellipse', y: 380 }
  ];
  for (const s of shapes) {
    await page.click(`.ed-tool[data-type="${s.type}"]`);
    await drag(pgr.x + 100, pgr.y + s.y, pgr.x + 350, pgr.y + s.y + 70);
    const svg = await page.$(`.ed-field-${s.type} svg.wpf-shape`);
    check(`forma ${s.type} creada con SVG en el editor`, Boolean(svg));
  }

  // --- Configurar la flecha: doble punta e invertir ---
  await page.click('.ed-field-arrow');
  await new Promise(r => setTimeout(r, 200));
  const arrowCfg = await page.evaluate(() => {
    const checks = [...document.querySelectorAll('#panel .check-row input[type="checkbox"]')];
    // line/arrow no tienen noScore (decorativos): los dos checkboxes son invertir y doble punta
    checks.forEach(c => { c.checked = true; c.dispatchEvent(new Event('change')); });
    const ln = document.querySelector('.ed-field-arrow svg.wpf-shape line');
    return {
      nChecks: checks.length,
      markerEnd: ln?.getAttribute('marker-end') || '',
      markerStart: ln?.getAttribute('marker-start') || ''
    };
  });
  check('flecha con punta en ambos extremos', arrowCfg.markerEnd !== '' && arrowCfg.markerStart !== '');

  // --- Configurar el rectángulo: relleno con opacidad y sin borde ---
  await page.click('.ed-field-rect');
  await new Promise(r => setTimeout(r, 200));
  const rectCfg = await page.evaluate(() => {
    const checks = [...document.querySelectorAll('#panel .check-row input[type="checkbox"]')];
    // checks[0] = «Con borde», último = «Con relleno»
    const fill = checks[checks.length - 1];
    fill.checked = true;
    fill.dispatchEvent(new Event('change'));
    const ranges = [...document.querySelectorAll('#panel input[type="range"]')];
    const op = ranges[ranges.length - 1]; // opacidad del relleno
    op.value = '0.5';
    op.dispatchEvent(new Event('input'));
    const borde = checks[0];
    borde.checked = false;
    borde.dispatchEvent(new Event('change'));
    const r = document.querySelector('.ed-field-rect svg.wpf-shape rect');
    return {
      fill: r?.getAttribute('fill') || '',
      fillOp: r?.getAttribute('fill-opacity') || '',
      stroke: r?.getAttribute('stroke') || ''
    };
  });
  check('rectángulo con relleno aplicado', rectCfg.fill !== '' && rectCfg.fill !== 'none');
  check('opacidad del relleno aplicada', rectCfg.fillOp === '0.5');
  check('rectángulo sin borde', rectCfg.stroke === 'none');

  // --- Vista previa: las cuatro formas se renderizan ---
  await page.click('#btnPrevia');
  await page.waitForSelector('.prev-overlay .wpf-page');
  await new Promise(r => setTimeout(r, 300));
  const prev = await page.evaluate(() => {
    const ov = document.querySelector('.prev-overlay');
    return {
      line: Boolean(ov.querySelector('.wpf-field-line svg.wpf-shape line')),
      arrow: Boolean(ov.querySelector('.wpf-field-arrow svg.wpf-shape line[marker-end]')),
      rect: Boolean(ov.querySelector('.wpf-field-rect svg.wpf-shape rect')),
      ellipse: Boolean(ov.querySelector('.wpf-field-ellipse svg.wpf-shape ellipse')),
      rectFill: ov.querySelector('.wpf-field-rect svg.wpf-shape rect')?.getAttribute('fill'),
      rectFillOp: ov.querySelector('.wpf-field-rect svg.wpf-shape rect')?.getAttribute('fill-opacity'),
      rectStroke: ov.querySelector('.wpf-field-rect svg.wpf-shape rect')?.getAttribute('stroke')
    };
  });
  check('previa: línea', prev.line);
  check('previa: flecha con punta', prev.arrow);
  check('previa: rectángulo', prev.rect);
  check('previa: elipse', prev.ellipse);
  check('previa: relleno del rectángulo conservado', prev.rectFill && prev.rectFill !== 'none');
  check('previa: opacidad y sin borde conservados', prev.rectFillOp === '0.5' && prev.rectStroke === 'none');

  console.log(fails ? '__TEST_FAIL__' : '__TEST_OK__');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
