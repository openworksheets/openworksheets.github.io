// Conversor Markdown → HTML mínimo para el campo «Texto».
// Soporta: encabezados (#, ##, ###), negrita (**__), cursiva (*_), código
// `inline`, enlaces [texto](url), listas (- * + y 1.) y saltos de línea.
// El HTML de entrada se escapa siempre antes de aplicar el formato.

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Formato en línea sobre texto YA escapado.
function inline(s) {
  return s
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\1/g, '<strong>$2</strong>')
    .replace(/(\*|_)(?=\S)([\s\S]+?)(?<=\S)\1/g, '<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

// Aísla las fórmulas LaTeX (\( … \) y \[ … \]) antes de aplicar Markdown, para
// que el formateo en línea (negrita, cursiva, código) no estropee el contenido
// matemático (p. ej. un _ o un * dentro de la fórmula). Se reinsertan, ya
// escapadas, al final, para que MathJax encuentre los delimitadores intactos.
// El centinela usa caracteres Unicode de uso privado (\uE000…\uE001), que no
// aparecen en el texto del usuario ni los tocan las reglas de Markdown.
function protectMath(src) {
  const math = [];
  const text = String(src || '').replace(/\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g, m => {
    math.push(m);
    return '\uE000' + (math.length - 1) + '\uE001';
  });
  return { text, math };
}

export function mdToHtml(src) {
  const { text, math } = protectMath(src);
  const html = mdToHtmlInner(text);
  return html.replace(/\uE000(\d+)\uE001/g, (_, i) => escapeHtml(math[Number(i)] ?? ''));
}

function mdToHtmlInner(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let listType = null;
  let para = [];
  const closeList = () => { if (listType) { out.push('</' + listType + '>'); listType = null; } };
  const flushPara = () => {
    if (para.length) { out.push('<p>' + para.map(l => inline(escapeHtml(l))).join('<br>') + '</p>'); para = []; }
  };
  for (const line of lines) {
    if (!line.trim()) { flushPara(); closeList(); continue; }
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushPara(); closeList();
      out.push('<h' + m[1].length + '>' + inline(escapeHtml(m[2])) + '</h' + m[1].length + '>');
    } else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      flushPara();
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push('<li>' + inline(escapeHtml(m[1])) + '</li>');
    } else if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      flushPara();
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push('<li>' + inline(escapeHtml(m[1])) + '</li>');
    } else {
      para.push(line.trim());
    }
  }
  flushPara(); closeList();
  return out.join('\n');
}
