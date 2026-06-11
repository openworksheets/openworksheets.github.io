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

// Normaliza una URL pública a una URL de descarga directa.
export function toDirectUrl(url) {
  const id = parseDriveId(url);
  if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  // Dropbox: forzar descarga directa.
  if (/dropbox\.com/.test(url)) {
    return url.replace(/[?&]dl=0/, '').replace('www.dropbox.com', 'dl.dropboxusercontent.com');
  }
  return url.trim();
}

// Construye el enlace para el alumnado a partir de la URL pública del ZIP.
export function buildStudentLink(zipUrl) {
  const direct = toDirectUrl(zipUrl);
  const base = new URL('alumno.html', window.location.href);
  base.search = '?z=' + encodeURIComponent(direct);
  return base.href;
}
