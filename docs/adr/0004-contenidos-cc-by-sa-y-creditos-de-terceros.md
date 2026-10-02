# 4. Los contenidos son CC BY-SA 4.0 y el material de terceros se acredita en un solo archivo

Fecha: 2026-10-02 · Estado: aceptado

## Contexto

El código de OpenWorksheets tenía licencia AGPLv3, pero los contenidos (los
textos de la interfaz y de Características, las fichas de ejemplo y la
documentación) no tenían ninguna declarada. Las bibliotecas de `vendor/` se
citaban en el README sin su licencia, y qrcode-generator, los iconos de Lucide y
las tipografías no aparecían en ningún crédito visible para quien usa la
aplicación. La evaluación VCER del 23 de septiembre de 2026 dio un 1 en material
ajeno por eso.

## Decisión

- Los contenidos se publican con licencia CC BY-SA 4.0, en `LICENSE-CONTENIDOS`,
  como en las demás aplicaciones del autor. El código sigue en AGPLv3
  (`LICENSE`).
- `vendor/TERCEROS.md` recoge cada elemento ajeno con su autoría, su
  procedencia, su versión y su licencia, y los textos de esas licencias están en
  `vendor/licencias/` y `fonts/OFL.txt`. La autoría de cada tipografía sigue en
  `fonts/README.md`.
- El pie de la portada, Características y Entregas tiene un desplegable
  «Créditos», junto a «Privacidad» y «Uso de IA», con las dos licencias y un
  enlace a `vendor/TERCEROS.md`, en los cinco idiomas.

## Alternativas descartadas

- **Una página de créditos propia**: habría que traducirla a cinco idiomas y
  mantenerla al día por separado del archivo del repositorio. El desplegable
  sigue el formato que ya tiene el pie y remite a una sola lista.
- **Escribir los créditos completos en el pie**: lo alargaría en todas las
  páginas para un dato que se consulta poco.

## Consecuencias

Al añadir o actualizar una biblioteca, un icono o una tipografía hay que
actualizar `vendor/TERCEROS.md` y, si cambia la licencia, su texto en
`vendor/licencias/`.

Los paquetes exportados (web, SCORM e IMS CP) llevan `LICENSE`,
`LICENSE-CONTENIDOS`, `vendor/TERCEROS.md`, los textos de `vendor/licencias/` y
los de las tipografías, según la lista de `js/creditos.js` (desde la 1.36.0). El
ZIP del servidor MCP lleva `LICENSE`, `vendor/TERCEROS.md` y
`vendor/licencias/`, que añade la acción `.github/workflows/mcp-zip.yml`.
