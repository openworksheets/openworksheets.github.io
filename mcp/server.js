#!/usr/bin/env node
// Servidor MCP de OpenWorksheets: permite que una IA convierta un PDF (o una
// imagen) en una ficha interactiva colocando los campos de respuesta sobre el
// documento, comprobando el resultado con una vista previa y guardando el
// paquete .owpkg que el profesor abre después en el editor.
//
// El protocolo MCP se habla directamente sobre stdio (JSON-RPC 2.0, un mensaje
// JSON por línea). Se implementa aquí en lugar de usar el SDK oficial para no
// añadir dependencias: esta carpeta se descarga suelta y tiene que funcionar
// recién descomprimida, sin «npm install» ni terminal (quien usa Claude Desktop
// o LM Studio no tiene por qué abrir una). Solo hacen falta Node y Chrome.

const session = require('./session');
const { version: VERSION } = require('./package.json');
const { close } = require('./browser');
const { typeList } = require('./fieldspec');

const PROTOCOL = '2024-11-05';

const RECT = {
  type: 'object',
  description: 'Rectángulo en fracciones de la página (0–1), origen arriba a la izquierda.',
  properties: {
    x: { type: 'number' }, y: { type: 'number' },
    w: { type: 'number' }, h: { type: 'number' }
  },
  required: ['x', 'y', 'w', 'h']
};

const FIELD_SPEC = {
  type: 'object',
  properties: {
    page: { type: 'integer', description: 'Página, empezando por 1.' },
    type: { type: 'string', description: 'Tipo de campo. ' + typeList().join('; ') },
    rect: RECT,
    points: { type: 'number', description: 'Puntos del campo (1 por defecto).' },
    noScore: { type: 'boolean', description: 'El campo se responde pero no puntúa.' },
    answers: { type: 'array', items: { type: 'string' }, description: 'text/formula: respuestas aceptadas (la primera es la de referencia).' },
    answer: { description: 'number: valor correcto.' },
    tolerance: { type: 'number', description: 'number: margen de error admitido.' },
    options: { type: 'array', items: { type: 'string' }, description: 'single/multi/select: opciones.' },
    correct: { description: 'single/select: índice correcto. multi: lista de índices. truefalse: true/false.' },
    partial: { type: 'boolean', description: 'multi: puntuar parcialmente los aciertos.' },
    labels: { type: 'array', items: { type: 'string' }, description: 'truefalse: etiquetas de los dos botones.' },
    prompt: { type: 'string', description: 'essay: consigna que se muestra sobre el cuadro de escritura.' },
    maxWords: { type: 'integer', description: 'essay: límite de palabras (0 = sin límite).' },
    rows: { type: 'integer', description: 'essay: altura del cuadro en líneas.' },
    text: { type: 'string', description: 'gaps: texto con los huecos entre corchetes, admitiendo alternativas: "El agua hierve a [100] grados y se congela a [0|cero]." — label: el texto que se escribe.' },
    items: { type: 'array', items: { type: 'string' }, description: 'order: elementos ya en el orden correcto.' },
    pairs: { type: 'array', description: 'match: parejas [{left, right}].', items: { type: 'object' } },
    zones: {
      type: 'array',
      description: 'dragdrop: zonas de destino sobre el documento, [{ rect: {x,y,w,h}, answers: ["etiqueta correcta"] }]. Ojo: en este tipo el "rect" del campo es la BANDEJA de donde parten las etiquetas (colócala en un hueco libre), y cada zona lleva su propio rect donde hay que soltarlas.',
      items: {
        type: 'object',
        properties: { rect: RECT, answers: { type: 'array', items: { type: 'string' } } },
        required: ['rect', 'answers']
      }
    },
    distractors: { type: 'array', items: { type: 'string' }, description: 'match y dragdrop: elementos sobrantes, que no corresponden a ninguna zona ni pareja.' },
    boxes: {
      type: 'array',
      description: 'textboxes: los huecos, [{ rect, answers: ["respuesta"] }]. checkbox: las casillas, [{ rect, correct: true }]. El "rect" del campo puede omitirse: se deduce de las cajas.',
      items: { type: 'object' }
    },
    rows: {
      type: 'array',
      description: 'table: filas de respuestas, una lista por fila. Cada celda admite varias respuestas válidas separadas por "|" o como lista. essay: número de líneas del cuadro.',
      items: {}
    },
    colHeaders: { type: 'array', items: { type: 'string' }, description: 'table: encabezados de columna.' },
    rowHeaders: { type: 'array', items: { type: 'string' }, description: 'table: encabezados de fila.' },
    examples: { type: 'array', description: 'table: celdas ya rellenas como ejemplo, misma forma que rows con true/false.', items: {} },
    scoreMode: { type: 'string', description: 'record: "manual" (lo puntúa el profesor) o "participation" (grabar algo da los puntos).' },
    maxSec: { type: 'integer', description: 'record: duración máxima de la grabación, en segundos.' },
    color: { type: 'string' },
    bold: { type: 'boolean' },
    align: { type: 'string' }
  },
  required: ['page', 'type', 'rect']
};

// Igual que FIELD_SPEC pero sin la geometría: en add_questions la calcula el
// servidor, y pedirla solo invitaría a inventar coordenadas.
const FIELD_SPEC_SIN_RECT = (() => {
  const { page, rect, ...resto } = FIELD_SPEC.properties;
  return { type: 'object', properties: { prompt: { type: 'string', description: 'Enunciado de la pregunta.' }, ...resto }, required: ['type'] };
})();

const TOOLS = [
  {
    name: 'open_document',
    description: 'Abre un PDF o una imagen y lo convierte en las páginas de fondo de una ficha nueva. Es el primer paso: descarta la ficha que hubiera en curso. Devuelve el número de páginas y si cada una tiene capa de texto.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Ruta del archivo PDF o de imagen en el ordenador del profesor.' } },
      required: ['path']
    },
    run: a => session.openDocument(a.path)
  },
  {
    name: 'create_worksheet',
    description: 'Empieza una ficha nueva en blanco, sin partir de ningún documento: para cuando hay que inventar las preguntas en lugar de colocarlas sobre un PDF. Después, add_questions las va colocando solas.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título de la ficha.' },
        instructions: { type: 'string', description: 'Instrucciones generales para el alumnado.' },
        pages: { type: 'integer', description: 'Páginas en blanco iniciales (1 por defecto; se añaden más solas si hacen falta).' },
        size: { type: 'string', description: 'Tamaño de página: "a4" (por defecto), "a4h" (apaisada) o "letter".' }
      }
    },
    run: a => session.createWorksheet(a)
  },
  {
    name: 'add_questions',
    description: [
      'Añade preguntas una detrás de otra, colocándolas solas: enunciado, campo de respuesta, separación y salto de página cuando hace falta. Es la forma de crear una ficha desde cero, sin calcular coordenadas.',
      '',
      'Cada pregunta lleva su "type", su "prompt" (el enunciado) y su respuesta, con la misma forma que en place_fields, pero SIN "rect".',
      '',
      'Para que la ficha sirva en clase:',
      '- Varía los tipos: una ficha entera de opción única evalúa poco.',
      '- En "single" y "multi", que las opciones incorrectas sean creíbles y del mismo estilo y longitud que la correcta. Nada de opciones absurdas ni de «todas las anteriores».',
      '- Cada pregunta debe tener una única respuesta defendible.',
      '- En "text", "number" y "formula", pide respuestas de una a tres palabras o un valor: una frase larga es imposible de acertar literalmente.',
      '- En "answers" pon solo sinónimos reales; la corrección ya ignora mayúsculas, tildes y espacios de más.',
      '- Usa "essay" una o dos veces como mucho: no se autocorrige y lo puntúa el profesor.',
      '- Enunciados breves y claros, del nivel pedido, sin repetir ideas.',
      '',
      'Al terminar, mira preview_page para comprobar cómo ha quedado.'
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Las preguntas, en el orden en que deben aparecer. Un item de tipo "label" sirve de título o de separador de sección.',
          items: FIELD_SPEC_SIN_RECT
        }
      },
      required: ['items']
    },
    run: a => session.addQuestions(a.items || [])
  },
  {
    name: 'read_layout',
    description: 'Lee una página: sus líneas de texto con las coordenadas de cada una y los candidatos a hueco de respuesta (rachas de guiones bajos y líneas horizontales impresas). Úsalo para saber dónde colocar cada campo antes de place_fields.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Página, empezando por 1.' },
        raw: { type: 'boolean', description: 'Devolver también cada fragmento de texto suelto, sin agrupar en líneas.' }
      },
      required: ['page']
    },
    run: a => session.readLayout(a.page, { raw: a.raw })
  },
  {
    name: 'place_fields',
    description: 'Coloca uno o varios campos de respuesta sobre el documento. Avisa (sin bloquear) si un campo se solapa con otro o tapa texto impreso. Después conviene mirar preview_page para comprobar que han caído en su sitio.',
    inputSchema: {
      type: 'object',
      properties: { fields: { type: 'array', items: FIELD_SPEC } },
      required: ['fields']
    },
    run: a => session.placeFields(a.fields || [])
  },
  {
    name: 'preview_page',
    description: 'Devuelve la imagen de una página con los campos dibujados y numerados encima. Es la comprobación de que lo que se ve es lo que se espera: míralo antes de guardar y corrige con adjust_field lo que esté desplazado.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        grid: { type: 'boolean', description: 'Superponer una rejilla con las coordenadas: ayuda a situar campos cuando la página no tiene capa de texto.' },
        width: { type: 'integer', description: 'Ancho de la imagen en píxeles (1100 por defecto).' }
      },
      required: ['page']
    },
    run: async a => {
      const { base64, legend } = await session.preview(a.page, a);
      return {
        content: [
          { type: 'image', data: base64, mimeType: 'image/png' },
          { type: 'text', text: legend.length ? 'Campos:\n' + legend.join('\n') : 'La página todavía no tiene ningún campo.' }
        ]
      };
    }
  },
  {
    name: 'adjust_field',
    description: 'Corrige un campo ya colocado: su posición y tamaño (rect), sus puntos o su contenido (respuestas, opciones…).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identificador devuelto por place_fields o list_fields.' },
        rect: RECT,
        points: { type: 'number' },
        answers: { type: 'array', items: { type: 'string' } },
        answer: {}, tolerance: { type: 'number' },
        options: { type: 'array', items: { type: 'string' } },
        correct: {}, text: { type: 'string' }, prompt: { type: 'string' },
        items: { type: 'array', items: { type: 'string' } },
        pairs: { type: 'array', items: { type: 'object' } },
        zones: { type: 'array', items: { type: 'object' }, description: 'dragdrop: sustituye todas las zonas de destino.' },
        distractors: { type: 'array', items: { type: 'string' } }
      },
      required: ['id']
    },
    run: a => { const { id, ...patch } = a; return session.adjustField(id, patch); }
  },
  {
    name: 'remove_fields',
    description: 'Borra campos por su identificador.',
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' } } },
      required: ['ids']
    },
    run: a => session.removeFields(a.ids || [])
  },
  {
    name: 'list_fields',
    description: 'Lista los campos colocados, con su posición y su configuración completa. Sin página, los de toda la ficha.',
    inputSchema: {
      type: 'object',
      properties: { page: { type: 'integer' } }
    },
    run: a => session.listFields(a.page)
  },
  {
    name: 'redact_areas',
    description: 'Borra zonas de una página pintando sobre la propia imagen de fondo: útil para quitar las soluciones impresas o cualquier cosa que el alumnado no deba ver. A diferencia del campo decorativo "cover", que solo tapa en pantalla, aquí el contenido desaparece del archivo y no se puede recuperar abriendo el paquete.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        areas: { type: 'array', items: RECT, description: 'Zonas a borrar, en fracciones de la página.' },
        color: { type: 'string', description: 'Color con el que se pinta encima (blanco por defecto).' }
      },
      required: ['page', 'areas']
    },
    run: a => session.redact(a.page, a.areas, a.color)
  },
  {
    name: 'set_worksheet_info',
    description: 'Fija el título, el autor, las instrucciones para el alumnado y el idioma de la ficha.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        author: { type: 'string' },
        instructions: { type: 'string' },
        lang: { type: 'string', description: 'Código de idioma: es, ca, en, eu…' },
        settings: { type: 'object', description: 'Ajustes del manifiesto (showScore, showCorrection, shuffle, maxAttempts…).' }
      }
    },
    run: a => session.setMeta(a)
  },
  {
    name: 'save_worksheet',
    description: 'Guarda la ficha como paquete .owpkg, que el profesor abre desde OpenWorksheets con «Archivo → Abrir ficha».',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Ruta de destino. Se le añade .owpkg si falta.' } },
      required: ['path']
    },
    run: a => session.save(a.path)
  }
];

const INSTRUCTIONS = [
  'Convierte PDFs e imágenes en fichas interactivas de OpenWorksheets colocando campos de respuesta sobre el documento.',
  '',
  'Orden de trabajo recomendado:',
  '  1. open_document con la ruta del PDF o de la imagen. Si la ficha no parte de ningún',
  '     documento, create_worksheet y luego add_questions, que las coloca solas.',
  '  2. read_layout de cada página para ver el texto y sus coordenadas.',
  '  3. place_fields con los campos de esa página.',
  '  4. preview_page y MIRA la imagen: comprueba que cada campo está donde debe y no tapa texto.',
  '     En «arrastrar a zonas», las zonas de destino salen a trazos con la respuesta que esperan.',
  '  5. adjust_field lo que esté desplazado, y vuelve a previsualizar.',
  '  6. redact_areas si hay soluciones impresas u otras zonas que deban desaparecer.',
  '  7. set_worksheet_info y save_worksheet.',
  '',
  'Todas las coordenadas van en fracciones de la página (0–1), con el origen arriba a la izquierda.',
  '',
  'Versión de este servidor: ' + VERSION + '. Si el profesor pregunta si está al día, la última publicada',
  'aparece en https://github.com/openworksheets/openworksheets.github.io/releases y se actualiza',
  'descargando otra vez la carpeta encima de la que ya tiene.'
].join('\n');

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function reply(id, result) {
  if (id != null) send({ jsonrpc: '2.0', id, result });
}

function fail(id, message, code = -32603) {
  if (id != null) send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params = {} } = msg;
  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: 'openworksheets', version: VERSION },
        instructions: INSTRUCTIONS
      });
    case 'ping':
      return reply(id, {});
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;
    case 'tools/list':
      return reply(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
      });
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === params.name);
      if (!tool) return fail(id, `Herramienta desconocida: ${params.name}`, -32601);
      try {
        const out = await tool.run(params.arguments || {});
        // Una herramienta puede devolver ya el «content» de MCP (la vista previa
        // devuelve una imagen); el resto devuelve datos y se serializan a JSON.
        if (out && out.content) return reply(id, out);
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
      } catch (e) {
        // Los errores de uso se devuelven como resultado con isError, no como
        // error de protocolo: así el modelo los lee y puede corregirse solo.
        return reply(id, { isError: true, content: [{ type: 'text', text: 'Error: ' + e.message }] });
      }
    }
    default:
      return fail(id, `Método no soportado: ${method}`, -32601);
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg).catch(e => fail(msg.id, e.message));
  }
});

process.stdin.on('end', async () => { await close(); process.exit(0); });
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { await close(); process.exit(0); });
}
