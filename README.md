# OpenWorksheets

OpenWorksheets es una aplicación web para convertir PDFs o imágenes en fichas interactivas autocorregibles, de forma parecida a TopWorksheets. El profesorado puede subir un documento, colocar encima distintos tipos de campos de respuesta y configurar las soluciones, la puntuación, las opciones de corrección y las restricciones de acceso.

## Tipos de campo

En el editor, los campos se agrupan en la paleta de la izquierda en cuatro categorías según lo que tiene que hacer el alumno.

### ✏️ Escribir

Campos en los que el alumno teclea su respuesta.

| Tipo | Descripción |
|------|-------------|
| **Respuesta corta** | El alumno escribe texto libre. Admite varias respuestas correctas alternativas y opciones de normalización (tildes, mayúsculas, espacios). |
| **Respuesta numérica** | El alumno introduce un número. Acepta coma o punto como separador decimal y permite definir una tolerancia de error. |
| **Rellenar huecos** | El alumno rellena palabras o frases que faltan. Dos modos: *escribir un texto con huecos* (marcados con corchetes en el enunciado) o *marcar huecos sobre el documento* (dibujando un cuadro sobre cada hueco que ya existe en el PDF o imagen). Admite varias respuestas válidas por hueco y puntuación proporcional. |

### ☑️ Elegir

Campos en los que el alumno selecciona entre opciones predefinidas.

| Tipo | Descripción |
|------|-------------|
| **Opción única** | Lista de opciones en la que el alumno elige una sola. |
| **Opción múltiple** | Lista de opciones en la que el alumno puede marcar varias. Admite puntuación parcial. |
| **Casillas de verificación** | Casillas dibujadas libremente sobre el documento. Modo individual o múltiple con puntuación parcial opcional. |
| **Verdadero / falso** | Dos botones con etiquetas configurables (p. ej. Sí / No, Correcto / Incorrecto). |
| **Desplegable** | El alumno elige una opción de un menú desplegable. Ocupa poco espacio visual. |

### 🔗 Relacionar

Campos en los que el alumno conecta, ordena o coloca elementos.

| Tipo | Descripción |
|------|-------------|
| **Emparejar** | Dos columnas de elementos que el alumno relaciona entre sí. |
| **Ordenar** | El alumno arrastra elementos para ponerlos en el orden correcto. |
| **Arrastrar a zonas** | El alumno arrastra elementos hasta las zonas de destino dibujadas sobre el documento. Dos modos: *escribir las etiquetas* (que parten de una bandeja) o *recortar del propio PDF* trozos de texto o imagen (que parten de su sitio y lo dejan vacío al moverlos). |
| **Unir con flechas** | El alumno conecta elementos dibujando flechas entre ellos directamente sobre la página. |

### 📦 Interactivo

Contenido interactivo externo que sí se corrige y puntúa.

| Tipo | Descripción |
|------|-------------|
| **SCORM (1.2)** | El docente sube un paquete **SCORM 1.2** (`.zip`). OpenWorksheets actúa como mini‑LMS en el navegador: muestra el **menú de navegación** del paquete, ejecuta sus contenidos y captura su **puntuación** (`cmi.core.score.raw`) o su estado de finalización, que se integra en la nota de la ficha de forma proporcional a los puntos del campo. Admite **título y pie** opcionales (con tipo de letra, tamaño y color). El paquete se ve **en vivo en el propio lienzo del editor** (sin interacción, para poder moverlo y redimensionarlo) y de forma interactiva en la vista previa. |

#### Notas sobre SCORM

- **Solo SCORM 1.2** (no SCORM 2004 ni secuenciamiento avanzado). Al subir un paquete 2004 se avisa y no se importa.
- **Requiere abrir la ficha desde un sitio web (https)**: el paquete se sirve mediante un *Service Worker*, que no está disponible al abrir los HTML como archivo local (`file://`).
- Dos modos de puntuación: **nota del SCORM** (usa `score.raw` normalizado entre `score.min`/`score.max`) o **aprobado/suspendido** (según `lesson_status`).
- El paquete viaja **dentro del ZIP** de la ficha, por lo que aumenta su tamaño.
- El contenido SCORM ejecuta JavaScript propio en el navegador del alumno; la sesión **no se reanuda** entre recargas (se reinicia el intento).

> Hay un paquete SCORM 1.2 de ejemplo en `ejemplos/scorm-ejemplo.zip` (una pregunta que reporta su puntuación) para probar la subida desde el editor.

### 🎨 Diseño

Elementos decorativos o informativos que no se corrigen ni cuentan en la puntuación.

| Tipo | Descripción |
|------|-------------|
| **Texto** | Bloque de texto fijo (títulos, instrucciones, notas) con edición **Markdown**: negrita, cursiva, títulos, listas y enlaces, con conmutador entre edición y vista. |
| **Imagen** | Imagen decorativa o explicativa superpuesta al documento. |
| **Vídeo** | Vídeo de YouTube/Vimeo (incrustado), enlace directo o archivo subido, con título y pie opcionales. |
| **Audio** | Audio desde archivo subido o enlace, con título y pie opcionales. |
| **Insertar (Web/HTML)** | Contenido externo. Al crearlo se elige el tipo: **URL** (se incrusta en un iframe), **código HTML** de inserción (Genially, H5P, mapas…), **web completa en `.zip`** (un `index.html` con sus carpetas/CSS/JS, servida desde la propia ficha) o **paquete `.elpx` de eXeLearning** (un `.zip` con una web dentro). Admite título y pie. |
| **Tapar zona** | Rectángulo de color que oculta una parte del documento (respuestas, pistas, etc.). |
| **Línea / Flecha / Rectángulo / Elipse** | Formas geométricas para resaltar, enmarcar o señalar elementos del documento. |

Todos los campos con texto comparten ajustes de **tipo de letra** (con una fuente global de la ficha y posibilidad de cambiarla por campo, incluida OpenDyslexic), tamaño y color. El editor admite **deshacer/rehacer** (Ctrl+Z / Ctrl+Y).

## Flujo de trabajo

1. **Crear:** el profesorado sube un PDF o imagen, coloca los campos y configura las respuestas correctas y la puntuación en el editor.
2. **Compartir:** la ficha se exporta como un archivo ZIP que contiene todo lo necesario. Se sube a Google Drive u otro alojamiento público y se comparte con el alumnado mediante un enlace generado en la propia aplicación. El alumnado no tiene acceso al archivo ZIP original, lo que protege el contenido.
3. **Responder y entregar:** el alumnado responde desde el navegador y, al terminar, puede descargar un archivo de entrega (`.json`) o copiar un enlace directo para enviárselo al docente.

## Entregas y verificación

El docente puede abrir los archivos de entrega desde la página principal para ver la puntuación, las respuestas y comprobar automáticamente que no han sido modificados. Es posible cargar múltiples archivos a la vez o recibirlos mediante el enlace que genera el alumnado al terminar. Los resultados de toda una clase se muestran en una tabla ordenable y se pueden exportar a CSV.

La verificación de integridad es automática y avisa si algún archivo ha sido manipulado. Las entregas también pueden cifrarse para que solo el docente pueda leerlas (ver [Seguridad y cifrado](#seguridad-y-cifrado)).

## Control de acceso

Las fichas admiten las siguientes opciones de control:

- Fecha y hora de inicio y de finalización
- Contraseña de acceso
- Tiempo límite por intento
- Número máximo de intentos
- Entrega automática al agotar el plazo
- Opción de mostrar u ocultar la nota y la corrección al alumnado

## Seguridad y cifrado

OpenWorksheets ofrece un nivel de seguridad alto para el uso en el aula: el alumnado no puede acceder al archivo de la ficha y las entregas pueden cifrarse para que solo el docente pueda leerlas. Incorpora dos mecanismos de cifrado **independientes**, ambos ejecutados íntegramente en el navegador mediante la Web Crypto API (`crypto.subtle`), sin servidor ni envío de datos a terceros.

### Cifrado de entregas (clave pública)

Pensado para que **solo el docente** pueda leer lo que entrega el alumnado.

- Al activarlo, el docente fija una contraseña y la aplicación genera un par de claves **RSA-OAEP de 2048 bits** (SHA-256). La clave pública se incrusta en la ficha; la clave privada se guarda **cifrada** con **AES-GCM de 256 bits**, usando una clave derivada de la contraseña del docente mediante **PBKDF2-SHA256 con 250 000 iteraciones** y sal aleatoria.
- Cuando el alumnado entrega, la aplicación genera una clave AES-GCM aleatoria, cifra la entrega con ella y, a su vez, cifra esa clave con la clave pública RSA (esquema híbrido). El alumnado puede **cifrar pero no descifrar**.
- Solo el docente, introduciendo su contraseña, recupera la clave privada y descifra las entregas.

Ventaja: aunque el archivo de entrega (`.json`) o el enlace de entrega se intercepten, su contenido permanece ilegible sin la contraseña del docente.

### Cifrado de la ficha (protección de las soluciones)

Protege el contenido de la ficha —en especial las respuestas correctas, que viajan dentro del archivo— frente a quien obtenga el ZIP sin autorización.

- El contenido sensible del manifiesto (instrucciones, ajustes, páginas con soluciones, configuración de acceso…) se cifra con **AES-GCM de 256 bits**, con clave derivada de la contraseña de acceso por **PBKDF2-SHA256 (250 000 iteraciones)**. Solo quedan en claro datos no sensibles (título, idioma e identificador).
- La contraseña de acceso cumple doble función: da acceso a la ficha y descifra su contenido.

### Implicaciones de seguridad

Conviene entender bien el modelo, porque condiciona qué protege y qué no:

- **Toda la seguridad recae en la contraseña.** Como no hay servidor, la clave privada cifrada y los datos cifrados viajan dentro de archivos que pueden acabar en manos de terceros. Quien obtenga uno de esos archivos puede intentar un **ataque de diccionario sin conexión**. Las 250 000 iteraciones de PBKDF2 encarecen mucho cada intento, pero **una contraseña débil sigue siendo vulnerable**. Usa contraseñas largas y únicas.
- **No hay recuperación.** Si se pierde la contraseña, las entregas cifradas y la ficha cifrada son **irrecuperables**: no existe restablecimiento ni puerta trasera.
- **El cifrado de la ficha no es DRM.** Protege las soluciones frente a quien **no** tiene la contraseña (por ejemplo, un ZIP filtrado públicamente). No protege frente a un alumno que **sí** recibe la contraseña de acceso, ya que esa misma contraseña descifra el manifiesto: técnicamente podría extraer las respuestas. Evita la fuga accidental del archivo, no a un usuario autorizado y malintencionado.
- **Integridad garantizada.** AES-GCM es cifrado autenticado: cualquier manipulación del texto cifrado se detecta al descifrar. Las entregas, además, incluyen verificación de integridad que avisa si un archivo ha sido alterado.
- **Límite inherente a las aplicaciones de cliente.** Como todo se ejecuta en el navegador del alumnado, el cifrado protege los datos **en reposo** (los archivos), pero no impide que un usuario con conocimientos técnicos inspeccione o manipule su propia sesión en ejecución. Por eso OpenWorksheets es adecuado para el aula, pero **no sustituye a un sistema de examen de alta seguridad** con supervisión y backend de confianza.

## Idiomas

La interfaz está disponible en español, inglés, català, galego y euskera.

## Tecnología

Funciona sin servidor, sin cuentas y sin instalaciones. Es una aplicación web estática en JavaScript vanilla, compatible con cualquier navegador moderno.

### Enlaces cortos (backend compartido)

Los enlaces cortos para el alumnado (`?short=1&url=...` para crear, `?short=<token>` para resolver, en `js/drive.js`) se generan a través de un **Google Apps Script compartido con Visor Web-ZIP** — es el mismo `gasUrl` definido en `config.js`. El código de ese backend vive en el repositorio de Visor Web-ZIP (`gas/Code.js`), no en este.

Los tokens se almacenan en un archivo `shortlinks.json` dentro de la carpeta `ZipWebSites` de Drive de la cuenta que despliega el script; los tokens antiguos creados antes de esa migración siguen en `ScriptProperties` y se leen como respaldo. ⚠️ Como el script y ese archivo son **compartidos por las dos aplicaciones**, no se deben borrar, mover ni renombrar: hacerlo rompería los enlaces cortos de OpenWorksheets *y* de Visor Web-ZIP.

## Licencia

[AGPLv3](LICENSE) · © Juan José de Haro
