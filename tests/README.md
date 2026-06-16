# Tests de OpenWorksheets

Pruebas de integración que se ejecutan en un navegador real.

```bash
# Desde la raíz del proyecto:
python3 -m http.server 8765 &

# Con puppeteer-core instalado (npm i puppeteer-core) y Chromium en el sistema:
node tests/run_headless.js tests/test_pdf.html tests/test_zip.html tests/test_player.html
```

También pueden abrirse directamente en el navegador
(`http://localhost:8765/tests/test_player.html`): el resultado aparece en
pantalla y termina con `__TEST_OK__` o `__TEST_FAIL__`.

- `test_player.html` — visor del alumno completo: identificación, respuesta de
  los distintos tipos de campo, autoguardado, corrección, nota, marcas e intentos.
- `test_zip.html` — exportación e importación del ZIP de ficha en el navegador.
- `test_pdf.html` — conversión de PDF a imágenes de página con pdf.js.
- `test_ampos.html` — precisión de posición de los hotspots de «Unir con
  flechas» en el visor respecto a la imagen de fondo (tolerancia < 1 px).
- `test_imgfield.html` — el campo imagen decorativa ocupa exactamente la caja
  dibujada (altura fija, no la proporción natural de la imagen).
- `run_ampos_editor.js` — script de puppeteer aparte: dibuja con el ratón las
  áreas de un par de «Unir con flechas» en el editor real y comprueba que el
  overlay y la vista previa coinciden al píxel
  (`node tests/run_ampos_editor.js`, con el servidor en el puerto 8765).
- `run_shapes_editor.js` — script de puppeteer aparte: comprueba la paleta
  agrupada (acordeón) y las formas de dibujo (línea, flecha, rectángulo,
  elipse): creación, configuración (puntas, relleno) y vista previa
  (`node tests/run_shapes_editor.js`, con el servidor en el puerto 8765).
- `run_crops_editor.js` — script de puppeteer aparte: modo «recortar del PDF»
  de «Arrastrar a zonas»: alterna el modo, dibuja una zona, marca un recorte
  (que recorta la imagen de la página), lo asigna a su zona y, en la vista
  previa, lo coloca por clic dejando el hueco de origen vacío
  (`node tests/run_crops_editor.js`, con el servidor en el puerto 8765).
- `run_fillgaps_editor.js` — script de puppeteer aparte: entrada unificada
  «Rellenar huecos» de la paleta; comprueba que pregunta el modo antes de
  dibujar y que crea un campo «gaps» o «textboxes» según la elección
  (`node tests/run_fillgaps_editor.js`, con el servidor en el puerto 8765).
- `run_zoom.js` — script de puppeteer aparte: zoom de página en el editor
  (botones, Ctrl+rueda) y en el visor del alumno, y transición del acordeón
  de la paleta (`node tests/run_zoom.js`, con el servidor en el puerto 8765).
- `test_scorm.html` — lógica de SCORM 1.2 sin navegador-LMS: parseo del
  `imsmanifest.xml` (árbol de navegación, recurso de entrada, detección de
  versión), el runtime `window.API` (LMSInitialize/SetValue/Commit/Finish y
  errores) y la conversión de la nota SCORM en puntuación de la ficha
  (`node tests/run_headless.js tests/test_scorm.html`).
- `run_scorm_editor.js` — script de puppeteer aparte: el campo SCORM en el
  editor (grupo «Interactivo» de la paleta, creación dibujándolo y panel de
  configuración con subida del paquete, modo de puntuación y menú)
  (`node tests/run_scorm_editor.js`, con el servidor en el puerto 8765).
- `test_player_scorm.html` — integración de extremo a extremo del campo SCORM
  1.2 en el visor: el Service Worker sirve un SCO, este localiza `window.API`,
  registra una nota (70/100) y se comprueba que se integra en la puntuación de
  la ficha (7/10). Requiere `tests/scorm-sw.js` (copia del SW de la raíz, para
  que el ámbito del worker cubra `/tests/`)
  (`node tests/run_headless.js tests/test_player_scorm.html`).
- `scorm-sw.js` — copia del Service Worker de la raíz, necesaria solo para que
  los tests servidos desde `/tests/` puedan registrarlo dentro de su ámbito. En
  la aplicación real el SW vive en la raíz.
- `run_embed_editor.js` — script de puppeteer aparte: el campo «Insertar» con
  selección de tipo (URL/HTML/ZIP/ELPX); al elegir «Web en ZIP» y subir
  `web-ejemplo.zip`, comprueba que la web se sirve en vivo en el lienzo y que
  «Cambiar tipo» reabre el selector
  (`node tests/run_embed_editor.js`, con el servidor en el puerto 8765).
- `web-ejemplo.zip` — web mínima (index.html + assets/style.css) para probar el
  modo «Web en ZIP» del campo «Insertar».
- `test_doc.pdf` — PDF mínimo usado por las pruebas.

Nota: `--virtual-time-budget` de Chromium headless no espera a los hilos de
codificación de imagen ni al worker de pdf.js; usa `run_headless.js` (espera real).
