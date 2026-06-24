// Configuración de OpenWorksheets.
//
// gasUrl: URL del despliegue de Google Apps Script. El `gasUrl` de abajo apunta
// al despliegue del autor y solo se usa en el sitio oficial y en local (ver el
// bloque «PROTECCIÓN DEL DESPLIEGUE DEL AUTOR»). Quien publique un fork en otro
// dominio debe desplegar su propio Google Apps Script (ver gas/README.md).
//
// Sin gasUrl configurado, la aplicación intenta la descarga directa y,
// si falla por CORS, recurre a proxies CORS públicos (menos fiables).
window.OPENWORKSHEETS_CONFIG = {
  appVersion: '1.24.0',
  gasUrl: 'https://script.google.com/macros/s/AKfycbxTxNMhU6DsxfnwbtqfLzafj9AvMDYMyDG0qd03vKW8M2grSpZtsjerwO5NtxeWCWbI/exec',
  corsProxies: [
    { url: 'https://corsproxy.io/?', encode: true },
    { url: 'https://cors.eu.org/', encode: false }
  ]
};

// *** PROTECCIÓN DEL DESPLIEGUE DEL AUTOR ***
//
// El `gasUrl` de arriba apunta al Google Apps Script del autor del repositorio.
// Si alguien clona el repo y lo publica en otro dominio, seguiría consumiendo
// la cuota de Google del autor. Para evitarlo, comprobamos en qué dominio se
// está ejecutando la aplicación:
//
//   - Sitio oficial (openworksheets.github.io): se usa el `gasUrl` tal cual.
//   - Ejecución local (localhost, 127.0.0.1, file://, *.local): se permite,
//     para que el autor y quien colabore puedan desarrollar y probar.
//   - Cualquier otro dominio (un fork publicado en otro sitio): se anula el
//     `gasUrl` y se muestra un aviso indicando que hay que desplegar el propio
//     Google Apps Script (ver gas/README.md).
//
// Sin `gasUrl`, la aplicación sigue funcionando con la descarga directa y los
// proxies CORS públicos como alternativa.
(function () {
  const cfg = window.OPENWORKSHEETS_CONFIG;
  const host = (location.hostname || '').toLowerCase();

  const isOfficial = host === 'openworksheets.github.io';
  const isLocal =
    location.protocol === 'file:' ||
    host === '' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host.endsWith('.local') ||
    host.endsWith('.localhost');

  if (isOfficial || isLocal) return;

  // Despliegue en un dominio ajeno: no usar el GAS del autor.
  cfg.gasUrl = '';
  cfg.foreignDeployment = true;

  const DOCS_URL =
    'https://github.com/openworksheets/openworksheets.github.io/blob/main/gas/README.md';

  // Traducciones del aviso, en los mismos idiomas que el resto de la aplicación.
  // No se puede importar el sistema i18n (config.js es un script plano que se
  // carga antes), así que se replica aquí la detección de idioma y los textos.
  const NOTICE_I18N = {
    es: {
      lead: 'Configuración pendiente.',
      body: 'Esta copia de OpenWorksheets no se ejecuta en el sitio oficial, así que la generación de enlaces cortos está desactivada para no usar la cuenta de Google de otra persona. Despliega tu propio Google Apps Script y pon tu URL en <code>config.js</code>.',
      link: 'Ver instrucciones (gas/README.md)',
      close: 'Cerrar aviso'
    },
    ca: {
      lead: 'Configuració pendent.',
      body: "Aquesta còpia d'OpenWorksheets no s'executa al lloc oficial, així que la generació d'enllaços curts està desactivada per no fer servir el compte de Google d'una altra persona. Desplega el teu propi Google Apps Script i posa la teva URL a <code>config.js</code>.",
      link: 'Veure instruccions (gas/README.md)',
      close: 'Tancar avís'
    },
    gl: {
      lead: 'Configuración pendente.',
      body: 'Esta copia de OpenWorksheets non se executa no sitio oficial, así que a xeración de ligazóns curtas está desactivada para non usar a conta de Google doutra persoa. Desprega o teu propio Google Apps Script e pon o teu URL en <code>config.js</code>.',
      link: 'Ver instrucións (gas/README.md)',
      close: 'Pechar aviso'
    },
    eu: {
      lead: 'Konfigurazioa egiteke.',
      body: 'OpenWorksheets-en kopia hau ez da gune ofizialean exekutatzen, beraz, esteka laburren sorrera desgaituta dago beste norbaiten Google kontua ez erabiltzeko. Zabaldu zure Google Apps Script propioa eta jarri zure URLa <code>config.js</code> fitxategian.',
      link: 'Ikusi argibideak (gas/README.md)',
      close: 'Itxi oharra'
    },
    en: {
      lead: 'Configuration needed.',
      body: "This copy of OpenWorksheets is not running on the official site, so short-link generation is disabled to avoid using someone else's Google account. Deploy your own Google Apps Script and put your URL in <code>config.js</code>.",
      link: 'See instructions (gas/README.md)',
      close: 'Close notice'
    }
  };

  function noticeLang() {
    const avail = Object.keys(NOTICE_I18N);
    let stored;
    try { stored = localStorage.getItem('wpf-lang'); } catch (_) { /* ignore */ }
    if (stored && avail.includes(stored)) return stored;
    const browser = ((navigator.language || 'es').slice(0, 2)).toLowerCase();
    return avail.includes(browser) ? browser : 'es';
  }

  function showNotice() {
    if (document.getElementById('ows-foreign-notice')) return;
    const tr = NOTICE_I18N[noticeLang()];

    const bar = document.createElement('div');
    bar.id = 'ows-foreign-notice';
    bar.setAttribute('role', 'alert');
    bar.style.cssText = [
      'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:99999',
      'background:#7f1d1d', 'color:#fff', 'padding:12px 16px',
      'font:14px/1.5 system-ui,sans-serif', 'box-shadow:0 -2px 8px rgba(0,0,0,.3)',
      'display:flex', 'gap:12px', 'align-items:flex-start',
      'justify-content:space-between', 'flex-wrap:wrap'
    ].join(';');

    const text = document.createElement('div');
    text.style.flex = '1 1 320px';
    text.innerHTML =
      '<strong>' + tr.lead + '</strong> ' + tr.body + ' ' +
      '<a href="' + DOCS_URL + '" target="_blank" rel="noopener" ' +
      'style="color:#fde68a;text-decoration:underline;">' + tr.link + '</a>.';

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', tr.close);
    close.style.cssText =
      'background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer;line-height:1;padding:0 4px;';
    close.addEventListener('click', () => bar.remove());

    bar.appendChild(text);
    bar.appendChild(close);
    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showNotice);
  } else {
    showNotice();
  }
})();
