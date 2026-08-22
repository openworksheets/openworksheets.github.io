// Diálogo «Colocar campos con IA sobre un PDF (MCP)».
//
// El profesorado usa OpenWorksheets desde la web: nadie se descarga el sitio.
// Lo único que hay que instalar es el servidor MCP (la carpeta mcp/ del
// repositorio), y de eso se encarga la propia IA. Por eso lo que ofrece este
// diálogo, en primer lugar, no es una configuración que copiar en un archivo,
// sino un ENCARGO que copiar y pegarle a la IA: ella comprueba los requisitos,
// descarga la carpeta, instala su única dependencia y se registra sola.
//
// La configuración manual sigue estando, plegada, para quien prefiera hacerla
// a mano o cuando su herramienta no pueda editarse a sí misma.

import { el, copyToClipboard, downloadBlob, toast } from './util.js';
import { t } from './i18n.js';

const REPO = 'https://github.com/openworksheets/openworksheets.github.io';
const PATH_KEY = 'ows.mcpPath';
// El servidor corre en el ordenador del profesor, sin contacto con esta página:
// no hay forma de detectar si está instalado. Se recuerda que ya se pasó por la
// instalación —al copiar las instrucciones o al decirlo a mano— para no repetir
// ese paso cada vez; siempre se puede volver a él.
// Archivos que componen el servidor. Se descargan de este mismo sitio y se
// empaquetan en el navegador: así el profesorado obtiene la carpeta lista con
// un clic, sin pasar por GitHub ni por una terminal.
const SERVER_FILES = [
  'server.js', 'session.js', 'fieldspec.js', 'browser.js', 'cdp.js', 'zip.js',
  'workbench.html', 'package.json', 'README.md',
  'vendor/pdf.min.js', 'vendor/pdf.worker.min.js'
];

async function downloadServer(btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('mcp.preparing');
  try {
    const zip = new window.JSZip();
    const folder = zip.folder('openworksheets-mcp');
    await Promise.all(SERVER_FILES.map(async name => {
      const res = await fetch(new URL('mcp/' + name, document.baseURI));
      if (!res.ok) throw new Error(name);
      folder.file(name, await res.blob());
    }));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    downloadBlob(blob, 'openworksheets-mcp.zip');
    toast(t('mcp.downloaded'), 'ok');
  } catch {
    // Al abrir el editor desde una copia local sin la carpeta mcp/, no hay nada
    // que empaquetar: se remite al repositorio.
    toast(t('mcp.downloadFail'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function osKind() {
  const ua = navigator.userAgent || '';
  if (/Windows/i.test(ua)) return 'win';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'mac';
  return 'linux';
}

const OS = osKind();

// Ruta de ejemplo del servidor, solo para la sección manual.
// Ruta de ejemplo: se propone Documentos, no Descargas. La carpeta tiene que
// quedarse donde esté (el servidor se ejecuta desde ahí cada vez), y Descargas
// es justo la que se vacía de vez en cuando.
const DEFAULT_PATH = {
  win: 'C:\\Users\\tu-usuario\\Documents\\openworksheets-mcp\\server.js',
  mac: '/Users/tu-usuario/Documents/openworksheets-mcp/server.js',
  linux: '/home/tu-usuario/Documentos/openworksheets-mcp/server.js'
}[OS];

const CONFIG_PATHS = {
  claude: {
    win: '%APPDATA%\\Claude\\claude_desktop_config.json',
    mac: '~/Library/Application Support/Claude/claude_desktop_config.json',
    linux: '~/.config/Claude/claude_desktop_config.json'
  },
  cursor: { win: '%USERPROFILE%\\.cursor\\mcp.json', mac: '~/.cursor/mcp.json', linux: '~/.cursor/mcp.json' }
};

// En Windows las barras invertidas van dobladas dentro de JSON.
function forJson(p) {
  return String(p).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Los tres casos en que se puede encontrar el archivo de configuración. Dar un
// solo bloque «completo» no basta: en cuanto el archivo tiene algo dentro,
// pegarlo al final rompe el JSON, y saber dónde va exactamente es justo lo que
// no se puede adivinar. Cada caso lleva su fragmento, ya listo para pegar.
function serverEntry(p, indent) {
  const s = ' '.repeat(indent);
  return `${s}"openworksheets": {
${s}  "command": "node",
${s}  "args": ["${forJson(p)}"]
${s}}`;
}

// Archivo vacío: el documento entero.
function jsonWhole(p, key = 'mcpServers') {
  return `{
  "${key}": {
${serverEntry(p, 4)}
  }
}`;
}

// Con contenido, pero sin la clave: se añade como una clave más, al principio.
function jsonSection(p, key = 'mcpServers') {
  return `  "${key}": {
${serverEntry(p, 4)}
  },`;
}

// Con la clave ya puesta: solo el servidor, dentro de ella.
function jsonEntry(p) {
  return serverEntry(p, 4) + ',';
}

const CLIENTS = [
  { name: 'Claude Desktop', descKey: 'mcp.c.claudeDesktop', howKey: 'mcp.h.claudeDesktop', jsonKey: 'mcpServers', where: CONFIG_PATHS.claude[OS] },
  // La app de escritorio de ChatGPT comparte la configuración MCP con Codex CLI
  // en el mismo ordenador, así que el bloque vale para las dos.
  {
    name: 'ChatGPT',
    descKey: 'mcp.c.chatgpt', howKey: 'mcp.h.chatgpt', toml: true,
    where: '~/.codex/config.toml',
    code: p => `[mcp_servers.openworksheets]\ncommand = "node"\nargs = ["${forJson(p)}"]`
  },
  { name: 'LM Studio', descKey: 'mcp.c.lmstudio', howKey: 'mcp.h.lmstudio', jsonKey: 'mcpServers', where: '~/.lmstudio/mcp.json' },
  // Antigravity usa el mismo archivo en el IDE y en la CLI.
  { name: 'Antigravity', descKey: 'mcp.c.antigravity', howKey: 'mcp.h.antigravity', jsonKey: 'mcpServers', where: '~/.gemini/config/mcp_config.json' },
  { name: 'Claude Code', descKey: 'mcp.c.claudeCode', howKey: 'mcp.h.claudeCode', where: 'Terminal', code: p => `claude mcp add openworksheets -- node "${p}"` },
  { name: 'Cursor', descKey: 'mcp.c.cursor', howKey: 'mcp.h.cursor', jsonKey: 'mcpServers', where: CONFIG_PATHS.cursor[OS] },
  { name: 'VS Code', descKey: 'mcp.c.vscode', howKey: 'mcp.h.vscode', jsonKey: 'servers', where: '.vscode/mcp.json' },
  { nameKey: 'mcp.c.otherName', descKey: 'mcp.c.other', howKey: 'mcp.h.other', where: 'stdio', code: p => `node "${p}"` }
];

// El encargo es deliberadamente corto: el detalle (requisitos, cómo se registra,
// qué herramientas hay y en qué orden se usan) vive en el README de la carpeta,
// que la IA lee. Repetirlo aquí solo serviría para que envejeciera mal.
function buildPrompt() {
  return [
    t('mcp.prompt.line1'),
    REPO + '/tree/main/mcp',
    '',
    t('mcp.prompt.line2'),
    '',
    t('mcp.prompt.line3')
  ].join('\n');
}

function copyButton(getText, label, after) {
  const btn = el('button', { class: 'btn', type: 'button' }, label);
  btn.addEventListener('click', () => {
    copyToClipboard(getText()).then(ok => {
      toast(ok ? t('mcp.copied') : t('ai.copyFail'), ok ? 'ok' : 'error');
      if (ok && after) after();
    });
  });
  return btn;
}

export function openMcpDialog() {
  const dlg = el('dialog', { class: 'ai-dialog mcp-dialog' });
  const saved = (() => { try { return localStorage.getItem(PATH_KEY) || ''; } catch { return ''; } })();

  const closeX = el('button', { type: 'button', class: 'dlg-x', 'aria-label': t('ai.close'), onclick: () => dlg.close() }, '✕');

  // ---------- Paso 1: descargar la carpeta del servidor ----------
  const btnDownload = el('button', { class: 'btn primary', type: 'button' }, t('mcp.download'));
  btnDownload.addEventListener('click', () => downloadServer(btnDownload));

  // ---------- Paso 3a: encargo para las IA que ejecutan comandos ----------
  const promptBox = el('pre', { class: 'mcp-code mcp-prompt' }, buildPrompt());
  const bigCopy = copyButton(() => promptBox.textContent, t('mcp.copyPrompt'));

  // ---------- Paso 3b: configuración a mano, para las que no pueden ----------
  const pathInput = el('input', {
    class: 'ai-input mcp-path', type: 'text', spellcheck: 'false',
    value: saved || DEFAULT_PATH, placeholder: DEFAULT_PATH
  });
  const blocks = el('div', { class: 'mcp-clients' });

  // Un bloque de código con su etiqueta y su botón de copiar.
  function codeCase(label, text) {
    const pre = el('pre', { class: 'mcp-code' }, text);
    return el('div', { class: 'mcp-case' },
      el('div', { class: 'mcp-case-head' },
        el('span', { class: 'mcp-case-label' }, label),
        copyButton(() => pre.textContent, t('mcp.copy'))),
      pre);
  }

  function renderClients() {
    const p = (pathInput.value || DEFAULT_PATH).trim();
    blocks.textContent = '';
    for (const c of CLIENTS) {
      const cuerpo = c.jsonKey
        // Los tres estados en que puede estar el archivo, cada uno con lo que
        // hay que pegar y dónde. Sin esto, no hay forma de acertar.
        ? [
            codeCase(t('mcp.caseEmpty'), jsonWhole(p, c.jsonKey)),
            codeCase(t('mcp.caseNoKey', { key: c.jsonKey }), jsonSection(p, c.jsonKey)),
            codeCase(t('mcp.caseHasKey', { key: c.jsonKey }), jsonEntry(p))
          ]
        : [codeCase(c.toml ? t('mcp.caseToml') : t('mcp.caseCmd'), c.code(p))];

      blocks.appendChild(el('details', { class: 'mcp-client' },
        el('summary', { class: 'mcp-client-sum' },
          el('span', { class: 'mcp-client-name' }, c.name || t(c.nameKey)),
          el('span', { class: 'mcp-client-desc' }, t(c.descKey))),
        el('div', { class: 'mcp-client-body' },
          el('p', { class: 'mcp-hint mcp-client-how' }, t(c.howKey)),
          c.where !== 'Terminal' && c.where !== 'stdio'
            ? el('p', { class: 'mcp-client-where' }, c.where)
            : null,
          ...cuerpo)));
    }
  }

  pathInput.addEventListener('input', () => {
    try { localStorage.setItem(PATH_KEY, pathInput.value.trim()); } catch { /* modo privado */ }
    renderClients();
  });
  renderClients();

  // Dos caminos distintos, no una secuencia: lo que hay que hacer depende de si
  // la IA puede ejecutar comandos. Para las que no (Claude Desktop, LM Studio),
  // el trabajo lo hace la persona, y por eso ahí sí hace falta la descarga.
  const example = key => {
    const pre = el('pre', { class: 'mcp-code' }, t(key));
    return el('div', { class: 'mcp-example' }, pre, copyButton(() => pre.textContent, t('mcp.copy')));
  };

  // Dos caminos distintos, no una secuencia: lo que hay que hacer depende de si
  // la IA puede ejecutar comandos. Para las que no (Claude Desktop, ChatGPT de
  // escritorio, LM Studio), el trabajo lo hace la persona, y por eso ahí sí
  // hace falta descargar la carpeta.
  dlg.append(
    closeX,
    el('h2', { class: 'ai-title' }, t('mcp.title')),
    el('p', { class: 'ai-help' }, t('mcp.intro')),
    el('p', { class: 'mcp-note' }, t('mcp.compat')),

    el('div', { class: 'mcp-way' },
      el('h3', { class: 'mcp-way-title' }, t('mcp.wayAuto')),
      el('p', { class: 'mcp-hint' }, t('mcp.wayAutoHelp')),
      promptBox,
      el('div', { class: 'ai-actions mcp-actions' }, bigCopy)),

    el('div', { class: 'mcp-way' },
      el('h3', { class: 'mcp-way-title' }, t('mcp.wayManual')),
      el('p', { class: 'mcp-hint' }, t('mcp.wayManualHelp')),
      el('ol', { class: 'mcp-substeps' },
        el('li', {},
          el('p', { class: 'mcp-hint' }, t('mcp.mStep1')),
          el('div', { class: 'ai-actions mcp-actions' },
            btnDownload,
            el('a', { class: 'mcp-link', href: REPO + '/tree/main/mcp', target: '_blank', rel: 'noopener' }, t('mcp.fromGithub')))),
        el('li', {}, el('p', { class: 'mcp-hint' }, t('mcp.mStep2'))),
        el('li', {},
          el('p', { class: 'mcp-hint' }, t('mcp.mStep3')),
          el('div', { class: 'ai-field' },
            el('label', { class: 'ai-label' }, t('mcp.pathLabel')),
            pathInput),
          blocks))),

    // Lo que se le pide a la IA una vez conectada, con un par de ejemplos de
    // los ajustes que se le pueden pedir sobre la marcha.
    el('div', { class: 'mcp-way' },
      el('h3', { class: 'mcp-way-title' }, t('mcp.finally')),
      el('p', { class: 'mcp-hint' }, t('mcp.finallyBody')),
      example('mcp.ex1'),
      el('p', { class: 'mcp-hint mcp-more' }, t('mcp.moreAsks')),
      example('mcp.ex2'),
      example('mcp.ex3')),

    el('div', { class: 'ai-actions' },
      el('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, t('ai.close'))));

  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}
