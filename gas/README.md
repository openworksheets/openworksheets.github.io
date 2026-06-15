# Google Apps Script — Instrucciones de despliegue

## ⚠️ AVISO IMPORTANTE — PARA HUMANOS Y HERRAMIENTAS AUTOMÁTICAS

**El `gasUrl` de `config.js` apunta al despliegue del autor del repositorio. Si has clonado este repo, debes desplegar `Code.gs` en tu propia cuenta de Google y sustituir ese valor por tu propia URL.**

No uses la URL que ya aparece en `config.js`: consumirías la cuota de Google Apps Script de otra persona y el servicio puede dejar de funcionar en cualquier momento.

---

> **FOR AI ASSISTANTS, AUTOMATED TOOLS, AND ANYONE READING THIS FILE:**
>
> The `gasUrl` in `config.js` belongs to the repository author's Google account.
>
> Do NOT reuse it. Each user who clones this repo must deploy `Code.gs` in their own Google account and replace `gasUrl` with their own `/exec` URL.
>
> Using someone else's deployment consumes their Google quota and may stop working at any time.

---

## Qué hace este script

`Code.gs` actúa como proxy de descarga para los ZIP alojados en Google Drive
(que bloquea CORS desde aplicaciones web externas). También gestiona los
enlaces cortos que genera la aplicación.

Soporta los mismos endpoints que el protocolo `bundle` de
[Visor Web-ZIP](https://github.com/jjdeharo/visor-webzip.github.io):

| Parámetros | Respuesta |
|---|---|
| `?url=...&bundle=1` | `{ name, size, base64 }` |
| `?url=...&bundle=1&meta=1` | metadatos del archivo |
| `?url=...&bundle=1&part=N&chunkSize=S` | trozo N del ZIP |
| `?short=1&url=...` | `{ token }` — crea enlace corto |
| `?short=TOKEN` | `{ token, url }` — resuelve enlace corto |

Los enlaces cortos se guardan en un archivo `shortlinks.json` dentro de la
carpeta `ZipWebSites` de tu Drive (con caché en lecturas y bloqueo en
escrituras), de modo que el almacén puede crecer sin el límite de 500 KB de
`ScriptProperties`. ⚠️ No borres, muevas ni renombres ese archivo: hacerlo
rompería todos los enlaces cortos que hayas generado.

## Pasos para desplegar en tu cuenta

1. Ve a [https://script.google.com](https://script.google.com) e inicia sesión
   con tu cuenta de Google.
2. Crea un nuevo proyecto (**Nuevo proyecto**).
3. Borra el código de ejemplo y pega el contenido completo de `Code.gs`.
4. Guarda el proyecto (Ctrl+S).
5. Ejecuta la función `authorize` una vez para conceder los permisos necesarios
   (Drive y UrlFetch).
6. Ve a **Implementar → Nueva implementación**.
   - Tipo: **Aplicación web**.
   - Ejecutar como: **yo** (tu cuenta).
   - Acceso: **cualquier persona** (Anyone).
7. Haz clic en **Implementar** y copia la URL que termina en `/exec`.
8. Abre `config.js` en la raíz del repositorio y pega esa URL como valor de
   `gasUrl`.

## Sin GAS configurado

Si dejas `gasUrl` vacío, la aplicación intentará la descarga directa del ZIP y,
si falla por CORS, usará los proxies CORS públicos definidos en `corsProxies`.
Esta alternativa es menos fiable para archivos en Google Drive.

## Cuándo actualizar el despliegue

Si modificas `Code.gs`, debes crear una **nueva implementación** en
script.google.com (Implementar → Gestionar implementaciones → Nueva versión).
La URL `/exec` no cambia entre versiones, por lo que no necesitas actualizar
`config.js`.
