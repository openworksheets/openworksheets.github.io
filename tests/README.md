# Tests de WorkPDF

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
- `test_doc.pdf` — PDF mínimo usado por las pruebas.

Nota: `--virtual-time-budget` de Chromium headless no espera a los hilos de
codificación de imagen ni al worker de pdf.js; usa `run_headless.js` (espera real).
