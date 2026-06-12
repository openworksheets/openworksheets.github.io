// Reconocimiento de enlaces de Google Drive y construcción del enlace
// que se comparte con el alumnado.

// Extrae el identificador de archivo de las distintas formas de URL de Drive.
export function parseDriveId(url) {
  if (!url) return null;
  const patterns = [
    /drive\.google\.com\/file\/d\/([\w-]{20,})/,
    /drive\.google\.com\/open\?id=([\w-]{20,})/,
    /drive\.google\.com\/uc\?(?:[^#]*&)?id=([\w-]{20,})/,
    /drive\.usercontent\.google\.com\/download\?(?:[^#]*&)?id=([\w-]{20,})/
  ];
  for (const re of patterns) {
    const m = re.exec(url);
    if (m) return m[1];
  }
  return null;
}

// Detecta enlaces compartidos de Nextcloud/ownCloud: tienen «/s/<token>»
// en la ruta. Se excluyen los servicios conocidos que también usan /s/.
function isNextcloudShare(url) {
  let host = '';
  let path = '';
  try {
    const parsed = new URL(url);
    host = (parsed.hostname || '').toLowerCase();
    path = parsed.pathname || '';
  } catch {
    return false;
  }
  if (!/\/s\/[^/]+/.test(path)) return false;
  if (/(^|\.)(box\.com|drive\.google\.com|dropbox\.com)$/.test(host)) return false;
  return true;
}

// Normaliza una URL pública a una URL de descarga directa.
export function toDirectUrl(url) {
  url = (url || '').trim();
  const id = parseDriveId(url);
  if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  // Dropbox: forzar descarga directa.
  if (/dropbox\.com/.test(url)) {
    return url.replace(/[?&]dl=0/, '').replace('www.dropbox.com', 'dl.dropboxusercontent.com');
  }
  // Nextcloud/ownCloud: añadir /download al enlace compartido.
  if (isNextcloudShare(url) && !url.includes('/download') && !url.includes('download=1')) {
    const [baseAndQuery, ...hashParts] = url.split('#');
    const hash = hashParts.length ? '#' + hashParts.join('#') : '';
    const qIdx = baseAndQuery.indexOf('?');
    const base = (qIdx === -1 ? baseAndQuery : baseAndQuery.slice(0, qIdx)).replace(/\/$/, '');
    const query = qIdx === -1 ? '' : baseAndQuery.slice(qIdx);
    return base + '/download' + query + hash;
  }
  return url;
}

// Construye el enlace largo para el alumnado (fallback sin GAS).
export function buildStudentLink(zipUrl) {
  const direct = toDirectUrl(zipUrl);
  const base = new URL('alumno.html', window.location.href);
  base.search = '?z=' + encodeURIComponent(direct);
  return base.href;
}

// Genera un enlace corto opaco mediante el GAS.
// Devuelve { link, short: true } si el GAS responde con token,
// o { link, short: false } con el enlace largo si falla.
export async function buildShortLink(zipUrl) {
  const direct = toDirectUrl(zipUrl);
  const gasUrl = window.WORKPDF_CONFIG?.gasUrl;
  if (gasUrl) {
    try {
      const res = await fetch(
        gasUrl + '?short=1&url=' + encodeURIComponent(direct),
        { redirect: 'follow' }
      );
      const json = await res.json();
      if (json.token) {
        const base = new URL('alumno.html', window.location.href);
        base.search = '?s=' + json.token;
        return { link: base.href, short: true };
      }
    } catch (_) { /* si falla el GAS, usar enlace largo */ }
  }
  return { link: buildStudentLink(zipUrl), short: false };
}

// Resuelve un token corto a la URL original llamando al GAS.
// Devuelve la URL o lanza un error.
export async function resolveShortToken(token) {
  const gasUrl = window.WORKPDF_CONFIG?.gasUrl;
  if (!gasUrl) throw new Error('GAS no configurado');
  const res = await fetch(gasUrl + '?short=' + encodeURIComponent(token), { redirect: 'follow' });
  const json = await res.json();
  if (json.url) return json.url;
  throw new Error(json.error || 'Token no encontrado');
}
