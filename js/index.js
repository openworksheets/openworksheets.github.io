// Página de inicio: generador de enlaces para el alumnado y
// verificación de entregas.

import { toast, copyToClipboard } from './util.js';
import { buildStudentLink, parseDriveId } from './drive.js';
import { verifyEntrega, entregaResumen } from './entrega.js';

const $ = s => document.querySelector(s);

// --- Generar enlace ---

$('#btnGenerar').addEventListener('click', async () => {
  const url = $('#urlZip').value.trim();
  if (!url) { toast('Pega primero la URL pública del ZIP.', 'error'); return; }
  if (!/^https?:\/\//i.test(url)) { toast('La URL no parece válida.', 'error'); return; }
  if (/drive\.google\.com/.test(url) && !parseDriveId(url)) {
    toast('No se reconoce el enlace de Drive. Usa "Compartir → Copiar enlace" del archivo.', 'error');
    return;
  }
  const link = buildStudentLink(url);
  $('#enlaceAlumnos').textContent = link;
  $('#salidaEnlace').style.display = 'block';
  const ok = await copyToClipboard(link);
  if (ok) toast('Enlace copiado al portapapeles.', 'ok');
});

$('#btnCopiarEnlace').addEventListener('click', async () => {
  const ok = await copyToClipboard($('#enlaceAlumnos').textContent);
  toast(ok ? 'Enlace copiado.' : 'No se pudo copiar.', ok ? 'ok' : 'error');
});

// --- Verificar entrega ---

$('#btnVerificar').addEventListener('click', () => $('#inputEntrega').click());

$('#inputEntrega').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const out = $('#salidaVerificacion');
  try {
    const data = JSON.parse(await file.text());
    const res = await verifyEntrega(data);
    if (res.valid) {
      out.innerHTML = '';
      out.style.display = 'block';
      const pre = document.createElement('pre');
      pre.style.cssText = 'white-space:pre-wrap;font-family:inherit;margin:0';
      pre.textContent = '✓ ENTREGA ÍNTEGRA: el código de verificación coincide.\n\n' + entregaResumen(data);
      out.appendChild(pre);
      out.style.borderColor = 'var(--verde)';
      out.style.background = 'var(--verde-claro)';
    } else {
      out.textContent = '✗ ' + res.reason;
      out.style.display = 'block';
      out.style.borderColor = 'var(--rojo)';
      out.style.background = 'var(--rojo-claro)';
    }
  } catch {
    out.textContent = '✗ El archivo no es un JSON de entrega válido.';
    out.style.display = 'block';
    out.style.borderColor = 'var(--rojo)';
    out.style.background = 'var(--rojo-claro)';
  }
});
