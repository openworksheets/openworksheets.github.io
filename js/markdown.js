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

export function mdToHtml(src) {
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
