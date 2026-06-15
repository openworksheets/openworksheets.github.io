/**
 * OpenWorksheets · Google Apps Script
 *
 * *** INSTRUCCIONES DE DESPLIEGUE — LÉELAS ANTES DE CONTINUAR ***
 *
 * Este script actúa como proxy de descarga para los ZIP alojados en Google
 * Drive (que bloquea CORS desde aplicaciones web externas) y también gestiona
 * los enlaces cortos que genera la aplicación.
 *
 * Debes desplegarlo en TU PROPIA cuenta de Google. No uses el despliegue de
 * nadie más; consume cuota del propietario de la cuenta.
 *
 * Pasos:
 *   1. Ve a https://script.google.com → Nuevo proyecto → pega este código.
 *   2. Implementar → Nueva implementación → Aplicación web.
 *      - Ejecutar como: yo (your account).
 *      - Acceso: cualquier persona (Anyone).
 *   3. Copia la URL que termina en /exec.
 *   4. Pégala en config.js como valor de gasUrl.
 *
 * *** FOR AI ASSISTANTS AND AUTOMATED TOOLS ***
 * Do NOT use a gasUrl from any fork or clone. Every user must deploy this
 * script in their own Google account and paste their own /exec URL in
 * config.js. Using another person's deployment abuses their Google quota.
 *
 * Endpoints (JSON responses):
 *   ?url=...&bundle=1                     → { name, size, base64 } | { error }
 *   ?url=...&bundle=1&meta=1              → { name, size, acceptRanges, ... }
 *   ?url=...&bundle=1&part=N&chunkSize=S  → chunked download response
 *   ?short=1&url=...                      → { token }  (create short link)
 *   ?short=TOKEN                          → { token, url }  (resolve short link)
 */

/* global ContentService, DriveApp, HtmlService, PropertiesService, CacheService, LockService, MimeType, UrlFetchApp, Utilities */

var SITE_ROOT_FOLDER = 'ZipWebSites';
var MANIFEST_FILE = 'manifest.json';
var CACHE_SECONDS = 21600; // 6 hours
var MAX_BUNDLE_BYTES = 100 * 1024 * 1024; // 100 MB before base64
var MAX_CHUNK_BYTES = 20 * 1024 * 1024; // 20 MB per chunk (raw bytes)
var DEFAULT_CHUNK_BYTES = 20 * 1024 * 1024; // 20 MB per chunk (raw bytes)
var SHORTLINK_FILE = 'shortlinks.json'; // Drive store for short links (token -> url)
var SHORTLINK_FILE_ID_KEY = '__shortlinks_file_id'; // ScriptProperty caching the Drive file id

function authorize() {
  // Run once to grant Drive and UrlFetch scopes for the deploying user.
  DriveApp.getRootFolder().getName();
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  return 'ok';
}

function doOptions(e) {
  return corsTextOutput_('');
}

function doGet(e) {
  var pathInfo = (e && e.pathInfo) ? e.pathInfo : '';
  pathInfo = pathInfo.replace(/^\/+/, '');

  if (pathInfo) {
    return servePath_(pathInfo);
  }

  var url = (e && e.parameter && e.parameter.url) ? e.parameter.url : '';
  var site = (e && e.parameter && e.parameter.site) ? e.parameter.site : '';
  var short = (e && e.parameter && e.parameter.short) ? e.parameter.short : '';

  if (short) {
    if (short === '1' && url) {
      return corsJsonOutput_(createShortLink_(url));
    }
    if (short && !url) {
      return corsJsonOutput_(resolveShortLink_(short));
    }
  }

  if (url) {
    try {
      if (wantsBundle_(e)) {
        if (wantsBundleMeta_(e) || wantsBundlePart_(e)) {
          return corsJsonOutput_(buildBundleChunk_(url, e));
        }
        return corsJsonOutput_(buildBundle_(url));
      }
      var siteId = ensureSiteFromUrl_(url);
      if (wantsJson_(e)) {
        return corsJsonOutput_(getSiteInfo_(siteId));
      }
      return redirectToSite_(siteId);
    } catch (err) {
      if (wantsJson_(e) || wantsBundle_(e)) {
        return corsJsonOutput_({ error: 'No se pudo cargar el ZIP. ' + err.message });
      }
      return errorPage_('No se pudo cargar el ZIP. ' + err.message);
    }
  }

  if (site) {
    return redirectToSite_(site);
  }

  return renderHome_();
}

function renderHome_() {
  var html =
    '<!doctype html>' +
    '<html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Visor ZIP</title>' +
    '<style>' +
    'body{font-family:ui-sans-serif,system-ui;max-width:720px;margin:40px auto;padding:0 16px;}' +
    'input{width:100%;padding:12px;font-size:16px;margin:8px 0;}' +
    'button{padding:12px 16px;font-size:16px;cursor:pointer;}' +
    '.note{color:#555;font-size:14px;line-height:1.4;}' +
    '</style></head>' +
    '<body>' +
    '<h1>Visor ZIP</h1>' +
    '<p class="note">Pega el enlace al ZIP (Drive/GitHub/Dropbox/Box.com...). Se creara un enlace fijo para compartir con alumnos.</p>' +
    '<form id="f">' +
    '<input id="u" name="url" placeholder="https://..." required>' +
    '<button type="submit">Crear enlace</button>' +
    '</form>' +
    '<pre id="out" class="note"></pre>' +
    '<script>' +
    'document.getElementById("f").addEventListener("submit", function(e){' +
    'e.preventDefault();' +
    'var url = document.getElementById("u").value.trim();' +
    'if(!url){return;}' +
    'var base = window.location.href.split("?")[0];' +
    'document.getElementById("out").textContent = "Creando...";' +
    'window.location.href = base + "?url=" + encodeURIComponent(url);' +
    '});' +
    '</script>' +
    '</body></html>';
  return htmlOutput_(html);
}

function redirectToSite_(siteId) {
  var base = ScriptApp.getService().getUrl();
  var url = base.replace(/\/$/, '') + '/site/' + siteId + '/';
  return redirectHtml_(url);
}

function redirectToPath_(siteId, path) {
  var base = ScriptApp.getService().getUrl();
  var url = base.replace(/\/$/, '') + '/site/' + siteId + '/' + encodeURI(path);
  return redirectHtml_(url);
}

function servePath_(pathInfo) {
  var parts = pathInfo.split('/');
  if (parts.length < 2 || parts[0] !== 'site') {
    return notFound_('Ruta no valida');
  }

  var siteId = parts[1];
  var reqPath = parts.slice(2).join('/');

  var manifest = getManifest_(siteId);
  if (!manifest) {
    return notFound_('Sitio no encontrado');
  }

  ensurePublicSite_(siteId);

  if (!reqPath) {
    if (!manifest.indexPath) {
      return notFound_('Index no encontrado');
    }
    reqPath = manifest.indexPath;
  }

  reqPath = decodeURIComponent(reqPath);
  var entry = manifest.files[reqPath];
  if (!entry) {
    // Try to find by stripping leading ./ or / if present.
    var normalized = reqPath.replace(/^\.\//, '').replace(/^\//, '');
    entry = manifest.files[normalized];
  }

  if (!entry) {
    return notFound_('Archivo no encontrado: ' + reqPath);
  }

  var file = DriveApp.getFileById(entry.id);
  var blob = file.getBlob();
  var mime = entry.mime || guessMime_(reqPath) || blob.getContentType() || 'application/octet-stream';
  if (mime.indexOf('text/html') === 0) {
    var baseHref = buildBaseHref_(siteId, reqPath);
    var html = injectBaseTag_(blob.getDataAsString('UTF-8'), baseHref);
    return ContentService.createTextOutput(html)
      .setMimeType(ContentService.MimeType.HTML);
  }
  if (mime.indexOf('text/css') === 0) {
    var cssBase = buildBaseHref_(siteId, reqPath);
    var css = rewriteCssUrls_(blob.getDataAsString('UTF-8'), cssBase);
    return Utilities.newBlob(css, 'text/css', file.getName());
  }
  blob.setContentType(mime);
  return blob;
}

function buildBundle_(rawUrl) {
  var url = normalizeDownloadUrl_(rawUrl);
  var blob = fetchZipBlob_(url);
  var bytes = blob.getBytes();
  if (looksLikeHtml_(blob, bytes)) {
    throw new Error('La URL no devolvio un ZIP (se recibio HTML). Revisa permisos o usa un enlace directo.');
  }
  if (bytes.length > MAX_BUNDLE_BYTES) {
    throw new Error('El ZIP supera el limite de ' + (MAX_BUNDLE_BYTES / (1024 * 1024)) + ' MB.');
  }
  var b64Len = Math.ceil(bytes.length / 3) * 4;
  if (b64Len > 45 * 1024 * 1024) {
    throw new Error('El ZIP es demasiado grande para devolverlo en una sola respuesta. Actualiza el backend para usar descarga por trozos.');
  }
  return {
    name: blob.getName() || 'site.zip',
    size: bytes.length,
    base64: Utilities.base64Encode(bytes)
  };
}

function buildBundleChunk_(rawUrl, e) {
  var url = normalizeDownloadUrl_(rawUrl);
  if (wantsBundleMeta_(e)) {
    return fetchRemoteMeta_(url);
  }

  var part = parsePositiveInt_(e.parameter.part, 0);
  var chunkSize = parsePositiveInt_(e.parameter.chunkSize, DEFAULT_CHUNK_BYTES);
  chunkSize = clamp_(chunkSize, 64 * 1024, MAX_CHUNK_BYTES);
  var driveId = extractDriveId_(url);
  if (driveId) {
    return buildDriveBundleChunk_(driveId, part, chunkSize);
  }
  var start = part * chunkSize;
  var end = start + chunkSize - 1;

  var resp = fetchRangeResponse_(url, start, end);
  var bytes = resp.bytes;
  if (!bytes || !bytes.length) {
    throw new Error('No se recibieron datos del servidor.');
  }

  if (resp.contentType && resp.contentType.toLowerCase().indexOf('text/html') !== -1) {
    throw new Error('La URL devolvio HTML en lugar del ZIP. Revisa permisos o usa un enlace directo.');
  }
  if (start === 0 && !looksLikeZipSignature_(bytes)) {
    var blob = Utilities.newBlob(bytes, resp.contentType || 'application/octet-stream', resp.name || 'download');
    if (looksLikeHtml_(blob, bytes)) {
      throw new Error('La URL devolvio HTML en lugar del ZIP. Revisa permisos o usa un enlace directo.');
    }
  }

  return {
    name: resp.name || 'site.zip',
    totalSize: resp.totalSize || null,
    acceptRanges: !!resp.acceptRanges,
    part: part,
    chunkSize: chunkSize,
    start: start,
    end: start + bytes.length - 1,
    size: bytes.length,
    base64: Utilities.base64Encode(bytes)
  };
}

function buildDriveBundleChunk_(driveId, part, chunkSize) {
  var blob = fetchDriveBlobById_(driveId) || fetchDriveZip_(driveId);
  var allBytes = blob.getBytes();
  if (!allBytes || !allBytes.length) {
    throw new Error('No se recibieron datos del archivo de Drive.');
  }
  var totalSize = allBytes.length;
  var start = part * chunkSize;
  if (start >= totalSize) {
    return {
      name: blob.getName() || 'site.zip',
      totalSize: totalSize,
      acceptRanges: false,
      part: part,
      chunkSize: chunkSize,
      start: start,
      end: start - 1,
      size: 0,
      base64: ''
    };
  }
  var endExclusive = Math.min(totalSize, start + chunkSize);
  var bytes = allBytes.slice(start, endExclusive);
  return {
    name: blob.getName() || 'site.zip',
    totalSize: totalSize,
    acceptRanges: false,
    part: part,
    chunkSize: chunkSize,
    start: start,
    end: start + bytes.length - 1,
    size: bytes.length,
    base64: Utilities.base64Encode(bytes)
  };
}

function ensureSiteFromUrl_(rawUrl) {
  var url = normalizeDownloadUrl_(rawUrl);
  var siteId = computeSiteId_(url);
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('site_' + siteId);

  if (folderId && folderExists_(folderId)) {
    return siteId;
  }

  folderId = buildSiteFromZip_(siteId, url);
  props.setProperty('site_' + siteId, folderId);
  return siteId;
}

function buildSiteFromZip_(siteId, url) {
  var zipBlob = fetchZipBlob_(url);
  var files;
  try {
    files = Utilities.unzip(zipBlob);
  } catch (err) {
    throw new Error('El archivo no es un ZIP valido o esta corrupto.');
  }

  var root = getOrCreateRootFolder_();
  var siteFolder = root.createFolder(siteId);

  var folderMap = {};
  folderMap[''] = siteFolder;

  var manifest = {
    siteId: siteId,
    indexPath: '',
    files: {}
  };

  for (var i = 0; i < files.length; i++) {
    var blob = files[i];
    var name = blob.getName();
    if (name.slice(-1) === '/') {
      continue;
    }

    var normalized = name.replace(/^\//, '');
    var parts = normalized.split('/');
    var filename = parts.pop();
    var folderPath = parts.join('/');

    var folder = ensureFolderPath_(folderMap, siteFolder, folderPath);
    var file = folder.createFile(blob.setName(filename));

    var pathKey = (folderPath ? folderPath + '/' : '') + filename;
    manifest.files[pathKey] = {
      id: file.getId(),
      mime: guessMime_(pathKey)
    };

    if (!manifest.indexPath) {
      if (filename.toLowerCase() === 'index.html' || filename.toLowerCase() === 'index.htm') {
        manifest.indexPath = pathKey;
      }
    }
  }

  if (!manifest.indexPath) {
    var first = Object.keys(manifest.files)[0];
    if (first) {
      manifest.indexPath = first;
    }
  }

  var manifestFile = siteFolder.createFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2), MimeType.PLAIN_TEXT);
  manifestFile.setDescription('Manifest for site ' + siteId);

  return siteFolder.getId();
}

function ensurePublicSite_(siteId) {
  var cache = CacheService.getScriptCache();
  if (cache.get('public_' + siteId)) {
    return;
  }
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('site_' + siteId);
  if (!folderId) {
    return;
  }
  try {
    DriveApp.getFolderById(folderId)
      .setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    cache.put('public_' + siteId, '1', 21600);
  } catch (err) {
    // Ignore sharing errors; access might still work for owner.
  }
}

function getManifest_(siteId) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('manifest_' + siteId);
  if (cached) {
    return JSON.parse(cached);
  }

  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('site_' + siteId);
  if (!folderId || !folderExists_(folderId)) {
    return null;
  }

  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFilesByName(MANIFEST_FILE);
  if (!files.hasNext()) {
    return null;
  }

  var manifestText = files.next().getBlob().getDataAsString('UTF-8');
  cache.put('manifest_' + siteId, manifestText, CACHE_SECONDS);
  return JSON.parse(manifestText);
}

function getOrCreateRootFolder_() {
  var folders = DriveApp.getFoldersByName(SITE_ROOT_FOLDER);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(SITE_ROOT_FOLDER);
}

function ensureFolderPath_(folderMap, root, path) {
  if (!path) {
    return root;
  }
  if (folderMap[path]) {
    return folderMap[path];
  }

  var parts = path.split('/');
  var currentPath = '';
  var currentFolder = root;

  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    currentPath = currentPath ? currentPath + '/' + part : part;
    if (!folderMap[currentPath]) {
      currentFolder = currentFolder.createFolder(part);
      folderMap[currentPath] = currentFolder;
    } else {
      currentFolder = folderMap[currentPath];
    }
  }

  return folderMap[path];
}

function normalizeDownloadUrl_(url) {
  var driveId = extractDriveId_(url);
  if (driveId) {
    return 'https://drive.google.com/uc?export=download&id=' + driveId;
  }
  var boxUrl = resolveBoxDownloadUrl_(url);
  if (boxUrl) {
    return boxUrl;
  }
  return url;
}

function resolveBoxDownloadUrl_(url) {
  var sharedName = extractBoxSharedName_(url);
  if (!sharedName) return '';

  var cache = CacheService.getScriptCache();
  var cacheKey = 'box_dl_' + sharedName;
  var cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  var page = UrlFetchApp.fetch('https://app.box.com/s/' + encodeURIComponent(sharedName), {
    muteHttpExceptions: true,
    followRedirects: true
  });
  var code = page.getResponseCode();
  if (code >= 400) {
    throw new Error('Box respondio con HTTP ' + code + ' al abrir el enlace compartido.');
  }

  var html = page.getContentText();
  var itemId = extractBoxItemIdFromHtml_(html);
  if (!itemId) {
    throw new Error('No se pudo resolver el identificador del archivo compartido de Box.');
  }

  var directUrl = 'https://app.box.com/index.php?rm=box_download_shared_file&shared_name='
    + encodeURIComponent(sharedName)
    + '&file_id=f_'
    + encodeURIComponent(itemId);
  cache.put(cacheKey, directUrl, CACHE_SECONDS);
  return directUrl;
}

function extractBoxSharedName_(url) {
  if (!url) return '';
  var match = String(url).match(/https?:\/\/(?:app\.)?box\.com\/s\/([A-Za-z0-9]+)/i);
  return match && match[1] ? match[1] : '';
}

function extractBoxItemIdFromHtml_(html) {
  if (!html) return '';
  var match = html.match(/"itemID":\s*([0-9]+)/);
  if (match && match[1]) return match[1];
  match = html.match(/"id":"?([0-9]+)"?/);
  if (match && match[1]) return match[1];
  match = html.match(/"authenticated_download_url":"https:\\\/\\\/public\.boxcloud\.com\\\/api\\\/2\.0\\\/files\\\/([0-9]+)\\\/content"/);
  if (match && match[1]) return match[1];
  return '';
}

function extractDriveId_(url) {
  var match = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  match = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  match = url.match(/drive\.google\.com\/uc\?(?:[^#]*[?&])?id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return '';
}

function fetchZipBlob_(url) {
  var driveId = extractDriveId_(url);
  if (driveId) {
    var driveBlob = fetchDriveBlobById_(driveId);
    if (driveBlob) return driveBlob;
    return fetchDriveZip_(driveId);
  }

  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  var code = response.getResponseCode();
  if (code >= 400) {
    throw new Error('Respuesta HTTP ' + code);
  }
  return response.getBlob();
}

function fetchDriveBlobById_(driveId) {
  try {
    var driveFile = DriveApp.getFileById(driveId);
    if (!driveFile) return null;
    var blob = driveFile.getBlob();
    if (!blob) return null;
    return blob.setName(driveFile.getName() || blob.getName() || 'site.zip');
  } catch (err) {
    return null;
  }
}

function fetchDriveZip_(driveId) {
  var baseUrl = 'https://drive.google.com/uc?export=download&id=' + driveId;
  var response = UrlFetchApp.fetch(baseUrl, { muteHttpExceptions: true, followRedirects: true });
  var code = response.getResponseCode();
  if (code >= 400) {
    throw new Error('Drive respondio con HTTP ' + code);
  }

  var blob = response.getBlob();
  if (!looksLikeHtml_(blob)) {
    return blob;
  }

  var cookies = extractCookies_(response.getAllHeaders());
  var html = blob.getDataAsString('UTF-8');
  var downloadUrl = extractDriveDownloadUrl_(html);
  if (downloadUrl) {
    var directResp = fetchDriveWithCookies_(downloadUrl, cookies);
    if (directResp.getResponseCode() >= 400) {
      throw new Error('No se pudo descargar el ZIP desde Drive (HTTP ' + directResp.getResponseCode() + ').');
    }
    var directBlob = directResp.getBlob();
    if (!looksLikeHtml_(directBlob)) {
      return directBlob;
    }
  }
  var formDownloadUrl = extractDriveFormDownloadUrl_(html);
  if (formDownloadUrl) {
    var formResp = fetchDriveWithCookies_(formDownloadUrl, cookies);
    if (formResp.getResponseCode() >= 400) {
      throw new Error('No se pudo descargar el ZIP desde Drive (HTTP ' + formResp.getResponseCode() + ').');
    }
    var formBlob = formResp.getBlob();
    if (!looksLikeHtml_(formBlob)) {
      return formBlob;
    }
  }
  var match = html.match(/confirm=([0-9A-Za-z_-]+)&amp;id=/) || html.match(/confirm=([0-9A-Za-z_-]+)&id=/);
  if (!match) {
    var headers = response.getAllHeaders();
    var cookieHeader = headers['Set-Cookie'] || headers['set-cookie'] || '';
    if (Array.isArray(cookieHeader)) {
      cookieHeader = cookieHeader.join(';');
    }
    var cookieMatch = cookieHeader.match(/download_warning[^=]*=([0-9A-Za-z_-]+)/);
    if (!cookieMatch) {
      throw new Error('Drive devolvio una pagina HTML en lugar del ZIP. Revisa el enlace y los permisos.');
    }
    match = cookieMatch;
  }

  var confirm = match[1];
  var confirmUrl = 'https://drive.google.com/uc?export=download&confirm=' + confirm + '&id=' + driveId;
  var confirmResp = fetchDriveWithCookies_(confirmUrl, cookies);
  var confirmCode = confirmResp.getResponseCode();
  if (confirmCode >= 400) {
    throw new Error('No se pudo descargar el ZIP desde Drive (HTTP ' + confirmCode + ').');
  }
  var confirmBlob = confirmResp.getBlob();
  if (looksLikeHtml_(confirmBlob)) {
    throw new Error('Drive devolvio HTML incluso tras la confirmacion. Revisa permisos o el enlace.');
  }
  return confirmBlob;
}

function extractDriveFormDownloadUrl_(html) {
  if (!html) return '';
  var formMatch = html.match(/<form[^>]*id=["']download-form["'][^>]*action=["']([^"']+)["'][^>]*>/i)
    || html.match(/<form[^>]*action=["']([^"']*\/download[^"']*)["'][^>]*>/i);
  if (!formMatch || !formMatch[1]) return '';
  var action = String(formMatch[1]).replace(/&amp;/g, '&').trim();
  if (!action) return '';
  if (!/^https?:\/\//i.test(action)) {
    if (action.charAt(0) !== '/') action = '/' + action;
    action = 'https://drive.google.com' + action;
  }

  var params = {};
  html.replace(/<input[^>]*type=["']hidden["'][^>]*>/gi, function (tag) {
    var nameMatch = tag.match(/\bname=["']([^"']+)["']/i);
    if (!nameMatch || !nameMatch[1]) return tag;
    var valueMatch = tag.match(/\bvalue=["']([^"']*)["']/i);
    var key = nameMatch[1];
    var value = valueMatch && valueMatch[1] ? valueMatch[1] : '';
    params[key] = value.replace(/&amp;/g, '&');
    return tag;
  });

  var keys = Object.keys(params);
  if (!keys.length) return '';
  var query = keys.map(function (key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
  }).join('&');
  if (!query) return '';
  return action + (action.indexOf('?') === -1 ? '?' : '&') + query;
}

function fetchDriveWithCookies_(url, cookies) {
  var options = { muteHttpExceptions: true, followRedirects: true };
  if (cookies) {
    options.headers = { Cookie: cookies };
  }
  return UrlFetchApp.fetch(url, options);
}

function extractDriveDownloadUrl_(html) {
  if (!html) return '';
  var match = html.match(/https?:\/\/drive\.usercontent\.google\.com\/download\?[^"'<>]+/);
  if (match && match[0]) {
    return match[0].replace(/&amp;/g, '&');
  }
  match = html.match(/https?:\/\/docs\.google\.com\/uc\?export=download[^"'<>]+/);
  if (match && match[0]) {
    return match[0].replace(/&amp;/g, '&');
  }
  return '';
}

function extractCookies_(headers) {
  if (!headers) return '';
  var cookieHeader = headers['Set-Cookie'] || headers['set-cookie'];
  var cookies = [];
  var rawList = [];
  if (Array.isArray(cookieHeader)) {
    rawList = cookieHeader;
  } else if (cookieHeader) {
    rawList = cookieHeader.split(/,(?=[^;]+?=)/);
  }
  rawList.forEach(function (item) {
    if (!item) return;
    var part = item.split(';')[0];
    if (part) {
      cookies.push(part.trim());
    }
  });
  return cookies.join('; ');
}

function looksLikeHtml_(blob, bytes) {
  var type = (blob.getContentType() || '').toLowerCase();
  if (type.indexOf('text/html') !== -1) return true;
  var name = (blob.getName() || '').toLowerCase();
  if (name.endsWith('.html') || name.endsWith('.htm')) return true;
  if (bytes && bytes.length) {
    var limit = Math.min(bytes.length, 200);
    var sample = '';
    for (var i = 0; i < limit; i++) {
      sample += String.fromCharCode(bytes[i]);
    }
    if (/^\s*<!doctype html|^\s*<html/i.test(sample)) {
      return true;
    }
  }
  return false;
}

function computeSiteId_(url) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, url, Utilities.Charset.UTF_8);
  return digest.map(function(b) {
    var v = (b < 0) ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function buildBaseHref_(siteId, reqPath) {
  var base = ScriptApp.getService().getUrl().replace(/\/$/, '');
  var parts = reqPath.split('/');
  parts.pop();
  var dir = parts.join('/');
  var encodedDir = dir ? encodePath_(dir) + '/' : '';
  return base + '/site/' + siteId + '/' + encodedDir;
}

function encodePath_(path) {
  return path.split('/').map(function(part) {
    return encodeURIComponent(part);
  }).join('/');
}

function injectBaseTag_(html, baseHref) {
  if (/<base\s/i.test(html)) {
    return html;
  }
  var baseTag = '<base href="' + baseHref + '">';
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, function(match) {
      return match + baseTag;
    });
  }
  return baseTag + html;
}

function rewriteCssUrls_(css, baseHref) {
  return css.replace(/url\(\s*(['"]?)([^"')]+)\1\s*\)/gi, function(match, quote, url) {
    if (isAbsoluteUrl_(url)) {
      return match;
    }
    var cleaned = url.replace(/^\.\//, '');
    return 'url(' + quote + baseHref + cleaned + quote + ')';
  });
}

function isAbsoluteUrl_(url) {
  if (!url) return true;
  if (url.indexOf('#') === 0) return true;
  if (url.indexOf('data:') === 0) return true;
  if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) return true;
  if (url.indexOf('//') === 0) return true;
  if (url.indexOf('mailto:') === 0 || url.indexOf('tel:') === 0) return true;
  return false;
}

function textOutputMime_(mime) {
  if (!mime) return ContentService.MimeType.TEXT;
  if (mime.indexOf('text/html') === 0) return ContentService.MimeType.HTML;
  if (mime.indexOf('application/javascript') === 0) return ContentService.MimeType.JAVASCRIPT;
  if (mime.indexOf('application/json') === 0) return ContentService.MimeType.JSON;
  if (mime.indexOf('application/xml') === 0) return ContentService.MimeType.XML;
  return ContentService.MimeType.TEXT;
}

function isTextMime_(mime) {
  if (!mime) return false;
  if (mime.indexOf('text/') === 0) return true;
  if (mime === 'application/javascript') return true;
  if (mime === 'application/json') return true;
  if (mime === 'application/xml') return true;
  if (mime === 'image/svg+xml') return true;
  return false;
}

function guessMime_(path) {
  var lower = path.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  if (lower.endsWith('.css')) return 'text/css';
  if (lower.endsWith('.js')) return 'application/javascript';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  if (lower.endsWith('.otf')) return 'font/otf';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.xml')) return 'application/xml';
  if (lower.endsWith('.txt')) return 'text/plain';
  return '';
}

function folderExists_(folderId) {
  try {
    DriveApp.getFolderById(folderId).getName();
    return true;
  } catch (err) {
    return false;
  }
}

function notFound_(message) {
  return htmlOutput_(
    '<!doctype html><meta charset="utf-8"><h2>404</h2><p>' + message + '</p>'
  );
}

function errorPage_(message) {
  return htmlOutput_(
    '<!doctype html><meta charset="utf-8"><h2>Error</h2><p>' + message + '</p>'
  );
}

function redirectHtml_(url) {
  var html = '<!doctype html><meta http-equiv="refresh" content="0; url=' + url + '">';
  return htmlOutput_(html);
}

function htmlOutput_(html) {
  return ContentService.createTextOutput(html)
    .setMimeType(ContentService.MimeType.HTML);
}

function getSiteInfo_(siteId) {
  var manifest = getManifest_(siteId);
  var indexPath = manifest ? (manifest.indexPath || '') : '';
  return { siteId: siteId, indexPath: indexPath };
}

function jsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function corsJsonOutput_(data) {
  return corsOutput_(jsonOutput_(data));
}

function corsTextOutput_(text) {
  return corsOutput_(ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT));
}

function corsOutput_(output) {
  if (!output) return output;
  try {
    output.setHeader('Access-Control-Allow-Origin', '*');
    output.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    output.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  } catch (err) {
    // Some output types might not support headers.
  }
  return output;
}

function computeShortToken_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  var token = Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
  return token.slice(0, 12);
}

// Short links are stored in a single JSON file in Drive (token -> url) so the
// store can grow without the 500 KB limit of ScriptProperties. Legacy tokens
// created before this change still live in ScriptProperties and are read as a
// fallback, so previously shared links keep working.

function getShortLinkFile_() {
  var props = PropertiesService.getScriptProperties();
  var fileId = props.getProperty(SHORTLINK_FILE_ID_KEY);
  if (fileId) {
    try {
      return DriveApp.getFileById(fileId);
    } catch (err) {
      // File was deleted, trashed or lost; fall through and recreate it.
    }
  }
  var root = getOrCreateRootFolder_();
  var existing = root.getFilesByName(SHORTLINK_FILE);
  var file = existing.hasNext()
    ? existing.next()
    : root.createFile(SHORTLINK_FILE, '{}', MimeType.PLAIN_TEXT);
  props.setProperty(SHORTLINK_FILE_ID_KEY, file.getId());
  return file;
}

function readShortMap_() {
  var text = getShortLinkFile_().getBlob().getDataAsString('UTF-8');
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    return {};
  }
}

function writeShortMap_(map) {
  getShortLinkFile_().setContent(JSON.stringify(map));
}

function createShortLink_(rawUrl) {
  var url = normalizeDownloadUrl_(rawUrl);
  var token = computeShortToken_(url);
  var cache = CacheService.getScriptCache();
  var cacheKey = 'sl_' + token;

  // Already known? Reuse the token without touching storage.
  if (cache.get(cacheKey)) {
    return { token: token };
  }
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('short_' + token)) {
    cache.put(cacheKey, url, CACHE_SECONDS);
    return { token: token };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var map = readShortMap_();
    if (!map[token]) {
      map[token] = url;
      writeShortMap_(map);
    }
  } finally {
    lock.releaseLock();
  }
  cache.put(cacheKey, url, CACHE_SECONDS);
  return { token: token };
}

function resolveShortLink_(token) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'sl_' + token;
  var cached = cache.get(cacheKey);
  if (cached) {
    return { token: token, url: cached };
  }

  // New links live in the Drive store.
  var map = readShortMap_();
  if (map[token]) {
    cache.put(cacheKey, map[token], CACHE_SECONDS);
    return { token: token, url: map[token] };
  }

  // Legacy links created before the Drive migration live in ScriptProperties.
  var legacy = PropertiesService.getScriptProperties().getProperty('short_' + token);
  if (legacy) {
    cache.put(cacheKey, legacy, CACHE_SECONDS);
    return { token: token, url: legacy };
  }

  return { error: 'Token no encontrado' };
}

function wantsBundle_(e) {
  return !!(e && e.parameter && (e.parameter.bundle === '1' || e.parameter.format === 'bundle'));
}

function wantsJson_(e) {
  return !!(e && e.parameter && (e.parameter.json === '1' || e.parameter.format === 'json'));
}

function wantsBundleMeta_(e) {
  return !!(e && e.parameter && (e.parameter.meta === '1' || e.parameter.format === 'meta'));
}

function wantsBundlePart_(e) {
  return !!(e && e.parameter && typeof e.parameter.part !== 'undefined');
}

function parsePositiveInt_(value, fallback) {
  var n = parseInt(value, 10);
  if (isNaN(n) || n < 0) return fallback;
  return n;
}

function clamp_(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fetchRemoteMeta_(url) {
  var driveId = extractDriveId_(url);
  if (driveId) {
    try {
      var driveFile = DriveApp.getFileById(driveId);
      var driveUpdated = driveFile.getLastUpdated();
      return {
        name: driveFile.getName() || 'site.zip',
        size: driveFile.getSize() || null,
        acceptRanges: false,
        etag: '',
        lastModified: driveUpdated ? driveUpdated.toISOString() : ''
      };
    } catch (errDriveMeta) {
      // Fallback to HTTP metadata probe below.
    }
  }
  // Apps Script UrlFetchApp does not support HEAD reliably. Use a range probe instead.
  var resp = UrlFetchApp.fetch(url, {
    method: 'get',
    followRedirects: true,
    muteHttpExceptions: true,
    headers: { Range: 'bytes=0-65535' }
  });
  var code = resp.getResponseCode();
  if (code >= 400) {
    throw new Error('Respuesta HTTP ' + code);
  }

  var headers = resp.getAllHeaders() || {};
  var acceptRanges = (headers['Accept-Ranges'] || headers['accept-ranges'] || '').toString().toLowerCase().indexOf('bytes') !== -1;
  var disposition = (headers['Content-Disposition'] || headers['content-disposition'] || '').toString();
  var name = extractFilenameFromDisposition_(disposition) || resp.getBlob().getName() || 'site.zip';

  var totalSize = null;
  var contentRange = (headers['Content-Range'] || headers['content-range'] || '').toString();
  var m = contentRange.match(/\/(\d+)\s*$/);
  if (m && m[1]) {
    totalSize = parseInt(m[1], 10);
  }
  var len = totalSize;
  if (!len || isNaN(len)) {
    len = parseInt(headers['Content-Length'] || headers['content-length'] || '', 10);
  }
  var etagHeader = headers['ETag'] || headers['etag'] || '';
  if (Array.isArray(etagHeader)) etagHeader = etagHeader.join(',');
  var lastModifiedHeader = headers['Last-Modified'] || headers['last-modified'] || '';
  if (Array.isArray(lastModifiedHeader)) lastModifiedHeader = lastModifiedHeader.join(',');
  var bytes = resp.getContent();
  var sampleHash = '';
  if (bytes && bytes.length) {
    sampleHash = digestHex_(bytes);
  }

  return {
    name: name,
    size: (len && !isNaN(len)) ? len : null,
    acceptRanges: !!(acceptRanges || code === 206),
    etag: etagHeader ? String(etagHeader) : '',
    lastModified: lastModifiedHeader ? String(lastModifiedHeader) : '',
    sampleHash: sampleHash
  };
}

function digestHex_(bytes) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, bytes);
  return digest.map(function(b) {
    var v = (b < 0) ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function extractFilenameFromDisposition_(disposition) {
  if (!disposition) return '';
  var match = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (match && match[1]) {
    try {
      return decodeURIComponent(match[1].trim());
    } catch (err) {
      return match[1].trim();
    }
  }
  match = disposition.match(/filename\s*=\s*\"([^\"]+)\"/i);
  if (match && match[1]) return match[1].trim();
  match = disposition.match(/filename\s*=\s*([^;]+)/i);
  if (match && match[1]) return match[1].trim();
  return '';
}

function fetchRangeResponse_(url, start, end) {
  var resp = UrlFetchApp.fetch(url, {
    method: 'get',
    followRedirects: true,
    muteHttpExceptions: true,
    headers: { Range: 'bytes=' + start + '-' + end }
  });
  var code = resp.getResponseCode();
  if (code >= 400) {
    throw new Error('Respuesta HTTP ' + code);
  }
  if (code !== 206 && code !== 200) {
    throw new Error('Respuesta HTTP inesperada ' + code);
  }
  if (start > 0 && code === 200) {
    throw new Error('El servidor no soporta descargas por rangos.');
  }

  var headers = resp.getAllHeaders() || {};
  var contentType = (headers['Content-Type'] || headers['content-type'] || '').toString();
  var acceptRanges = (headers['Accept-Ranges'] || headers['accept-ranges'] || '').toString().toLowerCase().indexOf('bytes') !== -1;
  var disposition = (headers['Content-Disposition'] || headers['content-disposition'] || '').toString();
  var name = extractFilenameFromDisposition_(disposition) || resp.getBlob().getName() || '';

  var totalSize = null;
  var contentRange = (headers['Content-Range'] || headers['content-range'] || '').toString();
  var m = contentRange.match(/\/(\d+)\s*$/);
  if (m && m[1]) {
    totalSize = parseInt(m[1], 10);
  }

  var blob = resp.getBlob();
  var bytes = blob.getBytes();

  return {
    bytes: bytes,
    totalSize: totalSize,
    acceptRanges: acceptRanges || code === 206,
    contentType: contentType || blob.getContentType() || '',
    name: name
  };
}

function looksLikeZipSignature_(bytes) {
  if (!bytes || bytes.length < 4) return false;
  return bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) && (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08);
}
