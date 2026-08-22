# Servidor MCP de OpenWorksheets

Permite que una IA (Claude, o cualquier cliente que hable MCP) convierta un PDF
en una ficha interactiva: lee el documento, coloca los campos de respuesta en su
sitio, **comprueba el resultado mirando una vista previa** y guarda el paquete
`.owpkg` que el profesor abre después en el editor.

El profesor solo tiene que decir dónde está el PDF:

> «Convierte en ficha interactiva el archivo ~/Descargas/energia.pdf»

## Instalación

Esta carpeta es autónoma: **no hace falta descargar el resto de la aplicación**,
que se usa en [openworksheets.github.io](https://openworksheets.github.io). Lleva
dentro su propia copia de pdf.js y su única dependencia externa es
`puppeteer-core`.

Lo normal es que **no lo instales tú**: en la aplicación, *Colocar campos con IA
sobre un PDF…* da un texto listo para pegarle a la IA, y es ella quien comprueba
los requisitos, descarga esta carpeta, la instala y se registra sola.

Requisitos: **Node 18 o superior** y **Chromium o Google Chrome** (se busca en
las rutas habituales; si está en otro sitio, se indica con `OWS_CHROME`).

A mano:

```bash
npx -y degit github:openworksheets/openworksheets.github.io/mcp openworksheets-mcp
cd openworksheets-mcp
npm install
```

### Qué programas pueden usarlo

Es un servidor **local**, del tipo que la IA arranca en el ordenador
(transporte `stdio`). Eso deja fuera a las IA que solo aceptan conectores
remotos por HTTP: **ChatGPT y Gemini en su versión web o de escritorio no
pueden usarlo**; para esas dos hay que ir a su versión de terminal.

| Programa | Dónde se configura |
|---|---|
| **Claude Desktop** | Ajustes → Desarrollador → Editar configuración (`claude_desktop_config.json`) |
| **LM Studio** | Panel derecho → Program → Install → Edit `mcp.json` |
| Claude Code | `claude mcp add openworksheets -- node /ruta/openworksheets-mcp/server.js` |
| Codex CLI (ChatGPT) | `~/.codex/config.toml` |
| Antigravity CLI | `~/.antigravity/settings.json` (antes Gemini CLI, `~/.gemini/settings.json`) |
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

Y en TOML (Codex CLI):

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
`select`, `truefalse`, `gaps`, `match`, `order`, `dragdrop` (arrastrar a zonas),
y los decorativos `label` y `cover` (tapar una zona: útil cuando el PDF ya trae
impresa la solución o un «Sí / No» que el campo debe sustituir).

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
exige marcar trozos de imagen de la página), unir con flechas, los huecos sobre
el documento y los que cargan paquetes externos (SCORM, contenido incrustado).
Esos se añaden a mano en el editor.

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
| `workbench.html` | Rasterizado del PDF, lectura de coordenadas y vista previa |
| `zip.js` | Escritura del `.owpkg` (ZIP) sin dependencias |
| `vendor/` | Copia de pdf.js, la misma que usa la aplicación, para poder funcionar a solas |
| `package.json` | Declara la única dependencia (`puppeteer-core`) y el ejecutable |

## Prueba

```bash
node tests/run_mcp_ficha.js [ruta-del-pdf]
```

Recorre el circuito completo hablando el protocolo real por stdio. Vive en el
repositorio de la aplicación, no en esta carpeta; para probar una copia
descargada a solas se le indica con `OWS_MCP_SERVER`:

```bash
OWS_MCP_SERVER=~/openworksheets-mcp/server.js node tests/run_mcp_ficha.js mi.pdf
```

El test comprueba además que `mcp/vendor/` sigue siendo idéntico a `vendor/`:
si se actualiza pdf.js en la aplicación, hay que copiarlo también aquí, o el
MCP generaría páginas distintas de las del editor.
