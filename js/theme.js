/* Gestión de tema: auto | dark | light — ciclo monitor → luna → sol → monitor */
(function () {
  var S = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon"';
  var iconos = {
    auto:  '<svg ' + S + '><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    dark:  '<svg ' + S + '><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
    light: '<svg ' + S + '><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>'
  };
  var titulos = { auto: 'Tema: automático (sigue al sistema)', dark: 'Tema: oscuro', light: 'Tema: claro' };

  function aplicar(tema) {
    if (tema === 'dark')  document.documentElement.setAttribute('data-theme', 'dark');
    else if (tema === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');

    if (tema === 'auto') localStorage.removeItem('wpf-tema');
    else localStorage.setItem('wpf-tema', tema);

    var btn = document.getElementById('btnTema');
    if (btn) { btn.innerHTML = iconos[tema]; btn.title = titulos[tema]; }
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
    btn.innerHTML = iconos[actual()];
    btn.title = titulos[actual()];
    btn.addEventListener('click', function () { aplicar(siguiente(actual())); });
  });
})();
