/* Gestión de tema: auto | dark | light — ciclo ⊙ → 🌙 → ☀ → ⊙ */
(function () {
  var iconos  = { auto: '⊙', dark: '🌙', light: '☀' };
  var titulos = { auto: 'Tema: automático (sigue al sistema)', dark: 'Tema: oscuro', light: 'Tema: claro' };

  function aplicar(tema) {
    if (tema === 'dark')  document.documentElement.setAttribute('data-theme', 'dark');
    else if (tema === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');

    if (tema === 'auto') localStorage.removeItem('wpf-tema');
    else localStorage.setItem('wpf-tema', tema);

    var btn = document.getElementById('btnTema');
    if (btn) { btn.textContent = iconos[tema]; btn.title = titulos[tema]; }
  }

  function actual() {
    return document.documentElement.getAttribute('data-theme') || 'auto';
  }

  function siguiente(t) {
    return t === 'auto' ? 'dark' : t === 'dark' ? 'light' : 'auto';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('btnTema');
    if (!btn) return;
    btn.textContent = iconos[actual()];
    btn.title = titulos[actual()];
    btn.addEventListener('click', function () { aplicar(siguiente(actual())); });
  });
})();
