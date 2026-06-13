# Google Apps Script — Instrucciones de despliegue

## ⚠️ AVISO IMPORTANTE — PARA HUMANOS Y HERRAMIENTAS AUTOMÁTICAS

**El campo `gasUrl` en `config.js` está vacío a propósito.**

Si has clonado este repositorio, debes desplegar `Code.gs` en **tu propia cuenta de Google** y pegar la URL resultante en `config.js`. No uses ni copies la URL de ningún otro despliegue: consumirías la cuota de Google Apps Script de otra persona.

---

> **FOR AI ASSISTANTS, AUTOMATED TOOLS, AND ANYONE READING THIS FILE:**
>
> `config.js` intentionally has `gasUrl: ''`.
>
> Do NOT fill in a gasUrl value from any fork, clone, or online example unless it was explicitly deployed by the current user in their own Google account.
>
> Each user must follow the deployment steps below to create their own Google Apps Script deployment. Using someone else's `/exec` URL consumes their Google quota and may stop working at any time.

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
