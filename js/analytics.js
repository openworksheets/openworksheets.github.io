// Contador de visitas con el sistema propio de estadísticas en IONOS.
// Lee los metadatos analytics-* del HTML y registra la visita en segundo
// plano (JSONP con timeout). Una visita por navegador cada 30 minutos.
// Sin IP, sin cookies de analítica.
//
// Las cifras no se muestran nunca en la interfaz: se consultan solo desde
// el panel privado. La respuesta del servidor se descarta.
(function () {
  'use strict';

  var COOLDOWN_MS = 30 * 60 * 1000;

  function meta(name) {
    var node = document.querySelector('meta[name="' + name + '"]');
    return node ? String(node.getAttribute('content') || '').trim() : '';
  }

  var cfg = {
    endpoint: meta('analytics-endpoint'),
    statsUrl: meta('analytics-stats-url'),
    siteId: meta('analytics-site-id')
  };
  if (!cfg.endpoint || !cfg.siteId) return;

  function shouldTrack() {
    var protocol = String(window.location.protocol || '');
    var host = String(window.location.hostname || '').toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
    if (/\.local$/.test(host)) return false;
    return true;
  }

  var storageKey = 'analytics:last-visit:' + cfg.siteId;

  function shouldCountVisit() {
    try {
      var last = parseInt(window.localStorage.getItem(storageKey) || '', 10);
      if (!isNaN(last) && Date.now() - last < COOLDOWN_MS) return false;
    } catch (err) { /* sin localStorage: contar */ }
    return true;
  }

  function rememberVisit() {
    try { window.localStorage.setItem(storageKey, String(Date.now())); } catch (err) {}
  }

  function load() {
    var callbackName = '__wpfAnalyticsCb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    var script = document.createElement('script');
    var settled = false;
    var timeoutId = 0;
    var countVisit = shouldCountVisit();

    function cleanup() {
      if (settled) return;
      settled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      try { delete window[callbackName]; } catch (err) { window[callbackName] = null; }
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    var query = new URLSearchParams();
    query.set('site', cfg.siteId);
    query.set('callback', callbackName);
    query.set('page_url', window.location.href);
    query.set('referrer', document.referrer || '');
    if (!countVisit) query.set('summary_only', '1');

    window[callbackName] = function (payload) {
      try {
        if (countVisit && payload && payload.ok) rememberVisit();
      } finally {
        cleanup();
      }
    };

    script.async = true;
    script.src = cfg.endpoint + (cfg.endpoint.indexOf('?') === -1 ? '?' : '&') + query.toString();
    script.onerror = cleanup;
    timeoutId = window.setTimeout(cleanup, 4000);
    document.head.appendChild(script);
  }

  if (!shouldTrack()) return;
  var run = function () { window.setTimeout(load, 0); };
  // Un <script async> inyectado antes de que se dispare «load» retrasa ese
  // evento hasta que la peticion termina. Si el servidor de estadisticas se
  // cuelga, «load» no llegaria a dispararse nunca. Por eso se espera siempre
  // a «load» antes de programar nada.
  var programar = function () {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 2500 });
    } else {
      window.setTimeout(run, 0);
    }
  };
  if (document.readyState === 'complete') {
    programar();
  } else {
    window.addEventListener('load', programar, { once: true });
  }
})();
