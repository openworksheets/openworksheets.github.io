// Diálogo «Crear o convertir fichas con IA (MCP)».
//
// El profesorado usa OpenWorksheets desde la web: nadie se descarga el sitio.
// Lo único que hay que instalar es el servidor MCP (la carpeta mcp/ del
// repositorio), y de eso se encarga la propia IA. Por eso este diálogo no da
// configuraciones que copiar en archivos, sino un ENCARGO que copiar y pegarle
// a la IA: ella comprueba los requisitos, descarga la carpeta y se registra.
//
// Antes había aquí una lista de configuraciones programa por programa, con los
// tres estados en que podía estar cada archivo. Ya no hace falta: los clientes
// se registran solos cuando se les pide, y los que no pueden tocar su propia
// configuración (Claude Desktop, LM Studio) le dan al usuario el texto exacto
// que hay que pegar y dónde. Aquella lista solo servía para envejecer mal.

import { el, copyToClipboard, toast } from './util.js';
import { t } from './i18n.js';

const REPO = 'https://github.com/openworksheets/openworksheets.github.io';

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

  const closeX = el('button', { type: 'button', class: 'dlg-x', 'aria-label': t('ai.close'), onclick: () => dlg.close() }, '✕');

  // ---------- El encargo: lo que se le pega a la IA ----------
  const promptBox = el('pre', { class: 'mcp-code mcp-prompt' }, buildPrompt());
  const bigCopy = copyButton(() => promptBox.textContent, t('mcp.copyPrompt'));

  // Son ejemplos de lo que se le puede pedir, con nombres inventados: no hay
  // nada que copiar tal cual, así que no llevan botón.
  const example = key => el('pre', { class: 'mcp-code mcp-example' }, t(key));

  // Dos preguntas, en este orden: si ya está instalado no hay nada que leer de
  // la instalación, y quien está instalando no necesita todavía los ejemplos.
  // Todo plegado: se abre lo que toca.
  const way = (titleKey, ...body) => el('details', { class: 'mcp-way mcp-way-fold' },
    el('summary', {}, el('h3', { class: 'mcp-way-title' }, t(titleKey))), ...body);

  dlg.append(
    closeX,
    el('h2', { class: 'ai-title' }, t('mcp.title')),
    el('p', { class: 'ai-help' }, t('mcp.intro')),
    el('p', { class: 'mcp-note' }, t('mcp.compat')),

    way('mcp.notInstalled',
      // Lo primero, porque descarta de entrada a quien lo intente desde el
      // navegador: el MCP es un programa local y la web de la IA no lo alcanza.
      el('p', { class: 'mcp-hint' }, t('mcp.notWeb')),
      // Y aun teniéndolas instaladas, ChatGPT y Claude solo llegan al ordenador
      // desde su pestaña de código (Codex y Claude Code): el chat de siempre no.
      el('p', { class: 'mcp-hint' }, t('mcp.desktopCode')),
      el('p', { class: 'mcp-hint' }, t('mcp.askAiHelp')),
      promptBox,
      el('div', { class: 'ai-actions mcp-actions' }, bigCopy),
      el('p', { class: 'mcp-hint mcp-more' }, t('mcp.needs'))),

    // Con el servidor puesto, el trabajo ya no pasa por aquí: se le habla a la
    // IA desde su propio programa.
    way('mcp.installed',
      el('p', { class: 'mcp-hint' }, t('mcp.usedFrom')),
      el('p', { class: 'mcp-hint' }, t('mcp.finallyBody')),
      example('mcp.ex1'),
      example('mcp.ex2'),
      el('p', { class: 'mcp-hint mcp-more' }, t('mcp.moreAsks')),
      example('mcp.ex3'),
      // Actualizar es otra cosa que se le pide a la IA, no algo que se haga aquí
      el('p', { class: 'mcp-hint mcp-more' }, t('mcp.updateAsk')),
      example('mcp.ex4')),

    el('div', { class: 'ai-actions' },
      el('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, t('ai.close'))));

  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}
