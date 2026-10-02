# Material de terceros

OpenWorksheets incluye las bibliotecas, los iconos y las tipografías de esta
lista. Todos se sirven desde el propio repositorio, sin pedir nada a otros
sitios, y todos tienen una licencia libre que permite reutilizarlos. Los textos
de las licencias están en [`licencias/`](licencias) y en
[`../fonts/OFL.txt`](../fonts/OFL.txt).

## Bibliotecas

| Biblioteca | Archivo | Para qué sirve | Autoría | Licencia |
|---|---|---|---|---|
| [pdf.js](https://mozilla.github.io/pdf.js/) 3.11.174 | `pdf.min.js`, `pdf.worker.min.js` | Convierte cada página de un PDF en imagen al importarlo. | Mozilla Foundation | [Apache 2.0](licencias/Apache-2.0.txt) |
| [JSZip](https://stuk.github.io/jszip/) 3.10.1 | `jszip.min.js` | Lee y escribe los paquetes `.owpkg` y `.owsub` y los ZIP de exportación. | Stuart Knightley y colaboradores; incluye pako, de Vitaly Puzrin y Andrei Tuputcyn (MIT) | [MIT o GPLv3](licencias/jszip-LICENSE.md), a elección; se usa con la MIT |
| [MathJax](https://www.mathjax.org/) 3.2.2, componente *tex-svg* | `mathjax-tex-svg.js` | Dibuja las fórmulas matemáticas y químicas. | MathJax Consortium | [Apache 2.0](licencias/Apache-2.0.txt) |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | `qrcode.min.js` | Genera el código QR del enlace que se comparte con el alumnado. | Kazuhiko Arase | [MIT](licencias/qrcode-generator-LICENSE.txt) |

## Iconos

Los iconos de la interfaz son de [Lucide](https://lucide.dev), de Lucide Icons
y colaboradores, con licencia [ISC](licencias/lucide-LICENSE.txt); los que
proceden de Feather, de Cole Bemis, tienen además licencia MIT, recogida en el
mismo archivo. Están copiados como trazados SVG en `js/icons.js` y
`js/fieldtypes.js`.

## Tipografías

Todas tienen la licencia [SIL Open Font License 1.1](../fonts/OFL.txt). La
autoría y la procedencia de cada una están en
[`../fonts/README.md`](../fonts/README.md): Nunito, Atkinson Hyperlegible,
Lexend, Andika, Patrick Hand, Lora y OpenDyslexic.

## Herramientas enlazadas

El botón «fx» del editor abre [EdiCuaTeX](https://edicuatex.github.io/), un
editor visual de fórmulas, en una ventana aparte. No forma parte de
OpenWorksheets ni se descarga con él.
