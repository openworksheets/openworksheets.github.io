// Localización del navegador que usa el servidor para rasterizar el PDF.
//
// Vale cualquier navegador basado en Chromium —Chrome, Chromium o Edge—, porque
// lo único que se le pide es hablar el protocolo CDP.
//
// La lógica vive aquí, separada del arranque, para poder comprobarla en
// cualquier sistema simulando las variables de entorno de otro: la detección de
// Windows es justamente la que no se puede probar a mano desde Linux.

const fs = require('fs');
const path = require('path');

// Orden de preferencia dentro de cada sistema. Chrome primero por ser lo más
// común; Edge al final, aunque en Windows suele estar instalado siempre.
const WIN_APPS = [
  ['Google', 'Chrome', 'Application', 'chrome.exe'],
  ['Google', 'Chrome Beta', 'Application', 'chrome.exe'],
  ['Google', 'Chrome Dev', 'Application', 'chrome.exe'],
  ['Google', 'Chrome SxS', 'Application', 'chrome.exe'],   // Canary
  ['Chromium', 'Application', 'chrome.exe'],
  ['Microsoft', 'Edge', 'Application', 'msedge.exe']
];

const MAC_APPS = [
  'Google Chrome.app/Contents/MacOS/Google Chrome',
  'Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
  'Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  'Chromium.app/Contents/MacOS/Chromium',
  'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];

const LINUX_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/usr/bin/microsoft-edge',
  '/usr/bin/microsoft-edge-stable',
  '/opt/google/chrome/chrome'
];

// Nombres a buscar en el PATH, sin extensión: en Windows se combinan con las
// extensiones de PATHEXT.
const EXEC_NAMES = {
  win32: ['chrome', 'msedge', 'chromium'],
  darwin: ['google-chrome', 'chromium', 'microsoft-edge'],
  linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']
};

// Rutas habituales de instalación, según el sistema. En Windows se arman con
// las variables de entorno para no escribir el nombre de usuario en ninguna
// ruta (%LOCALAPPDATA% ya lo lleva dentro).
function systemCandidates(env, platform) {
  if (platform === 'win32') {
    const bases = [env['PROGRAMFILES'], env['PROGRAMFILES(X86)'], env['LOCALAPPDATA']].filter(Boolean);
    const out = [];
    for (const base of bases) {
      for (const app of WIN_APPS) out.push([base, ...app].join('\\'));
    }
    return out;
  }
  if (platform === 'darwin') {
    const out = [];
    for (const app of MAC_APPS) {
      out.push('/Applications/' + app);
      if (env.HOME) out.push(path.posix.join(env.HOME, 'Applications', app));
    }
    return out;
  }
  return LINUX_PATHS.slice();
}

// Ejecutables alcanzables desde el PATH. En Windows se prueban las extensiones
// de PATHEXT, que es lo que hace el propio sistema al resolver un comando.
function pathCandidates(env, platform) {
  const win = platform === 'win32';
  const raw = env.PATH || env.Path || '';
  const dirs = raw.split(win ? ';' : ':').map(d => d.trim()).filter(Boolean);
  const exts = win
    ? (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').map(e => e.trim()).filter(Boolean)
    : [''];
  const names = EXEC_NAMES[platform] || EXEC_NAMES.linux;
  const join = win ? ((a, b) => a.replace(/[\\/]+$/, '') + '\\' + b) : path.posix.join;

  const out = [];
  for (const dir of dirs) {
    for (const name of names) {
      for (const ext of exts) out.push(join(dir, name + ext));
    }
  }
  return out;
}

// ¿Sirve este candidato? Tiene que existir y ser un archivo. El permiso de
// ejecución solo se comprueba donde significa algo: en Windows el bit de Unix
// no aplica y accessSync daría falsos negativos.
function isUsable(file, platform = process.platform, fsx = fs) {
  if (!file) return false;
  try {
    const st = fsx.statSync(file);
    if (!st.isFile()) return false;
    if (platform !== 'win32') fsx.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Todos los candidatos en orden de preferencia, sin comprobar si existen.
// Se expone para las pruebas y para poder listarlos en un mensaje de error.
function candidates(env = process.env, platform = process.platform) {
  return [
    env.OWS_CHROME,
    env.CHROME_PATH,
    ...pathCandidates(env, platform),
    ...systemCandidates(env, platform)
  ].filter(Boolean);
}

function notFoundMessage(platform) {
  const ejemplo = platform === 'win32'
    ? 'OWS_CHROME=C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : platform === 'darwin'
      ? 'OWS_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"'
      : 'OWS_CHROME=/usr/bin/google-chrome';
  return [
    'No se ha encontrado ningún navegador.',
    'El servidor necesita Google Chrome, Chromium o Microsoft Edge instalado en el ordenador.',
    'Si ya lo tienes pero en otra carpeta, indica su ruta completa en la variable OWS_CHROME. Por ejemplo:',
    '  ' + ejemplo
  ].join('\n');
}

// Devuelve la ruta del navegador, o lanza un error explicando qué falta.
function findChrome({ env = process.env, platform = process.platform, usable = isUsable } = {}) {
  // Una ruta indicada a mano que no sirve es un error, no algo que ignorar en
  // silencio: quien la definió espera que se use esa.
  if (env.OWS_CHROME && !usable(env.OWS_CHROME, platform)) {
    throw new Error(
      `OWS_CHROME apunta a «${env.OWS_CHROME}», pero ahí no hay un programa que se pueda ejecutar.\n` +
      'Revisa la ruta (debe ser la del ejecutable, no la de la carpeta) o quita la variable para que se busque el navegador automáticamente.'
    );
  }
  for (const c of candidates(env, platform)) {
    if (usable(c, platform)) return c;
  }
  throw new Error(notFoundMessage(platform));
}

module.exports = { findChrome, candidates, isUsable, systemCandidates, pathCandidates, notFoundMessage };
