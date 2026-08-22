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

import { el, copyToClipboard, toast } from './util.js';
import { t } from './i18n.js';

const REPO = 'https://github.com/openworksheets/openworksheets.github.io';
const PATH_KEY = 'ows.mcpPath';
// El servidor corre en el ordenador del profesor, sin contacto con esta página:
// no hay forma de detectar si está instalado. Se recuerda que ya se pasó por la
// instalación —al copiar las instrucciones o al decirlo a mano— para no repetir
// ese paso cada vez; siempre se puede volver a él.
const READY_KEY = 'ows.mcpReady';

function isReady() {
  try { return localStorage.getItem(READY_KEY) === '1'; } catch { return false; }
}
function setReady(v) {
  try { localStorage.setItem(READY_KEY, v ? '1' : '0'); } catch { /* modo privado */ }
}

function osKind() {
  const ua = navigator.userAgent || '';
  if (/Windows/i.test(ua)) return 'win';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'mac';
  return 'linux';
}

const OS = osKind();

// Ruta de ejemplo del servidor, solo para la sección manual.
const DEFAULT_PATH = {
  win: 'C:\\Users\\tu-usuario\\openworksheets-mcp\\server.js',
  mac: '/Users/tu-usuario/openworksheets-mcp/server.js',
  linux: '/home/tu-usuario/openworksheets-mcp/server.js'
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

function json(p, key = 'mcpServers') {
  return `{
  "${key}": {
    "openworksheets": {
      "command": "node",
      "args": ["${forJson(p)}"]
    }
  }
}`;
}

const CLIENTS = [
  { name: 'Claude Desktop', where: CONFIG_PATHS.claude[OS], code: p => json(p) },
  { name: 'LM Studio', where: 'mcp.json', code: p => json(p) },
  { name: 'Claude Code', where: 'Terminal', code: p => `claude mcp add openworksheets -- node "${p}"` },
  { name: 'Codex CLI  (ChatGPT)', where: '~/.codex/config.toml', code: p => `[mcp_servers.openworksheets]\ncommand = "node"\nargs = ["${forJson(p)}"]` },
  { name: 'Antigravity CLI', where: '~/.antigravity/settings.json  ·  ~/.gemini/settings.json', code: p => json(p) },
  { name: 'Cursor', where: CONFIG_PATHS.cursor[OS], code: p => json(p) },
  { name: 'VS Code (GitHub Copilot)', where: '.vscode/mcp.json', code: p => json(p, 'servers') }
];

// El encargo que se le pega a la IA. Va en el idioma del profesor salvo los
// nombres técnicos, que son los mismos en todas partes.
function buildPrompt() {
  return [
    t('mcp.prompt.intro'),
    '',
    '1. ' + t('mcp.prompt.s1'),
    '2. ' + t('mcp.prompt.s2', { repo: REPO }),
    '3. ' + t('mcp.prompt.s3'),
    '4. ' + t('mcp.prompt.s4'),
    '5. ' + t('mcp.prompt.s5'),
    '',
    t('mcp.prompt.end')
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

  // ---------- Instalación: el encargo que se le pega a la IA ----------
  const promptBox = el('pre', { class: 'mcp-code mcp-prompt' }, buildPrompt());
  const bigCopy = copyButton(() => promptBox.textContent, t('mcp.copyPrompt'), () => {
    setReady(true);
    show('use');
  });
  bigCopy.classList.add('primary');

  const linkHaveIt = el('button', { class: 'mcp-link', type: 'button' }, t('mcp.haveIt'));
  linkHaveIt.addEventListener('click', () => { setReady(true); show('use'); });

  // ---------- Configuración manual (plegada, dentro de la instalación) ------
  const pathInput = el('input', {
    class: 'ai-input mcp-path', type: 'text', spellcheck: 'false',
    value: saved || DEFAULT_PATH, placeholder: DEFAULT_PATH
  });
  const blocks = el('div', { class: 'mcp-clients' });

  function renderClients() {
    const p = (pathInput.value || DEFAULT_PATH).trim();
    blocks.textContent = '';
    for (const c of CLIENTS) {
      const code = el('pre', { class: 'mcp-code' }, c.code(p));
      blocks.appendChild(el('div', { class: 'mcp-client' },
        el('div', { class: 'mcp-client-head' },
          el('span', { class: 'mcp-client-name' }, c.name),
          el('span', { class: 'mcp-client-where' }, c.where),
          copyButton(() => code.textContent, t('mcp.copy'))),
        code));
    }
  }
  pathInput.addEventListener('input', () => {
    try { localStorage.setItem(PATH_KEY, pathInput.value.trim()); } catch { /* modo privado */ }
    renderClients();
  });
  renderClients();

  const step = (n, ...body) => el('li', { class: 'mcp-step' },
    el('span', { class: 'mcp-step-title' }, t('mcp.step' + n)), ...body);

  const viewInstall = el('div', { class: 'mcp-view' },
    el('p', { class: 'ai-help' }, t('mcp.intro')),
    el('p', { class: 'mcp-note' }, t('mcp.compat')),
    el('ol', { class: 'mcp-steps' },
      step(1,
        el('p', { class: 'mcp-hint' }, t('mcp.step1Body')),
        promptBox,
        el('div', { class: 'ai-actions mcp-actions' }, bigCopy)),
      step(2,
        el('p', { class: 'mcp-hint' }, t('mcp.step2Body')),
        el('pre', { class: 'mcp-code' }, t('mcp.ex1')))),
    el('details', { class: 'mcp-manual' },
      el('summary', {}, t('mcp.manualTitle')),
      el('p', { class: 'mcp-hint' }, t('mcp.manualHelp')),
      el('div', { class: 'ai-field' },
        el('label', { class: 'ai-label' }, t('mcp.pathLabel')),
        pathInput),
      blocks),
    el('p', { class: 'mcp-foot' }, linkHaveIt));

  // ---------- Uso diario: ya está instalado ----------
  const linkInstall = el('button', { class: 'mcp-link', type: 'button' }, t('mcp.installAgain'));
  linkInstall.addEventListener('click', () => show('install'));

  const example = (key) => {
    const pre = el('pre', { class: 'mcp-code' }, t(key));
    return el('div', { class: 'mcp-example' }, pre, copyButton(() => pre.textContent, t('mcp.copy')));
  };

  const viewUse = el('div', { class: 'mcp-view', hidden: '' },
    el('p', { class: 'ai-help' }, t('mcp.readyIntro')),
    example('mcp.ex1'),
    el('p', { class: 'mcp-hint mcp-more' }, t('mcp.moreAsks')),
    example('mcp.ex2'),
    example('mcp.ex3'),
    el('p', { class: 'mcp-foot' }, linkInstall));

  const title = el('h2', { class: 'ai-title' });

  function show(which) {
    const use = which === 'use';
    viewUse.hidden = !use;
    viewInstall.hidden = use;
    title.textContent = use ? t('mcp.titleUse') : t('mcp.title');
  }

  dlg.append(closeX, title, viewInstall, viewUse,
    el('div', { class: 'ai-actions' },
      el('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, t('ai.close'))));

  show(isReady() ? 'use' : 'install');

  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}
