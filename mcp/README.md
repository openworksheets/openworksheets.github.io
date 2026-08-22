# Servidor MCP de OpenWorksheets

Permite que una IA (Claude, o cualquier cliente que hable MCP) convierta un PDF
en una ficha interactiva: lee el documento, coloca los campos de respuesta en su
sitio, **comprueba el resultado mirando una vista previa** y guarda el paquete
`.owpkg` que el profesor abre después en el editor.

El profesor solo tiene que decir dónde está el PDF:

> «Convierte en ficha interactiva el archivo ~/Descargas/energia.pdf»

## Instalación

> **Si eres la IA que está instalando esto**: no hay nada que compilar ni que
> instalar dentro de la carpeta —no tiene dependencias—. Basta con descargarla,
> comprobar que hay **Node 18 o superior** y **Chrome o Chromium**, y registrar
> el servidor en el cliente MCP que esté usando la persona con la que hablas:
> transporte **stdio**, nombre **openworksheets**, comando **node** y, como
> único argumento, la ruta absoluta de `server.js`. Después, comprueba que
> responde y sigue leyendo: la sección *Cómo trabaja la IA* explica el orden en
> que conviene usar las herramientas.

Esta carpeta es autónoma y **no tiene dependencias**: se descomprime y funciona.
No hace falta descargar el resto de la aplicación, que se usa en
[openworksheets.github.io](https://openworksheets.github.io), ni ejecutar
`npm install`, ni abrir una terminal.

Requisitos: **Node 18 o superior** y un navegador basado en Chromium —**Google
Chrome, Chromium o Microsoft Edge**—, que se busca solo.

### Qué navegador se usa y cómo se busca

Solo se le pide hablar el protocolo CDP, así que sirve cualquiera de los tres.
Se busca en este orden:

1. La variable `OWS_CHROME`, si está definida. Si apunta a algo que no existe,
   el servidor lo dice en lugar de seguir buscando por su cuenta.
2. La variable `CHROME_PATH`.
3. Los ejecutables alcanzables desde el `PATH` (en Windows, probando las
   extensiones de `PATHEXT`).
4. Las rutas habituales de instalación:
   - **Windows**: Chrome, Chrome Beta, Chrome Dev, Chrome Canary, Chromium y
     Edge, bajo `%PROGRAMFILES%`, `%PROGRAMFILES(X86)%` y `%LOCALAPPDATA%`.
   - **macOS**: los mismos en `/Applications` y en la carpeta `Applications`
     del usuario.
   - **Linux**: `/usr/bin/google-chrome`, `google-chrome-stable`, `chromium`,
     `chromium-browser`, `/snap/bin/chromium`, `microsoft-edge` y
     `/opt/google/chrome/chrome`.

Si el navegador está en otro sitio, se indica su ruta completa —la del
ejecutable, no la de la carpeta— en `OWS_CHROME`:

```bash
# Windows (en la configuración del cliente MCP, dentro de "env")
OWS_CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe
# macOS
OWS_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# Linux
OWS_CHROME=/usr/bin/google-chrome
```

La carpeta hay que dejarla donde se descomprima: el cliente MCP guarda la ruta
de `server.js` y lo ejecuta desde ahí cada vez. Si se mueve o se borra, deja de
funcionar y hay que volver a apuntar la ruta en la configuración. Por eso
conviene elegir un sitio estable (la carpeta personal o Documentos) antes que
Descargas.

La vía normal es el propio editor: en el cuadro de opciones de creación,
*Colocar campos con IA sobre un PDF…* ofrece la descarga en un clic (la
aplicación empaqueta esta carpeta en el navegador) y, después, el texto que hay
que pegarle a la IA para que se registre sola.

A mano, sirve cualquiera de estas:

```bash
npx -y degit github:openworksheets/openworksheets.github.io/mcp openworksheets-mcp
# o descargar el ZIP del repositorio y quedarse solo con la carpeta mcp/
```

### Qué programas pueden usarlo

Es un servidor **local**, del tipo que el programa arranca en el ordenador
(transporte `stdio`). Eso deja fuera a las herramientas que solo aceptan
conectores remotos por HTTP: **ChatGPT y Gemini en su versión web no pueden
usarlo**. Sus aplicaciones de escritorio, en cambio, sí.

| Programa | Dónde se configura |
|---|---|
| **Claude Desktop** | Menú Claude → Ajustes → Desarrollador → Editar configuración. macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`; Windows: `%APPDATA%\Claude\claude_desktop_config.json`; Linux: `~/.config/Claude/claude_desktop_config.json` |
| **ChatGPT (escritorio)** y **Codex CLI** | `~/.codex/config.toml` — comparten la misma configuración MCP en el mismo ordenador |
| **LM Studio** | Panel derecho → Program → Install → Edit `mcp.json` (`~/.lmstudio/mcp.json`) |
| **Antigravity** (IDE y CLI) | `~/.gemini/config/mcp_config.json`, o por proyecto en `.agents/mcp_config.json`. En el IDE: menú «…» del panel del agente → MCP Servers → Manage MCP Servers → View raw config |
| Claude Code | `claude mcp add openworksheets -- node /ruta/openworksheets-mcp/server.js` |
| Cursor | `~/.cursor/mcp.json` |
| VS Code (GitHub Copilot) | `.vscode/mcp.json`, con la clave `servers` |

Los que usan JSON llevan todos la misma forma:

```json
{
  "mcpServers": {
    "openworksheets": {
      "command": "node",
      "args": ["/ruta/a/openworksheets-mcp/server.js"]
    }
  }
}
```

En Windows, las barras invertidas de la ruta van dobladas dentro del JSON:
`"C:\\Users\\nombre\\openworksheets-mcp\\server.js"`.

Y en TOML (ChatGPT de escritorio y Codex CLI):

```toml
[mcp_servers.openworksheets]
command = "node"
args = ["/ruta/a/openworksheets-mcp/server.js"]
```

## Cómo trabaja la IA

1. `open_document` — convierte el PDF en las páginas de fondo de una ficha nueva
   (con el mismo pdf.js que usa el editor, así que el resultado es idéntico al
   de subir el PDF a mano).
2. `read_layout` — devuelve el texto de la página **con las coordenadas de cada
   línea** y los candidatos a hueco: rachas de guiones bajos y líneas
   horizontales impresas.
3. `place_fields` — coloca los campos. Avisa si uno se solapa con otro o tapa
   texto impreso, pero no bloquea: a veces tapar es lo que se busca.
4. `preview_page` — devuelve la página con los campos dibujados y numerados
   encima. **Este es el paso que hace fiable el resultado**: la IA mira la
   imagen y comprueba que cada campo ha caído donde debía.
5. `adjust_field` / `remove_fields` — corrige lo que esté desplazado.
6. `set_worksheet_info` y `save_worksheet` — título, autor, instrucciones y
   guardado del `.owpkg`.

Todas las coordenadas van en **fracciones de la página (0–1)**, con el origen
arriba a la izquierda: el mismo sistema que usa el manifiesto de la ficha, así
que no hay que pensar en píxeles ni en la resolución del PDF.

## Tipos de campo que puede colocar

`text` (respuesta corta), `number`, `formula`, `essay`, `single`, `multi`,
`select`, `truefalse`, `gaps`, `table`, `record`, `match`, `order`, y los que
se dibujan sobre el documento: `textboxes` (huecos), `checkbox` (casillas) y
`dragdrop` (arrastrar a zonas). Más los decorativos `label` y `cover`.

`textboxes` y `checkbox` funcionan como `dragdrop`: sus cajas van en `boxes`,
cada una con su `rect`, y el `rect` del campo puede omitirse porque se deduce de
ellas. `textboxes` es el compañero natural de los huecos que devuelve
`read_layout`.

`dragdrop` es el único con dos niveles de coordenadas, y conviene tenerlo claro:
el `rect` del campo es la **bandeja** de donde parten las etiquetas (va en un
hueco libre de la página), y cada zona de `zones` lleva **su propio `rect`**,
que es donde hay que soltarlas. La vista previa dibuja la bandeja con línea
continua y las zonas a trazos, cada una con la respuesta que espera.

```json
{ "page": 3, "type": "dragdrop", "points": 3,
  "rect": { "x": 0.45, "y": 0.855, "w": 0.45, "h": 0.06 },
  "zones": [
    { "rect": { "x": 0.03, "y": 0.81, "w": 0.10, "h": 0.022 }, "answers": ["Potencial máxima"] },
    { "rect": { "x": 0.19, "y": 0.90, "w": 0.11, "h": 0.022 }, "answers": ["Cinética máxima"] }
  ],
  "distractors": ["Química"] }
```

Quedan fuera, de momento, el modo «recortar del PDF» de arrastrar a zonas (que
exige marcar trozos de imagen de la página), unir con flechas, los que cargan
paquetes externos o medios (SCORM, contenido incrustado, imagen, vídeo, audio) y
las formas de dibujo. Esos se añaden a mano en el editor.

## Tapar o borrar

Hay dos formas de ocultar algo del documento, y no son intercambiables:

- El campo decorativo **`cover`** dibuja un rectángulo opaco **en el visor**. El
  contenido sigue en la imagen de fondo dentro del `.owpkg`: sirve para sustituir
  un «Sí / No» impreso por un desplegable, no para esconder nada.
- La herramienta **`redact_areas`** pinta sobre la propia imagen de la página, así
  que lo tapado **desaparece del archivo**. Es la que hay que usar con las
  soluciones impresas. Descarta además ese texto del análisis de la página, para
  que no se proponga después como enunciado.

## Límites que conviene conocer

- **PDF escaneado**: si la página no tiene capa de texto, `read_layout` avisa y
  no hay coordenadas que leer. Entonces se trabaja con `preview_page` y
  `grid: true`, que superpone una rejilla con las coordenadas, y se afina
  mirando. Sale bien, pero cuesta más iteraciones.
- **Las respuestas las propone la IA**: en preguntas abiertas conviene revisar
  la ficha antes de repartirla. El editor lo permite todo, y `essay` deja la
  nota en manos del profesor a propósito.
- Hay **una sola ficha viva** por servidor: `open_document` descarta la anterior.

## Archivos

| Archivo | Qué hace |
|---|---|
| `server.js` | Protocolo MCP por stdio y definición de las herramientas |
| `session.js` | La ficha en curso: colocar, validar, ajustar, guardar |
| `fieldspec.js` | Traduce la descripción de la IA al campo real del manifiesto |
| `browser.js` | Chromium sin interfaz y servidor local para pdf.js |
| `cdp.js` | Cliente mínimo de WebSocket y del protocolo de Chrome, para no depender de nada |
| `chrome.js` | Búsqueda del navegador en Windows, macOS y Linux |
| `workbench.html` | Rasterizado del PDF, lectura de coordenadas y vista previa |
| `zip.js` | Escritura del `.owpkg` (ZIP) sin dependencias |
| `vendor/` | Copia de pdf.js, la misma que usa la aplicación, para poder funcionar a solas |
| `package.json` | Metadatos y ejecutable; no declara dependencias porque no las hay |

## Prueba

```bash
node tests/run_mcp_ficha.js [ruta-del-pdf]
```

Recorre el circuito completo hablando el protocolo real por stdio. La búsqueda
del navegador tiene su propia prueba, que simula las variables de entorno de
cada sistema (y por tanto comprueba la detección de Windows desde cualquier
ordenador):

```bash
node tests/run_chrome_detect.js
``` Vive en el
repositorio de la aplicación, no en esta carpeta; para probar una copia
descargada a solas se le indica con `OWS_MCP_SERVER`:

```bash
OWS_MCP_SERVER=~/openworksheets-mcp/server.js node tests/run_mcp_ficha.js mi.pdf
```

El test comprueba además que `mcp/vendor/` sigue siendo idéntico a `vendor/`:
si se actualiza pdf.js en la aplicación, hay que copiarlo también aquí, o el
MCP generaría páginas distintas de las del editor.
