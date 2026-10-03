# Evaluación VCER de OpenWorksheets

Rúbrica VCER: Recomendable (100 %)
Versión evaluada: v1.36.1, commit `3e9f061`, publicada en https://openworksheets.github.io/ (comprobado que coincide con el repositorio), 3 de octubre de 2026.

Cumple lo esencial de la guía y puede utilizarse o publicarse; las mejoras propuestas lo completan.

Evaluación hecha con la IA siguiendo las [instrucciones de la evaluación VCER](https://vibe-coding-educativo.github.io/vibe-responsable/es/vcer.html) de la guía «Vibe coding responsable». Es una autoevaluación del autor: orientativa y sin comprobación externa. Este archivo sustituye al de cualquier evaluación anterior.

## Puntuación

| # | Punto | Nota |
|---|---|---|
| 1 | Contenido | 2 |
| 2 | Datos personales | 2 |
| 3 | Entender qué hace | 2 |
| 4 | Dependencias | 2 |
| 5 | Accesibilidad | 2 |
| 6 | Material ajeno | 2 |
| 7 | Rastro | 2 |
| 8 | Uso de IA | 2 |
| 9 | Licencia | 2 |
| 10 | Reutilización | 2 |
| | **Total** | **20 de 20 (100 %)** |

## Justificación

1. **Contenido: 2.** Lo que enseña está en las cinco fichas de ejemplo (`ejemplos/`, en castellano, catalán, gallego, euskera e inglés). Se han revisado sus respuestas correctas en los cinco idiomas y la ficha en castellano tal como la ve el alumnado, y no se detectan errores. Conviene que una persona revise los textos de las páginas de los otros cuatro idiomas, que son imágenes.

2. **Datos personales: 2.** Pide «Nombre y apellidos o código de alumno/a» y lo guarda solo en el navegador (`localStorage` e `IndexedDB`), junto con el intento en curso. La entrega viaja en un archivo `.owsub` o en la parte `#e=` de un enlace, que el navegador no envía a ningún servidor, y puede cifrarse para el docente. La tabla de resultados de clase y su CSV se quedan en el navegador del docente. No lleva analítica ni cookies, y el aviso de privacidad del pie lo explica, junto con lo que se comunica al descargar una ficha. Como maneja nombres reales del alumnado, conviene que una persona con conocimientos técnicos lo revise antes de usarlo.

3. **Entender qué hace: 2.** El docente coloca campos autocorregibles sobre un PDF, una imagen o una hoja en blanco y comparte la ficha como un paquete `.owpkg` alojado donde quiera; el alumnado la responde en el navegador, que guarda el intento y una copia de la ficha, y entrega un archivo o un enlace. Solo se comunica con el sitio donde está la ficha y, si está en Google Drive, con los proxies de descarga, como dice el aviso de privacidad. Lo que declaran la interfaz y los README coincide con el código, también lo que se dice del código de comprobación de las entregas (detecta ediciones a mano, no falsificaciones preparadas).

4. **Dependencias: 2.** Todas las bibliotecas, iconos y tipografías están en el propio repositorio. Direcciones externas del código:
   - `script.google.com`: Google Apps Script del autor, que descarga las fichas alojadas en Google Drive y resuelve los enlaces cortos antiguos (anotado en `config.js`, `gas/README.md` y el aviso de privacidad).
   - `corsproxy.io` y `cors.eu.org`: proxies públicos de reserva para esa descarga (anotados en `config.js` y en el aviso de privacidad).
   - Google Drive, Dropbox, Nextcloud o cualquier alojamiento: donde el docente decide poner la ficha.
   - `youtube-nocookie.com` y `player.vimeo.com` (con `dnt=1`): solo si el docente incrusta un vídeo en la ficha, en el modo de privacidad de cada servicio.
   - `edicuatex.github.io`: editor de fórmulas, en una ventana aparte al pulsar «fx».
   - Enlaces del pie y de la documentación (GitHub, licencias, MIAE, la guía VCER), que no se cargan solos.

   Sin internet: el editor y las fichas abiertas desde un archivo funcionan (en Firefox con doble clic; en Chrome y Edge, sirviendo la carpeta, como explica el README), igual que los paquetes exportados a web, SCORM o IMS CP. No se abren las fichas compartidas por enlace, no se ven los vídeos de YouTube o Vimeo y el botón «fx» no abre EdiCuaTeX.

5. **Accesibilidad: 2.** Se ha pasado axe-core a siete pantallas (portada, Características, Entregas, editor vacío y con la ficha de ejemplo, identificación y ficha del alumnado con contenido), en tema claro y oscuro, en Chromium y en Firefox, sin fallos. Con el tabulador se llega a todos los tipos de campo de la ficha de ejemplo, y se ha completado y corregido solo con el teclado, incluidas las casillas dibujadas y el arrastre a zonas. En el editor se crean campos con Intro o Espacio y se mueven con las flechas. Todas las paradas del tabulador muestran el foco. La corrección se indica con la puntuación de cada campo y las respuestas correctas, no solo con color, y no hay desbordamiento a 375 px.

6. **Material ajeno: 2.** Cada elemento indica autoría, procedencia y licencia en `vendor/TERCEROS.md` y `fonts/README.md`, con los textos de las licencias en `vendor/licencias/` y `fonts/OFL.txt`: pdf.js 3.11.174 (Mozilla, Apache 2.0), JSZip 3.10.1 con pako (MIT), MathJax 3.2.2 (Apache 2.0), qrcode-generator (Kazuhiko Arase, MIT), los iconos de Lucide (ISC y MIT) y las tipografías Nunito, Atkinson Hyperlegible, Lexend, Andika, Patrick Hand, Lora y OpenDyslexic (OFL 1.1). El pie lo resume en «Créditos», y los paquetes exportados (web, SCORM e IMS CP) y el del servidor MCP llevan esos créditos y licencias. Las ilustraciones de las fichas de ejemplo se han generado con IA y así se declara.

7. **Rastro: 2.** Hay seis ADR en `docs/adr` con el motivo de cada decisión, y un CHANGELOG que explica el porqué de cada cambio.

8. **Uso de IA: 2.** El pie y los README declaran que se ha programado con ayuda de IA, en cocreación, nivel 4 del MIAE, que el autor ha decidido el diseño y las funciones y lo ha probado, y que las ilustraciones de los ejemplos también son de IA.

9. **Licencia: 2.** El pie muestra «© 2026 Juan José de Haro», la licencia AGPLv3 del código y la CC BY-SA 4.0 de los contenidos, con enlace; el repositorio incluye `LICENSE` y `LICENSE-CONTENIDOS`.

10. **Reutilización: 2.** El código está completo y legible, en JavaScript sin compilar y con comentarios; solo las bibliotecas de terceros van minificadas. Los README explican cómo ejecutarlo en local; `tests/README.md`, cómo pasar las pruebas (`npm install` y `npm test`, que pasa las 27).

## Mejoras propuestas

Ninguna subiría la puntuación, que ya es la máxima. Estas lo completarían:

1. **Validar la ficha al abrirla**: comprobar la versión, los tipos de campo, las rutas y las coordenadas del manifiesto, para rechazar una ficha dañada o manipulada con un mensaje claro en lugar de fallar a mitad de uso.
2. **Declarar una política de seguridad (CSP)** en las páginas, que limite de dónde se pueden cargar scripts, marcos y conexiones, y dar al marco de cada paquete SCORM solo los permisos que necesite.
3. **Dividir los archivos de código más grandes** (`editor.js` pasa de seis mil líneas), para que sea más fácil de revisar y de modificar.
