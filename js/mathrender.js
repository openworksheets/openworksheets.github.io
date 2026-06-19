// Renderizado de fórmulas LaTeX con MathJax (componente tex-svg, salida SVG).
//
// Se carga de forma diferida: solo se descarga vendor/mathjax-tex-svg.js la
// primera vez que hay que tipografiar algo con delimitadores LaTeX. Así las
// fichas sin fórmulas no pagan el coste (~2 MB) de la librería.
//
// Delimitadores: \( … \) en línea y \[ … \] en bloque. Incluye AMS (matrices,
// integrales, flechas…) y mhchem (química, \ce{…}). La salida es SVG, sin
// fuentes externas, por lo que funciona offline y dentro de paquetes SCORM/web.

let mathReady = null; // Promesa de carga (una sola vez)

// ¿El texto contiene delimitadores de fórmula? Evita cargar MathJax sin motivo.
const DELIM_RE = /\\\(|\\\[/;
export function textHasMath(s) {
  return DELIM_RE.test(String(s || ''));
}

// Ruta a la librería, relativa al documento (junto a vendor/jszip.min.js).
function mathJaxSrc() {
  return 'vendor/mathjax-tex-svg.js';
}

function loadMathJax() {
  if (mathReady) return mathReady;
  // La configuración debe existir ANTES de cargar el script.
  window.MathJax = {
    tex: {
      inlineMath: [['\\(', '\\)']],
      displayMath: [['\\[', '\\]']],
      packages: { '[+]': ['mhchem'] }
    },
    svg: { fontCache: 'local' },
    options: { enableMenu: false },
    startup: { typeset: false }
  };
  mathReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = mathJaxSrc();
    s.async = true;
    s.onload = () => {
      const ready = window.MathJax?.startup?.promise || Promise.resolve();
      ready.then(resolve).catch(resolve);
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return mathReady;
}

// Tipografía las fórmulas dentro de uno o varios elementos del DOM. No hace
// nada (ni carga la librería) si no hay fórmulas y aún no se había cargado.
export async function typesetMath(target) {
  const els = (Array.isArray(target) ? target : [target]).filter(Boolean);
  if (!els.length) return;
  if (!mathReady && !els.some(e => textHasMath(e.textContent))) return;
  try {
    await loadMathJax();
    if (window.MathJax?.typesetPromise) await window.MathJax.typesetPromise(els);
  } catch {
    /* La ficha sigue siendo usable aunque MathJax no cargue. */
  }
}
