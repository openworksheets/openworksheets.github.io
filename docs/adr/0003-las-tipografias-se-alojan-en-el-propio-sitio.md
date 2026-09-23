# 3. Las tipografías se alojan en el propio sitio

Fecha: 2026-09-23 · Estado: aceptado

## Contexto

Seis de las siete tipografías del catálogo (Nunito, Atkinson Hyperlegible,
Lexend, Andika, Patrick Hand y Lora) se cargaban desde Google Fonts con un
`@import` en `css/app.css`; solo OpenDyslexic estaba en `fonts/`. Eso tenía
tres consecuencias:

- El navegador de quien abría la aplicación, también el del alumnado al hacer
  una ficha, pedía las tipografías a Google, que recibía su IP.
- El README decía que todo funcionaba sin conexión, y no era cierto: sin
  internet la ficha se veía con la letra del sistema.
- Los paquetes exportados (web, SCORM e IMS CP) copian `css/app.css`, con el
  mismo `@import`: en un Moodle sin salida a internet, o sin conexión, la ficha
  perdía sus tipografías.

## Decisión

- Las tipografías están en `fonts/`, en los archivos `.woff2` de Google Fonts
  tal cual, con los mismos pesos y estilos que se usaban. Cada una va en dos
  partes, latín básico y ampliado, con su `unicode-range`: el navegador
  descarga solo la parte y la tipografía que necesita la página.
- `css/app.css` las declara con `@font-face` y no pide nada a terceros.
- Cada entrada de `FONT_OPTIONS` (`js/fonts.js`) lleva sus archivos
  (`files`). `fontFilesFor(manifest)` devuelve los que necesita una ficha: los
  de la interfaz (Nunito y Atkinson Hyperlegible), la fuente global y las de
  cada campo. Si la ficha va cifrada con contraseña no se ven sus campos, y
  devuelve todos.
- Los tres exportadores copian al paquete los archivos que da
  `fontFilesFor`, en lugar de una lista fija.
- Los créditos y la licencia (SIL OFL) están en `fonts/README.md`.

## Alternativas descartadas

- **Seguir con Google Fonts.** Es lo que se quería corregir.
- **Copiar todas las tipografías en cada paquete exportado.** Son unos 935 KB
  por paquete aunque la ficha use solo dos.
- **Solo el latín básico.** Ahorra la mitad del repositorio, pero una letra
  como ł u ő, frecuente en nombres propios, saldría con otra tipografía.

## Consecuencias

- La aplicación, los paquetes exportados y la vista previa del servidor MCP,
  que copia `fonts/` entera, funcionan sin conexión con sus tipografías.
- El repositorio crece unos 935 KB; lo que descarga cada visita no cambia.
- Una tipografía nueva exige tres pasos: sus archivos en `fonts/`, su
  `@font-face` y su entrada con `files` en `js/fonts.js`. Si falta el último,
  los paquetes exportados no la llevarán.
