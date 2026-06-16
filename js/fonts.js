// Catálogo de tipografías seleccionables para los campos con texto.
//
// La ficha tiene una fuente global (manifest.settings.fontFamily) que se hereda
// en todos los campos mediante la variable CSS --ficha-font; cada campo puede
// sobrescribirla con field.fontFamily (variable --field-font). El valor guardado
// es el «id»; el «stack» es el font-family CSS real con sus alternativas.
//
// Las webfonts se cargan en css/app.css (Google Fonts por @import; OpenDyslexic
// alojada en /fonts mediante @font-face).

export const FONT_OPTIONS = [
  { id: 'atkinson',     name: 'Atkinson Hyperlegible', stack: "'Atkinson Hyperlegible', 'Trebuchet MS', sans-serif" },
  { id: 'lexend',       name: 'Lexend',                stack: "'Lexend', system-ui, sans-serif" },
  { id: 'opendyslexic', name: 'OpenDyslexic',          stack: "'OpenDyslexic', 'Comic Sans MS', sans-serif" },
  { id: 'andika',       name: 'Andika',                stack: "'Andika', system-ui, sans-serif" },
  { id: 'patrick',      name: 'Patrick Hand',          stack: "'Patrick Hand', 'Comic Sans MS', cursive" },
  { id: 'nunito',       name: 'Nunito',                stack: "'Nunito', 'Trebuchet MS', sans-serif" },
  { id: 'lora',         name: 'Lora',                  stack: "'Lora', Georgia, serif" },
  { id: 'mono',         name: 'Monospace',             stack: "ui-monospace, 'Cascadia Mono', 'Consolas', monospace" },
];

// Id de la fuente predeterminada (coincide con --cuerpo: sin cambios visuales
// para fichas que no eligen otra).
export const DEFAULT_FONT = 'atkinson';

const BY_ID = new Map(FONT_OPTIONS.map(f => [f.id, f]));

// Devuelve el font-family CSS de un id; vacío o desconocido → predeterminada.
export function fontStack(id) {
  return (BY_ID.get(id) || BY_ID.get(DEFAULT_FONT)).stack;
}
