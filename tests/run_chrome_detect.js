// Detección del navegador del servidor MCP (mcp/chrome.js).
//
// Se simulan las variables de entorno y el sistema de archivos de cada sistema,
// de modo que la detección de Windows —la que no se puede probar a mano desde
// Linux, y donde antes no se encontraba nada— quede cubierta igualmente.
//
//   node tests/run_chrome_detect.js
const path = require('path');
const { findChrome, candidates, isUsable } = require(path.join(__dirname, '..', 'mcp', 'chrome.js'));

let fails = 0;
const check = (name, ok, extra) => {
  if (!ok) fails++;
  console.log(`${name}: ${ok ? 'OK' : 'MAL'}${extra ? ' — ' + extra : ''}`);
};

// Sistema de archivos simulado: solo existen las rutas de la lista.
const fake = existentes => (file, platform) => existentes.includes(file);

const WIN_ENV = {
  'PROGRAMFILES': 'C:\\Program Files',
  'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
  'LOCALAPPDATA': 'C:\\Users\\Ana Pérez\\AppData\\Local',
  'PATH': 'C:\\Windows\\system32;C:\\Program Files\\nodejs',
  'PATHEXT': '.COM;.EXE;.BAT'
};

// --- Windows: cada ubicación habitual ---------------------------------------
const WIN_CASOS = [
  ['Chrome en Program Files', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
  ['Chrome en Program Files (x86)', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'],
  ['Chrome en LOCALAPPDATA', 'C:\\Users\\Ana Pérez\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'],
  ['Chromium en Program Files', 'C:\\Program Files\\Chromium\\Application\\chrome.exe'],
  ['Chromium en LOCALAPPDATA', 'C:\\Users\\Ana Pérez\\AppData\\Local\\Chromium\\Application\\chrome.exe'],
  ['Chrome Beta', 'C:\\Program Files\\Google\\Chrome Beta\\Application\\chrome.exe'],
  ['Chrome Dev', 'C:\\Program Files\\Google\\Chrome Dev\\Application\\chrome.exe'],
  ['Chrome Canary', 'C:\\Users\\Ana Pérez\\AppData\\Local\\Google\\Chrome SxS\\Application\\chrome.exe'],
  ['Microsoft Edge', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
];
for (const [nombre, ruta] of WIN_CASOS) {
  const found = findChrome({ env: WIN_ENV, platform: 'win32', usable: fake([ruta]) });
  check('Windows: ' + nombre, found === ruta, found);
}

// El nombre de usuario nunca se escribe a mano: sale de LOCALAPPDATA.
const conEspacios = candidates(WIN_ENV, 'win32');
check('Windows: rutas con espacios y usuario desde el entorno',
  conEspacios.some(c => c.includes('Ana Pérez')) && conEspacios.every(c => !/tu-usuario|username/.test(c)));

// --- Windows: PATH y PATHEXT ------------------------------------------------
const enPath = 'C:\\Program Files\\nodejs\\chrome.EXE';
check('Windows: encuentra por PATH con PATHEXT',
  findChrome({ env: WIN_ENV, platform: 'win32', usable: fake([enPath]) }) === enPath);

check('Windows: el PATH tiene prioridad sobre las rutas habituales',
  findChrome({
    env: WIN_ENV, platform: 'win32',
    usable: fake([enPath, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'])
  }) === enPath);

// --- Prioridad de las variables --------------------------------------------
const propia = 'D:\\Mis Programas\\Chrome\\chrome.exe';
check('OWS_CHROME manda sobre todo lo demás',
  findChrome({
    env: { ...WIN_ENV, OWS_CHROME: propia, CHROME_PATH: enPath },
    platform: 'win32',
    usable: fake([propia, enPath, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'])
  }) === propia);

check('CHROME_PATH manda sobre PATH y rutas habituales',
  findChrome({
    env: { ...WIN_ENV, CHROME_PATH: propia }, platform: 'win32',
    usable: fake([propia, enPath])
  }) === propia);

// OWS_CHROME mal puesta: error que dice cuál es la ruta, no búsqueda silenciosa
let msg = '';
try {
  findChrome({ env: { ...WIN_ENV, OWS_CHROME: 'C:\\no\\existe.exe' }, platform: 'win32',
               usable: fake(['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']) });
} catch (e) { msg = e.message; }
check('OWS_CHROME inexistente avisa con su ruta', msg.includes('C:\\no\\existe.exe'), msg.split('\n')[0]);

// --- Sin navegador: mensaje útil -------------------------------------------
msg = '';
try { findChrome({ env: WIN_ENV, platform: 'win32', usable: fake([]) }); } catch (e) { msg = e.message; }
check('sin navegador: nombra Chrome, Chromium y Edge',
  /Chrome/.test(msg) && /Chromium/.test(msg) && /Edge/.test(msg));
check('sin navegador: explica OWS_CHROME con un ejemplo de Windows',
  msg.includes('OWS_CHROME') && msg.includes('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'));

// --- Linux y macOS siguen igual --------------------------------------------
const LINUX_ENV = { PATH: '/usr/local/bin:/usr/bin' };
for (const ruta of ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
  check('Linux: ' + ruta, findChrome({ env: LINUX_ENV, platform: 'linux', usable: fake([ruta]) }) === ruta);
}
const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
check('macOS: Chrome en /Applications',
  findChrome({ env: { HOME: '/Users/ana' }, platform: 'darwin', usable: fake([mac]) }) === mac);
check('macOS: Chrome en la carpeta del usuario',
  findChrome({ env: { HOME: '/Users/ana' }, platform: 'darwin',
               usable: fake(['/Users/ana/Applications/Chromium.app/Contents/MacOS/Chromium']) })
  === '/Users/ana/Applications/Chromium.app/Contents/MacOS/Chromium');

// --- Comprobación real sobre este mismo ordenador ---------------------------
try {
  const real = findChrome();
  check('este ordenador: navegador encontrado', isUsable(real), real);
} catch (e) {
  console.log('este ordenador: sin navegador (se omite) — ' + e.message.split('\n')[0]);
}

console.log(fails ? `\n${fails} comprobación(es) fallidas` : '\nTodo correcto');
process.exit(fails ? 1 : 0);
