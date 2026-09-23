// Catálogo de tipografías seleccionables para los campos con texto.
//
// La ficha tiene una fuente global (manifest.settings.fontFamily) que se hereda
// en todos los campos mediante la variable CSS --ficha-font; cada campo puede
// sobrescribirla con field.fontFamily (variable --field-font). El valor guardado
// es el «id»; el «stack» es el font-family CSS real con sus alternativas.
//
// Las webfonts están alojadas en /fonts y se declaran con @font-face en
// css/app.css. «files» son sus archivos, que las exportaciones copian al paquete.

export const FONT_OPTIONS = [
  { id: 'atkinson',     name: 'Atkinson Hyperlegible', stack: "'Atkinson Hyperlegible', 'Trebuchet MS', sans-serif",
    files: ['fonts/atkinson-400-italic-latin-ext.woff2', 'fonts/atkinson-400-italic-latin.woff2', 'fonts/atkinson-400-latin-ext.woff2', 'fonts/atkinson-400-latin.woff2', 'fonts/atkinson-700-latin-ext.woff2', 'fonts/atkinson-700-latin.woff2'] },
  { id: 'lexend',       name: 'Lexend',                stack: "'Lexend', system-ui, sans-serif",
    files: ['fonts/lexend-400-latin-ext.woff2', 'fonts/lexend-400-latin.woff2', 'fonts/lexend-700-latin-ext.woff2', 'fonts/lexend-700-latin.woff2'] },
  { id: 'opendyslexic', name: 'OpenDyslexic',          stack: "'OpenDyslexic', 'Comic Sans MS', sans-serif",
    files: ['fonts/opendyslexic-400.woff2', 'fonts/opendyslexic-700.woff2'] },
  { id: 'andika',       name: 'Andika',                stack: "'Andika', system-ui, sans-serif",
    files: ['fonts/andika-400-italic-latin-ext.woff2', 'fonts/andika-400-italic-latin.woff2', 'fonts/andika-400-latin-ext.woff2', 'fonts/andika-400-latin.woff2', 'fonts/andika-700-latin-ext.woff2', 'fonts/andika-700-latin.woff2'] },
  { id: 'patrick',      name: 'Patrick Hand',          stack: "'Patrick Hand', 'Comic Sans MS', cursive",
    files: ['fonts/patrick-400-latin-ext.woff2', 'fonts/patrick-400-latin.woff2'] },
  { id: 'nunito',       name: 'Nunito',                stack: "'Nunito', 'Trebuchet MS', sans-serif",
    files: ['fonts/nunito-500-latin-ext.woff2', 'fonts/nunito-500-latin.woff2', 'fonts/nunito-700-latin-ext.woff2', 'fonts/nunito-700-latin.woff2', 'fonts/nunito-900-latin-ext.woff2', 'fonts/nunito-900-latin.woff2'] },
  { id: 'lora',         name: 'Lora',                  stack: "'Lora', Georgia, serif",
    files: ['fonts/lora-400-italic-latin-ext.woff2', 'fonts/lora-400-italic-latin.woff2', 'fonts/lora-400-latin-ext.woff2', 'fonts/lora-400-latin.woff2', 'fonts/lora-700-latin-ext.woff2', 'fonts/lora-700-latin.woff2'] },
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

// Tipografías de la propia interfaz del visor (--display y --cuerpo).
const UI_FONTS = ['nunito', 'atkinson'];

// Archivos de tipografía que necesita una ficha exportada: los de la interfaz,
// la fuente global y las que haya elegido cada campo. Si la ficha va cifrada
// con contraseña no se ven sus campos, y se incluyen todas.
export function fontFilesFor(manifest) {
  if (!manifest || manifest.encryptedManifest || !Array.isArray(manifest.pages)) {
    return FONT_OPTIONS.flatMap(f => f.files || []);
  }
  const ids = new Set(UI_FONTS);
  ids.add(manifest.settings?.fontFamily || DEFAULT_FONT);
  for (const page of manifest.pages) {
    for (const field of page.fields || []) {
      if (field.fontFamily) ids.add(field.fontFamily);
    }
  }
  return [...ids].flatMap(id => BY_ID.get(id)?.files || []);
}
