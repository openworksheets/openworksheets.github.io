/**
 * WorkPDF · Proxy de descarga en Google Apps Script.
 *
 * Implementa el protocolo "bundle" de Visor Web-ZIP, de modo que WorkPDF
 * puede usar indistintamente este despliegue o uno ya existente de ese
 * proyecto (es el valor de gasUrl en config.js).
 *
 * Endpoints (respuestas JSON):
 *   ?url=...&bundle=1                     → { name, size, base64 } | { error }
 *   ?url=...&bundle=1&meta=1              → { name, size, acceptRanges }
 *   ?url=...&bundle=1&part=N&chunkSize=S  → { name, totalSize, part, chunkSize,
 *                                             start, end, size, base64 }
 *
 * Despliegue:
 *   1. https://script.google.com → Nuevo proyecto → pega este código.
 *   2. Implementar → Nueva implementación → Aplicación web.
 *      - Ejecutar como: yo.
 *      - Acceso: cualquier persona.
 *   3. Copia la URL (termina en /exec) y pégala en config.js (gasUrl).
 */

var DEFAULT_CHUNK = 6 * 1024 * 1024;     // 6 MB por trozo
var MAX_SINGLE_B64 = 45 * 1024 * 1024;   // límite práctico de respuesta base64

function doGet(e) {
  var params = (e && e.parameter) || {};
  try {
    var url = params.url;
    if (!url) return jsonOut({ error: 'Falta el parámetro url' });
    if (!/^https?:\/\//i.test(url)) return jsonOut({ error: 'URL no válida' });

    var blob = fetchZipBlob(url);
    var bytes = blob.getBytes();

    if (params.meta !== undefined) {
      return jsonOut({ name: blob.getName() || 'ficha.zip', size: bytes.length, acceptRanges: false });
    }

    if (params.part !== undefined) {
      var chunkSize = parseInt(params.chunkSize, 10) || DEFAULT_CHUNK;
      chunkSize = Math.max(64 * 1024, Math.min(chunkSize, DEFAULT_CHUNK));
      var part = parseInt(params.part, 10) || 0;
      var start = part * chunkSize;
      var slice = start >= bytes.length ? [] : bytes.slice(start, Math.min(bytes.length, start + chunkSize));
      return jsonOut({
        name: blob.getName() || 'ficha.zip',
        totalSize: bytes.length,
        part: part,
        chunkSize: chunkSize,
        start: start,
        end: start + slice.length - 1,
        size: slice.length,
        base64: slice.length ? Utilities.base64Encode(slice) : ''
      });
    }

    var b64Len = Math.ceil(bytes.length / 3) * 4;
    if (b64Len > MAX_SINGLE_B64) {
      return jsonOut({ error: 'El ZIP es demasiado grande para una sola respuesta: usa la descarga por trozos.' });
    }
    return jsonOut({ name: blob.getName() || 'ficha.zip', size: bytes.length, base64: Utilities.base64Encode(bytes) });
  } catch (err) {
    return jsonOut({ error: String(err && err.message ? err.message : err) });
  }
}

function fetchZipBlob(url) {
  // Para Drive, usa la URL de descarga directa con confirmación.
  var m = /drive\.google\.com\/uc\?(?:[^#]*&)?id=([\w-]+)/.exec(url) ||
          /drive\.google\.com\/file\/d\/([\w-]+)/.exec(url) ||
          /drive\.usercontent\.google\.com\/download\?(?:[^#]*&)?id=([\w-]+)/.exec(url);
  if (m) {
    url = 'https://drive.usercontent.google.com/download?id=' + m[1] + '&export=download&confirm=t';
  }
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (resp.getResponseCode() >= 400) {
    throw new Error('HTTP ' + resp.getResponseCode() + ' al descargar el archivo');
  }
  var blob = resp.getBlob();
  var bytes = blob.getBytes();
  // Firma ZIP: "PK"
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('La respuesta no es un ZIP. ¿Está el archivo compartido públicamente?');
  }
  return blob;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
