# OpenWorksheets

> [English version](README.md) · [Versió en català](README.ca.md)

OpenWorksheets es una aplicación web para convertir PDFs o imágenes en fichas interactivas autocorregibles, de forma parecida a TopWorksheets. El profesorado puede subir un documento, colocar encima distintos tipos de campos de respuesta y configurar las soluciones, la puntuación, las opciones de corrección y las restricciones de acceso. También permite crear fichas desde una hoja en blanco, sin necesidad de cargar antes un PDF o una imagen.

## Tipos de campo

En el editor, los campos se agrupan en la paleta de la izquierda en cinco categorías según lo que tiene que hacer el alumno.

### 💬 Responder

Campos en los que el alumno aporta su propia respuesta abierta (la escribe o la graba).

| Tipo | Descripción |
|------|-------------|
| **Respuesta corta** | El alumno escribe texto libre. Admite varias respuestas correctas alternativas y opciones de normalización (tildes, mayúsculas, espacios). |
| **Fórmula** | El alumno escribe una fórmula matemática o química con el editor visual **EdiCuaTeX** (botón «fx») y ve su representación renderizada en vivo bajo el campo. Se autocorrige: compara el LaTeX ignorando espacios y delimitadores (las mayúsculas sí cuentan) y admite varias respuestas aceptadas. |
| **Respuesta numérica** | El alumno introduce un número. Acepta coma o punto como separador decimal y permite definir una tolerancia de error. |
| **Respuesta larga** | El alumno escribe una respuesta extensa con formato (**negrita**, *cursiva*, enlaces) y fórmulas, con vista previa en vivo (Markdown + LaTeX) y **contador de palabras**. El docente puede fijar un **límite de palabras** opcional. No se autocorrige: el docente pone la nota al revisar la entrega (queda *pendiente* hasta entonces). |
| **Tabla editable** | El alumno rellena una tabla. Cada celda puede ser de **texto** o **número** (con tolerancia ±), tener varias respuestas válidas alternativas y marcarse como **ejemplo visible** (se muestra ya resuelta y no puntúa). Una celda puede **convertirse en desplegable**: sus respuestas se ofrecen como opciones y se marca cuál es la correcta. Las respuestas pueden **pegarse desde una hoja de cálculo** (Calc, Sheets, Excel o CSV) y la corrección puede hacerse celda a celda o por **filas/columnas completas** (útil para clasificar). |
| **Rellenar huecos** | El alumno rellena palabras o frases que faltan. Dos modos: *escribir un texto con huecos* (marcados con corchetes en el enunciado) o *marcar huecos sobre el documento* (dibujando un cuadro sobre cada hueco que ya existe en el PDF o imagen). Admite varias respuestas válidas por hueco y puntuación proporcional. |
| **Grabación de voz** | El alumno graba su voz con el micrófono. No se autocorrige: se valora *manualmente* (el docente pone la nota al revisar la entrega) o por *participación* (grabar algo otorga los puntos completos). El audio viaja dentro de la entrega; por su tamaño, su presencia deshabilita la entrega por enlace (queda solo la descarga de archivo). Duración máxima configurable. |

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

Contenido interactivo externo: webs incrustadas y paquetes SCORM (el SCORM puntúa; «Insertar» es informativo).

| Tipo | Descripción |
|------|-------------|
| **Insertar (Web/HTML)** | Contenido externo. Al crearlo se elige el tipo: **URL** (se incrusta en un iframe), **código HTML** de inserción (Genially, H5P, mapas…), **web completa en `.zip`** (un `index.html` con sus carpetas/CSS/JS, servida desde la propia ficha), **paquete `.elpx` de eXeLearning** (un `.zip` con una web dentro) o **paquete IMS Content Package** (`.zip` con `imsmanifest.xml`, con su menú de navegación). Admite título y pie. |
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
| **Texto** | Bloque de texto fijo (títulos, instrucciones, notas) con edición **Markdown**: negrita, cursiva, títulos, listas y enlaces, con conmutador entre edición y vista. Admite **fórmulas LaTeX** (ver abajo). |
| **Imagen** | Imagen decorativa o explicativa superpuesta al documento. |
| **Vídeo** | Vídeo de YouTube/Vimeo (incrustado), enlace directo o archivo subido, con título y pie opcionales. |
| **Audio** | Audio desde archivo subido o enlace, con título y pie opcionales. |
| **Tapar zona** | Rectángulo de color que oculta una parte del documento (respuestas, pistas, etc.). |
| **Línea / Flecha** | Línea recta con puntas de flecha opcionales (ninguna, una o dos) para señalar o conectar elementos. |
| **Polígono** | Polígono regular con el número de lados que se elija (triángulo, rombo, pentágono, hexágono…), con borde, relleno y rotación. |
| **Rectángulo / Elipse** | Formas geométricas para resaltar o enmarcar, con borde, relleno y esquinas redondeadas (rectángulo). |

Todos los campos con texto comparten ajustes de **tipo de letra** (con una fuente global de la ficha y posibilidad de cambiarla por campo, incluida OpenDyslexic), tamaño y color. Cada campo permite fijar su **tamaño exacto** (anchura y altura en %) además de ajustarlo con el ratón, y las formas, la imagen y el texto admiten **rotación**. El editor incluye una **tira de miniaturas** para navegar y reordenar páginas, **menús contextuales** (clic derecho) para copiar, cortar, pegar, duplicar y borrar campos y páginas, **deshacer/rehacer** (Ctrl+Z / Ctrl+Y) y **zoom** hasta el 500 % (Ctrl+rueda) con desplazamiento arrastrando la ficha.

### 🧮 Fórmulas matemáticas y química (LaTeX)

Cualquier texto de la ficha admite **fórmulas LaTeX**, que se renderizan automáticamente al mostrarse al alumnado: el título y las instrucciones, el campo **Texto**, las opciones de respuesta, los encabezados y las celdas de la **Tabla editable**, etc.

- **En línea:** escribe la fórmula entre `\(` y `\)` — por ejemplo, `\(\frac{1}{2}\)` o `\(E = mc^2\)`.
- **En bloque (centrada):** entre `\[` y `\]` — por ejemplo, `\[\int_0^1 x^2\,dx\]`.

Funciona con todo el repertorio habitual: fracciones, raíces, sumatorios e integrales, **matrices**, flechas, símbolos, etc., y con **química** mediante `mhchem` (`\(\ce{H2O}\)`, `\(\ce{2H2 + O2 -> 2H2O}\)`).

El renderizado usa MathJax con salida SVG: se carga solo cuando la ficha contiene fórmulas y **funciona sin conexión**, también dentro de los paquetes SCORM, IMS CP y de la exportación a web.

#### Asistente de fórmulas (EdiCuaTeX)

Para facilitar la escritura de fórmulas matemáticas o químicas sin necesidad de conocer la sintaxis de LaTeX, el editor integra la herramienta de edición visual **EdiCuaTeX**:

1. **Botón `fx`:** Cuando enfocas cualquier campo de texto que admita LaTeX en el panel lateral (como enunciados, textos de ayuda, opciones de respuesta, etc.), aparecerá el botón **`fx`** en la cabecera del panel (o pulsando el atajo `Ctrl+Shift+F`).
2. **Edición visual:** Al hacer clic en él, se abrirá un editor visual en ventana emergente de [EdiCuaTeX](https://edicuatex.github.io/). Si tenías texto seleccionado en el campo, se cargará automáticamente para que puedas editarlo; en los campos **Fórmula** (tanto las fórmulas aceptadas del editor como el campo que rellena el alumno), si no seleccionas nada se carga toda la fórmula ya escrita y se reemplaza al insertar.
3. **Inserción automática:** Una vez diseñada la fórmula, al pulsar el botón de inserción en EdiCuaTeX, esta se pegará automáticamente en tu campo de texto del editor de OpenWorksheets envuelta en los delimitadores de línea estándar `\(` y `\)`.

### 📊 Tablas editables

El tipo de campo **Tabla editable** permite crear rejillas estructuradas de entrada de datos (hasta un máximo de **12 filas y 8 columnas**) para que el alumnado las complete.

#### Características y configuración avanzada:
- **Tipos de celda individuales:** Cada celda de la tabla se puede configurar de forma independiente con los siguientes tipos:
  - **Texto:** Para respuestas alfanuméricas. Permite múltiples alternativas correctas y normalizaciones (tildes, mayúsculas, etc.).
  - **Número:** Para respuestas numéricas, con posibilidad de definir una **tolerancia de error** (p. ej. `±0.1`).
  - **Desplegable:** Convierte la celda en una lista de opciones. Las respuestas correctas alternativas se muestran como las opciones del desplegable y se marca cuál es la solución activa.
- **Celdas de ejemplo:** Cualquier celda se puede marcar como *Ejemplo*. Se mostrará rellena con la solución al alumno, no será editable y no contará para la puntuación.
- **Modos de corrección:** Desde los ajustes del panel, la corrección de la tabla se puede configurar en tres modalidades:
  - **Celda a celda:** Cada respuesta correcta suma puntos de forma independiente.
  - **Por filas completas:** Toda la fila debe ser correcta para puntuar (ideal para clasificaciones o relacionar conceptos en una misma línea).
  - **Por columnas completas:** Toda la columna debe completarse correctamente para puntuar.
- **Importación desde Hojas de Cálculo:** Puedes copiar datos directamente desde Excel, Google Sheets, Calc o un archivo CSV y pegarlos en el botón de importación de la tabla para rellenar automáticamente la estructura y los contenidos.
- **Editor a pantalla completa:** Para tablas grandes, puedes abrir el editor de tablas en pantalla completa mediante el botón correspondiente del panel lateral para trabajar con mayor comodidad.

## Creación de fichas con IA

OpenWorksheets puede generar una ficha completa automáticamente a partir de un formulario que rellena el docente. No requiere cuenta ni API externa: el proceso es íntegramente por copia/pegado:

1. Abre **Archivo → Crear con IA…** (o haz clic en la opción de la pantalla inicial).
2. Rellena el formulario: tema, nivel, número de preguntas, idioma, tipos de campo permitidos y fondo (color, imagen o PDF).
3. OWS genera un prompt estructurado. Cópialo y pégalo en cualquier chat de IA (ChatGPT, Gemini, Copilot, Claude…).
4. Pega la respuesta JSON de la IA de vuelta en OWS. La valida e importa, colocando los campos automáticamente con separación ajustada entre enunciado y respuesta y paginando según haga falta.
5. Edita el resultado como cualquier otra ficha.

También puedes insertar páginas generadas con IA en una ficha ya comenzada usando el botón **«+ IA»** que aparece entre páginas.

## Flujo de trabajo

1. **Crear:** el profesorado sube un PDF o imagen, o empieza con una hoja en blanco, coloca los campos y configura las respuestas correctas y la puntuación en el editor.

### Corrección de respuestas de texto

Los campos basados en texto (como **Respuesta corta**, **Rellenar huecos**, **Huecos en documento** y las celdas de **Tabla editable**) siguen el mismo esquema de corrección:

- Se pueden definir **varias respuestas válidas alternativas**.
- Las opciones **Ignorar mayúsculas y minúsculas**, **Ignorar tildes** e **Ignorar espacios sobrantes** se aplican a todas esas alternativas.

Esto significa que no hace falta añadir variantes que solo cambian por acentos o mayúsculas si esas opciones están activadas. Por ejemplo, con **Ignorar tildes**, `mamífero` y `mamifero` ya se consideran equivalentes. Las alternativas sirven para casos como `océano` / `mar`, `satélite` / `luna` o `carnívora` / `carnivoro` si quieres aceptar formas distintas con significado válido.
2. **Compartir:** la ficha se exporta como un paquete `.owpkg` (OpenWorksheets Package, internamente un ZIP) que contiene todo lo necesario. Se sube a Google Drive u otro alojamiento público y se comparte con el alumnado mediante un enlace generado en la propia aplicación. El alumnado no tiene acceso al paquete original, lo que protege el contenido.
3. **Responder y entregar:** el alumnado responde desde el navegador y, al terminar, puede descargar un archivo de entrega (`.owsub`) o copiar un enlace directo para enviárselo al docente.

> **Alternativa: exportar como SCORM 1.2.** Desde *Archivo → Exportar como… → SCORM 1.2* la ficha se empaqueta como un ZIP SCORM autónomo que se sube a **Moodle** o a cualquier LMS compatible como actividad SCORM. En este modo el LMS gestiona la nota, los intentos y el progreso: el visor le envía la puntuación (0–100), el estado (aprobado/suspenso o completado) y el tiempo de sesión según el estándar SCORM 1.2. La nota mínima para aprobar y el modo de estado se configuran en la pestaña **«SCORM»** de los ajustes de la ficha. No usa el archivo de entrega ni el enlace de entrega (los sustituye el LMS).

> **Alternativa: exportar como IMS Content Package.** Desde *Archivo → Exportar como… → IMS CP* la ficha se empaqueta como un ZIP IMS CP 1.1.4 (con `imsmanifest.xml`) para repositorios y plataformas compatibles. A diferencia del SCORM, no incluye seguimiento ni calificación.

> **Alternativa: exportar como página web autónoma.** Desde *Archivo → Exportar como… → Exportar a web (ZIP)* la ficha se empaqueta como un ZIP con una copia del visor y un `index.html`. Basta con descomprimirlo y subir su contenido a cualquier alojamiento web propio para tenerla funcionando sin depender de OpenWorksheets ni de Google Drive. Conserva la contraseña de acceso y el cifrado de entrega de la ficha. El alumnado responde y, al terminar, descarga su archivo de entrega (`.owsub`) o copia el enlace de entrega. El propio `index.html` del paquete reconoce esos enlaces y abre un **panel de corrección** donde el docente va acumulando las entregas en una tabla con resumen y exportación a CSV (pegando varios enlaces o abriendo archivos `.owsub`), igual que en la web oficial; con `#corregir` se abre el panel vacío. Así la web es totalmente autónoma. Debe servirse por http(s): no funciona abriendo el `index.html` como archivo local.

## Entregas y verificación

El docente puede abrir los archivos de entrega desde la página principal para ver la puntuación, las respuestas y comprobar automáticamente que no han sido modificados. Es posible cargar múltiples archivos a la vez o recibirlos mediante el enlace que genera el alumnado al terminar. Los resultados de toda una clase se muestran en una tabla ordenable y se pueden exportar a CSV.

Las respuestas que no se autocorrigen —las **grabaciones de voz** en modo *manual*— aparecen como **pendientes**: al abrir la entrega, el docente reproduce cada audio y escribe su puntuación, y la nota total, la nota sobre 10, el porcentaje y el CSV de la clase se recalculan al instante. Estos ajustes se guardan localmente en el navegador del docente **sin modificar la entrega original** del alumnado, por lo que su verificación de integridad sigue siendo válida.

La verificación de integridad es automática y avisa si algún archivo ha sido manipulado. Las entregas también pueden cifrarse para que solo el docente pueda leerlas (ver [Seguridad y cifrado](#seguridad-y-cifrado)).

## Control de acceso

Las fichas admiten las siguientes opciones de control:

- Fecha y hora de inicio y de finalización
- Contraseña de acceso
- Tiempo límite por intento
- Número máximo de intentos
- Entrega automática al agotar el plazo
- Opción de mostrar u ocultar la nota y la corrección al alumnado

### Supervisión durante la realización

De forma opcional, las fichas pueden hacerse bajo una supervisión ligera (todo en el navegador; no puede impedir del todo que un usuario decidido cambie de dispositivo):

- **Mantener la pantalla completa**: la ficha se abre a pantalla completa y vuelve a solicitarla cuando el alumnado hace clic tras salir de ella.
- **Qué hacer si el alumnado sale de la pestaña, ventana o pantalla completa**: permitirlo, mostrar un aviso o avisar **y registrar** la incidencia en la entrega.
- **Entrega automática** tras un número configurable de incidencias (0 = nunca).

Al alumnado se le informan las reglas en la pantalla de inicio (sin revelar cuántas salidas fuerzan el envío automático), los avisos aparecen como un mensaje centrado que permanece hasta que se cierra, y las entregas con incidencias se destacan en la tabla de resultados del docente.

## Seguridad y cifrado

OpenWorksheets ofrece un nivel de seguridad alto para el uso en el aula: el alumnado no puede acceder al archivo de la ficha y las entregas pueden cifrarse para que solo el docente pueda leerlas. Incorpora dos mecanismos de cifrado **independientes**, ambos ejecutados íntegramente en el navegador mediante la Web Crypto API (`crypto.subtle`), sin servidor ni envío de datos a terceros.

### Cifrado de entregas (clave pública)

Pensado para que **solo el docente** pueda leer lo que entrega el alumnado.

- Al activarlo, el docente fija una contraseña y la aplicación genera un par de claves **RSA-OAEP de 2048 bits** (SHA-256). La clave pública se incrusta en la ficha; la clave privada se guarda **cifrada** con **AES-GCM de 256 bits**, usando una clave derivada de la contraseña del docente mediante **PBKDF2-SHA256 con 250 000 iteraciones** y sal aleatoria.
- Cuando el alumnado entrega, la aplicación genera una clave AES-GCM aleatoria, cifra la entrega con ella y, a su vez, cifra esa clave con la clave pública RSA (esquema híbrido). El alumnado puede **cifrar pero no descifrar**.
- Solo el docente, introduciendo su contraseña, recupera la clave privada y descifra las entregas.

Ventaja: aunque el archivo de entrega (`.owsub`) o el enlace de entrega se intercepten, su contenido permanece ilegible sin la contraseña del docente.

### Cifrado de la ficha (protección de las soluciones)

Protege el contenido de la ficha —en especial las respuestas correctas, que viajan dentro del archivo— frente a quien obtenga el paquete `.owpkg` sin autorización.

- El contenido sensible del manifiesto (instrucciones, ajustes, páginas con soluciones, configuración de acceso…) se cifra con **AES-GCM de 256 bits**, con clave derivada de la contraseña de acceso por **PBKDF2-SHA256 (250 000 iteraciones)**. Solo quedan en claro datos no sensibles (título, idioma e identificador).
- La contraseña de acceso cumple doble función: da acceso a la ficha y descifra su contenido.

### Implicaciones de seguridad

Conviene entender bien el modelo, porque condiciona qué protege y qué no:

- **Toda la seguridad recae en la contraseña.** Como no hay servidor, la clave privada cifrada y los datos cifrados viajan dentro de archivos que pueden acabar en manos de terceros. Quien obtenga uno de esos archivos puede intentar un **ataque de diccionario sin conexión**. Las 250 000 iteraciones de PBKDF2 encarecen mucho cada intento, pero **una contraseña débil sigue siendo vulnerable**. Usa contraseñas largas y únicas.
- **No hay recuperación.** Si se pierde la contraseña, las entregas cifradas y la ficha cifrada son **irrecuperables**: no existe restablecimiento ni puerta trasera.
- **El cifrado de la ficha no es DRM.** Protege las soluciones frente a quien **no** tiene la contraseña (por ejemplo, un paquete filtrado públicamente). No protege frente a un alumno que **sí** recibe la contraseña de acceso, ya que esa misma contraseña descifra el manifiesto: técnicamente podría extraer las respuestas. Evita la fuga accidental del archivo, no a un usuario autorizado y malintencionado.
- **Integridad garantizada.** AES-GCM es cifrado autenticado: cualquier manipulación del texto cifrado se detecta al descifrar. Las entregas, además, incluyen verificación de integridad que avisa si un archivo ha sido alterado.
- **Límite inherente a las aplicaciones de cliente.** Como todo se ejecuta en el navegador del alumnado, el cifrado protege los datos **en reposo** (los archivos), pero no impide que un usuario con conocimientos técnicos inspeccione o manipule su propia sesión en ejecución. Por eso OpenWorksheets es adecuado para el aula, pero **no sustituye a un sistema de examen de alta seguridad** con supervisión y backend de confianza.

## Idiomas

La interfaz está disponible en español, inglés, català, galego y euskera.

## Tecnología

Funciona sin servidor, sin cuentas y sin instalaciones. Es una aplicación web estática en JavaScript vanilla (módulos ES, sin framework ni paso de compilación), compatible con cualquier navegador moderno.

Las únicas dependencias son bibliotecas locales que viajan con la aplicación, por lo que todo funciona **sin conexión** (también en los paquetes SCORM, IMS CP y de exportación a web):

- **[pdf.js](https://mozilla.github.io/pdf.js/)** — convierte cada página del PDF en imagen al importar.
- **[JSZip](https://stuk.github.io/jszip/)** — lee y escribe los paquetes `.owpkg`, `.owsub` y los ZIP de exportación.
- **[MathJax](https://www.mathjax.org/)** (componente *tex-svg*) — renderiza las fórmulas LaTeX y químicas a SVG; se carga solo cuando la ficha contiene fórmulas.

El cifrado usa la **Web Crypto API** del navegador (sin biblioteca externa).


## Licencia

[AGPLv3](LICENSE) · © Juan José de Haro
