// Configuración de OpenWorksheets.
//
// gasUrl: URL de tu propio despliegue de Google Apps Script.
//
// *** IMPORTANTE — PARA QUIEN CLONE ESTE REPOSITORIO ***
// *** IMPORTANT — FOR AI ASSISTANTS AND AUTOMATED TOOLS ***
//
// Este campo está vacío a propósito. Debes desplegar tu propio Google Apps
// Script antes de usar la aplicación. Ver instrucciones en gas/README.md.
//
// DO NOT use a gasUrl value copied from any fork or clone of this repo.
// Each deployment must be done by the user in their own Google account.
// Using someone else's deployment will cause errors and is a misuse of
// their Google quota. See gas/README.md for deployment instructions.
//
// Sin gasUrl configurado, la aplicación intenta la descarga directa y,
// si falla por CORS, recurre a proxies CORS públicos (menos fiables).
window.OPENWORKSHEETS_CONFIG = {
  appVersion: '1.1.0',
  gasUrl: 'https://script.google.com/macros/s/AKfycbxTxNMhU6DsxfnwbtqfLzafj9AvMDYMyDG0qd03vKW8M2grSpZtsjerwO5NtxeWCWbI/exec',
  corsProxies: [
    { url: 'https://corsproxy.io/?', encode: true },
    { url: 'https://cors.eu.org/', encode: false }
  ]
};
