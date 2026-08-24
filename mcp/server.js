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
    color: { type: 'string', description: 'label/cover/formas: color del texto, tapado o borde, en formato CSS.' },
    bold: { type: 'boolean', description: 'label: texto en negrita.' },
    align: { type: 'string', description: 'label: "left", "center" o "right".' },
    fontScale: { type: 'number', description: 'Multiplicador del tamaño de letra (1 por defecto).' },
    fontFamily: { type: 'string', description: 'Fuente propia del campo: atkinson, lexend, opendyslexic, andika, patrick, nunito, lora o mono.' },
    rotate: { type: 'number', description: 'label/formas: giro en grados.' },
    bg: { type: 'string', description: 'Campos de respuesta: color de fondo.' },
    bgOpacity: { type: 'number', description: 'Campos de respuesta: opacidad del fondo, de 0 a 1.' },
    fgColor: { type: 'string', description: 'Campos de respuesta: color de texto.' },
    opacity: { type: 'number', description: 'cover: opacidad de 0 a 1.' },
    width: { type: 'number', description: 'Formas: grosor del trazo en píxeles.' },
    style: { type: 'string', description: 'Formas: "solid", "dashed" o "dotted".' },
    dir: { type: 'string', description: 'line: "h", "v", "d1" o "d2".' },
    heads: { type: 'string', description: 'line: "none", "end" o "both".' },
    invert: { type: 'boolean', description: 'line: invierte una flecha de una punta.' },
    noStroke: { type: 'boolean', description: 'rect/ellipse/polygon: forma sin borde.' },
    fill: { type: 'string', description: 'rect/ellipse/polygon: color de relleno; vacío significa sin relleno.' },
    fillOpacity: { type: 'number', description: 'rect/ellipse/polygon: opacidad del relleno, de 0 a 1.' },
    borderRadius: { type: 'number', description: 'rect: redondeo de esquinas, de 0 a 50.' },
    square: { type: 'boolean', description: 'rect: conservar forma cuadrada.' },
    circle: { type: 'boolean', description: 'ellipse: conservar forma circular.' },
    sides: { type: 'integer', description: 'polygon: número de lados, de 3 a 20.' },
    regular: { type: 'boolean', description: 'polygon: conservar las proporciones regulares.' }
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
    description: [
      'Abre un PDF o una imagen QUE YA TIENE EL PROFESOR y lo convierte en las páginas de fondo de una ficha nueva. Descarta la ficha que hubiera en curso. Devuelve el número de páginas y si cada una tiene capa de texto.',
      '',
      'Solo para documentos que aporta el profesor. NO generes tú un PDF, una imagen ni un HTML con las preguntas para abrirlo aquí: lo que abras se convierte en imagen de fondo y sus enunciados dejan de ser editables en el editor (el profesor solo podría tocar las respuestas). Si las preguntas las inventas tú, usa create_worksheet + add_questions.'
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Ruta del archivo PDF o de imagen en el ordenador del profesor.' } },
      required: ['path']
    },
    run: a => session.openDocument(a.path)
  },
  {
    name: 'create_worksheet',
    description: [
      'Empieza una ficha nueva en blanco, sin partir de ningún documento: es la vía correcta siempre que las preguntas las inventes tú en lugar de colocarlas sobre un documento del profesor. Después, add_questions las va colocando solas.',
      '',
      'Así cada enunciado queda como un campo de texto del editor, que el profesor puede reescribir, mover o borrar. Fabricar un PDF o una imagen con las preguntas y abrirlo con open_document deja los enunciados incrustados en el fondo y ya no se pueden editar.'
    ].join('\n'),
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
      'Cada pregunta lleva su "type", su "prompt" (el enunciado) y su respuesta, con la misma forma que en place_fields, pero SIN "rect". El enunciado se coloca como un campo de texto del editor, así que el profesor puede reescribirlo después.',
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
    name: 'apply_design',
    description: [
      'Aplica a la ficha un diseño coherente y accesible usando las herramientas nativas de OWS: tipografía, fondo, cabecera, jerarquía de textos, separadores y tarjetas suaves para agrupar preguntas.',
      '',
      'En fichas creadas desde cero, conviene llamarla DESPUÉS de create_worksheet y ANTES de add_questions: así el colocador reserva el espacio de la cabecera y hereda el tema en las páginas nuevas. Si ya hay preguntas, también puede aplicarse: estiliza lo existente y añade las tarjetas por detrás sin tapar los campos.',
      '',
      'Los temas mantienen buen contraste y una decoración contenida. En un PDF aportado por el profesor no cambia el fondo ni dibuja tarjetas sobre el documento; limita el cambio a tipografía y textos añadidos para respetar su diseño original.'
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        theme: { type: 'string', description: 'Tema: "clean", "science", "math", "warm" o "accessible".' },
        accentColor: { type: 'string', description: 'Color principal opcional (#RRGGBB).' },
        paperColor: { type: 'string', description: 'Color de la hoja opcional (#RRGGBB).' },
        textColor: { type: 'string', description: 'Color del texto opcional (#RRGGBB); se corrige si no tiene contraste suficiente.' },
        cardColor: { type: 'string', description: 'Color de las tarjetas opcional (#RRGGBB).' },
        fontFamily: { type: 'string', description: 'atkinson, lexend, opendyslexic, andika, patrick, nunito, lora o mono.' },
        cards: { type: 'boolean', description: 'Agrupar visualmente las preguntas en tarjetas suaves (sí por defecto).' },
        header: { type: 'boolean', description: 'Añadir cabecera con el título cuando haya sitio (sí por defecto).' }
      }
    },
    run: a => session.applyDesign(a)
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
    description: 'Coloca uno o varios campos de respuesta o elementos de diseño sobre la página. Avisa (sin bloquear) si un campo se solapa con otro o tapa texto impreso. Después conviene mirar preview_page para comprobar que han caído en su sitio.',
    inputSchema: {
      type: 'object',
      properties: { fields: { type: 'array', items: FIELD_SPEC } },
      required: ['fields']
    },
    run: a => session.placeFields(a.fields || [])
  },
  {
    name: 'preview_page',
    description: 'Devuelve la captura de una página tal y como la verá el alumnado: la ficha montada con el visor real, no un dibujo aproximado. Encima solo se añaden el contorno y el número de cada campo, para poder nombrarlos. Es la comprobación de que lo que se ve es lo que se espera: míralo antes de guardar, fíjate en lo que queda a la vista (un campo no siempre tapa todo su rectángulo: las soluciones impresas hay que quitarlas con redact_areas) y corrige con adjust_field lo que esté desplazado.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer' },
        grid: { type: 'boolean', description: 'Superponer una rejilla con las coordenadas: ayuda a situar campos cuando la página no tiene capa de texto.' },
        width: { type: 'integer', description: 'Ancho de la imagen en píxeles (1100 por defecto).' },
        marks: { type: 'boolean', description: 'Dibujar el contorno y el número de cada campo (sí por defecto). Con false se ve la ficha exactamente como el alumnado, sin nada superpuesto: útil para comprobar qué queda a la vista.' }
      },
      required: ['page']
    },
    run: async a => {
      const { base64, legend, real, error } = await session.preview(a.page, a);
      const notas = [];
      notas.push(legend.length ? 'Campos:\n' + legend.join('\n') : 'La página todavía no tiene ningún campo.');
      if (!real) {
        notas.push('Aviso: esta imagen no es el visor real, sino un dibujo aproximado de los campos' +
          (error ? ` (${error})` : ' (falta la carpeta app/ del paquete)') +
          '. Un campo puede tapar menos de lo que aquí parece.');
      }
      return {
        content: [
          { type: 'image', data: base64, mimeType: 'image/png' },
          { type: 'text', text: notas.join('\n\n') }
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
        distractors: { type: 'array', items: { type: 'string' } },
        color: { type: 'string' }, bold: { type: 'boolean' }, align: { type: 'string' },
        fontScale: { type: 'number' }, fontFamily: { type: 'string' }, rotate: { type: 'number' },
        bg: { type: 'string' }, bgOpacity: { type: 'number' }, fgColor: { type: 'string' },
        opacity: { type: 'number' }, width: { type: 'number' }, style: { type: 'string' },
        dir: { type: 'string' }, heads: { type: 'string' }, invert: { type: 'boolean' },
        noStroke: { type: 'boolean' }, fill: { type: 'string' }, fillOpacity: { type: 'number' },
        borderRadius: { type: 'number' }, square: { type: 'boolean' }, circle: { type: 'boolean' },
        sides: { type: 'integer' }, regular: { type: 'boolean' }
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
  'Crea fichas interactivas de OpenWorksheets: partiendo de un PDF o una imagen del profesor, o desde cero.',
  '',
  'Antes de nada, decide por dónde empezar:',
  '  - El profesor aporta un PDF o una imagen  ->  open_document y coloca los campos encima.',
  '  - Las preguntas las escribes tú           ->  create_worksheet y luego add_questions.',
  '',
  'Nunca fabriques un PDF, una imagen o un HTML con las preguntas para abrirlo con open_document.',
  'Lo que se abre pasa a ser la imagen de fondo de la página: sus enunciados quedan incrustados y el',
  'profesor ya no puede editarlos ni moverlos, solo tocar las respuestas. Con add_questions cada',
  'enunciado es un campo de texto normal del editor, y eso es lo que espera el profesorado.',
  '',
  'Orden de trabajo con un documento del profesor:',
  '  1. open_document con la ruta del PDF o de la imagen.',
  '  2. read_layout de cada página para ver el texto y sus coordenadas.',
  '  3. place_fields con los campos de esa página.',
  '  4. preview_page y MIRA la imagen: es la ficha montada con el visor del alumnado, así que lo que ahí',
  '     se ve es lo que verá quien la haga. Comprueba que cada campo está donde debe, que no tapa texto y',
  '     que no queda a la vista nada que deba desaparecer.',
  '     En «arrastrar a zonas», las zonas de destino salen a trazos con la respuesta que esperan.',
  '  5. adjust_field lo que esté desplazado, y vuelve a previsualizar.',
  '  6. redact_areas si hay soluciones impresas u otras zonas que deban desaparecer.',
  '  7. set_worksheet_info y save_worksheet.',
  '',
  'Orden de trabajo sin documento: create_worksheet, apply_design, add_questions, preview_page para',
  'mirar cómo ha quedado, adjust_field lo que no encaje, set_worksheet_info y save_worksheet.',
  'Usa apply_design salvo que el profesor pida expresamente una ficha sin decoración. El diseño debe',
  'ayudar a leer y agrupar; no añadas formas gratuitas que distraigan de las preguntas.',
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
