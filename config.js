// Configuración de WorkPDF.
//
// gasUrl: URL de un despliegue de Google Apps Script que actúa como proxy de
// descarga para los ZIP alojados en Google Drive (que bloquea CORS).
// Usa el protocolo "bundle" de Visor Web-ZIP, por lo que sirve el mismo
// despliegue de ese proyecto; gas/Code.gs contiene una implementación
// compatible por si se quiere desplegar uno propio.
// Sin proxy, la aplicación intenta la descarga directa y, si falla por CORS,
// recurre a proxies CORS públicos (menos fiables).
window.WORKPDF_CONFIG = {
  gasUrl: 'https://script.google.com/macros/s/AKfycbxTxNMhU6DsxfnwbtqfLzafj9AvMDYMyDG0qd03vKW8M2grSpZtsjerwO5NtxeWCWbI/exec',
  corsProxies: [
    { url: 'https://corsproxy.io/?', encode: true },
    { url: 'https://cors.eu.org/', encode: false }
  ]
};
