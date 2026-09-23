# Fuentes alojadas

Todas las tipografías del catálogo están en esta carpeta y se declaran con
`@font-face` en `css/app.css`. Así la aplicación no pide nada a terceros y
funciona sin conexión, también dentro de los paquetes exportados (web, SCORM e
IMS CP), que copian solo las que usa cada ficha (`js/fonts.js`).

Todas tienen la licencia **SIL Open Font License 1.1** (OFL), que permite
usarlas, copiarlas y redistribuirlas: https://openfontlicense.org

## OpenDyslexic

- `opendyslexic-400.woff2` (Regular) y `opendyslexic-700.woff2` (Bold).
- Tipografía pensada para facilitar la lectura a personas con dislexia.
- Autor: Abelardo Gonzalez y colaboradores. https://opendyslexic.org
- Archivos obtenidos del paquete [`@fontsource/opendyslexic`](https://www.npmjs.com/package/@fontsource/opendyslexic).

## Tipografías de Google Fonts

Archivos `.woff2` descargados tal cual de Google Fonts el 23 de septiembre de
2026, en dos partes por estilo: latín básico (`-latin`) y latín ampliado
(`-latin-ext`). La autoría es la que consta en cada archivo.

| Tipografía | Archivos | Autoría | Origen |
|---|---|---|---|
| Nunito | `nunito-*` (500, 700, 900) | © 2014 The Nunito Project Authors | [Google Fonts](https://fonts.google.com/specimen/Nunito) |
| Atkinson Hyperlegible | `atkinson-*` (400, 400 cursiva, 700) | © 2020 Braille Institute of America, Inc. | [Google Fonts](https://fonts.google.com/specimen/Atkinson+Hyperlegible) |
| Lexend | `lexend-*` (400, 700) | © 2019 The Lexend Project Authors | [Google Fonts](https://fonts.google.com/specimen/Lexend) |
| Andika | `andika-*` (400, 400 cursiva, 700) | © 2004-2022 SIL International | [Google Fonts](https://fonts.google.com/specimen/Andika) |
| Patrick Hand | `patrick-*` (400) | © 2012 Patrick Wagesreiter | [Google Fonts](https://fonts.google.com/specimen/Patrick+Hand) |
| Lora | `lora-*` (400, 400 cursiva, 700) | © 2011 The Lora Project Authors, con el nombre reservado «Lora» | [Google Fonts](https://fonts.google.com/specimen/Lora) |

Nunito y Atkinson Hyperlegible son además las tipografías de la interfaz
(`--display` y `--cuerpo`). La opción «Monospace» usa la fuente monoespaciada
del sistema.

Para añadir una tipografía: dejar aquí sus `.woff2`, declararla en
`css/app.css` y añadirla con sus archivos (`files`) a `FONT_OPTIONS` en
`js/fonts.js`.
