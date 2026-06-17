# Registro de cambios

Todas las novedades destacables de OpenWorksheets, por versión.

El formato sigue, a grandes rasgos, [Keep a Changelog](https://keepachangelog.com/es-ES/),
y el proyecto usa [versionado semántico](https://semver.org/lang/es/).
Las versiones publicadas también están en la página de
[Releases](https://github.com/openworksheets/openworksheets.github.io/releases).

---

## [1.10.0] — 2026-06-17

### Añadido
- **Exportación a página web autónoma** (menú *Archivo → Exportar a web (ZIP)*):
  genera un ZIP con una copia del visor del alumnado y un `index.html`. Basta con
  descomprimirlo y subir su contenido a cualquier alojamiento web propio para
  tener la ficha funcionando sin depender de OpenWorksheets ni de Google Drive.
  - Conserva la contraseña de acceso y el cifrado de entrega de la ficha (a
    diferencia del SCORM, aquí no hay un LMS que gestione el acceso).
  - El alumnado responde y, al terminar, puede descargar su archivo de entrega
    (`.owsub`) **o copiar el enlace de entrega**: el propio `index.html` del
    paquete detecta el enlace (`#e=…`) y muestra al docente la verificación de la
    entrega (integridad, respuestas, nota y audio de las grabaciones), sin
    depender de la web pública de OpenWorksheets.
  - Debe servirse por http(s): no funciona abriendo el `index.html` como archivo
    local (el navegador bloquea la carga de la ficha y el Service Worker).

## [1.9.3] — 2026-06-17

### Cambiado
- **Identificación del alumnado más respetuosa con la privacidad**: el campo de
  nombre de la pantalla de inicio pasa a ser «Nombre y apellidos o código de
  alumno/a», indicando que se puede usar un código en lugar del nombre real.
  Traducido a los cinco idiomas.

## [1.9.2] — 2026-06-17

### Corregido
- **«Unir» (match): la respuesta del alumno se veía en blanco al emparejar con
  un distractor**. El texto legible de la entrega indexaba el índice elegido
  sobre las parejas en vez de sobre el conjunto «derechas + distractores», de
  modo que al marcar un distractor la elección desaparecía del verificador y del
  resumen copiado (la nota sí era correcta). Ahora se muestra la opción marcada.
- **«Arrastrar a zonas»: posible nota inflada con respuestas duplicadas**. Si
  dos zonas compartían la misma respuesta correcta, apilar las dos fichas
  iguales en una sola zona contaba doble y compensaba la zona dejada vacía. Cada
  hueco correcto se cuenta ahora una única vez (intersección de multiconjuntos).
- **Pérdida silenciosa de la lista de resultados de clase al llenarse el
  almacenamiento**. Las entregas con grabación de voz (audio incrustado) pueden
  agotar la cuota de `localStorage`; el guardado fallaba sin avisar y la lista
  se perdía al recargar. Ahora se muestra un aviso para exportar el CSV antes de
  perder las calificaciones.

### Seguridad
- **Inyección de fórmulas en la exportación CSV de resultados de clase**. Un
  nombre o grupo de alumno que empezara por `=`, `+`, `-` o `@` se interpretaba
  como fórmula al abrir el CSV en Excel/LibreOffice. Esas celdas se escapan
  ahora con un apóstrofo para forzar texto literal.

## [1.9.1] — 2026-06-17

### Corregido
- **Duplicar/copiar/pegar un campo «Unir con flechas» rompía la corrección**: al
  clonar el campo se regeneraban los IDs de los elementos pero no se actualizaban
  las parejas correctas (`config.pairs`), que seguían apuntando a los IDs
  antiguos. La copia daba siempre 0 puntos y marcaba todas las flechas como
  erróneas. Afectaba a *duplicar campo*, *pegar campo copiado* y *duplicar
  página*. Ahora las parejas se remapean a los nuevos IDs.

## [1.9.0] — 2026-06-17

### Añadido
- **Exportación a SCORM 1.2** (menú *Archivo → Guardar SCORM 1.2*): genera un
  ZIP autónomo que se sube a Moodle o a cualquier LMS compatible como actividad
  SCORM. El paquete incluye una copia del visor y la ficha empaquetada, con su
  `imsmanifest.xml` e `index.html` (el SCO).
  - **Puntuación estándar SCORM**: al corregir, el visor envía al LMS la nota en
    escala 0–100 (`cmi.core.score.raw`), el estado (`cmi.core.lesson_status`) y
    el tiempo de la sesión. El alumno entra directo a la actividad (sin pantalla
    de identificación: el nombre lo aporta el LMS).
  - **Nueva pestaña «SCORM»** en los ajustes de la ficha con dos opciones: el
    **estado que se envía** (*aprobado/suspenso según el umbral* —por defecto— o
    *marcar siempre «completado»*) y la **nota mínima para aprobar (%)**
    (`masteryscore`, 50 por defecto), que decide el aprobado.
  - Dentro del SCORM, la **nota, los intentos y el progreso los gestiona el LMS**:
    se desactivan el cifrado de entrega, el enlace de entrega y la contraseña de
    acceso de la ficha (innecesarios porque el resultado viaja al LMS).
  - La pantalla final **confirma si el resultado se envió** al LMS; si la ficha se
    abre **fuera de un LMS** (o en vista previa que no lo expone), avisa de que la
    nota **no se ha enviado**, para no dar una confirmación falsa.
- **Campo «Grabación de voz»** (grupo «Responder» de la paleta): el alumnado
  graba su voz con el micrófono (`MediaRecorder`, Opus mono) directamente sobre
  la ficha. Pensado para idiomas, lectura en voz alta, música o infantil.
  - **Dos modos de puntuación**: *Manual* (la pone el profesor al revisar la
    entrega; queda como «pendiente» hasta entonces) o *Participación*
    (automática: grabar algo otorga los puntos completos). El modo *sin puntuar*
    se obtiene, como en cualquier campo, con la casilla de anular puntuación.
  - **Calificación en el revisor de entregas** (página de inicio): al abrir una
    entrega, cada grabación se **reproduce** y, si es de modo manual, muestra un
    **campo editable de puntos**; la nota total, la nota sobre 10, el % y el CSV
    de la clase se **recalculan automáticamente**. El ajuste del profesor se
    guarda como una capa local **sin alterar la entrega original** del alumnado,
    cuya verificación de integridad sigue siendo válida.
  - El audio **se incrusta cifrado** dentro de la entrega cuando la ficha tiene
    activado el cifrado de entregas (solo el docente puede oírlo); si no, viaja
    como cualquier otra respuesta. **Duración máxima configurable** por campo
    (30 s por defecto) y enunciado opcional.
  - Por el tamaño del audio, una ficha con grabaciones **deshabilita la entrega
    por enlace** (la URL sería inmanejable): la entrega pasa a ser por
    **descarga de archivo**. El visor también recurre a la descarga si el enlace
    superara un tope holgado (muy por debajo de los límites de Chrome y Firefox).
    El audio **no se guarda en el autoguardado** del navegador para no agotar el
    almacenamiento local.
  - El grupo de la paleta **«Escribir» pasa a llamarse «Responder»** (con icono
    de bocadillo), ya que ahora agrupa también la grabación de voz además de
    texto, número y rellenar huecos.
- La **ficha de ejemplo** de la página de inicio se adapta ahora al **idioma
  activo**: se muestra la versión en español, catalán o inglés según el idioma
  seleccionado, con el español como *fallback* para el resto de idiomas. Se
  retira el antiguo `ficha-ejemplo.zip`.
- El campo **«Insertar (Web/HTML)»** admite ahora **webs empaquetadas**: además
  de URL y código HTML, se puede subir una **web completa en `.zip`** (un
  `index.html` con sus carpetas, CSS, JS…) o un **paquete `.elpx` de
  eXeLearning** (que es un `.zip` con una web dentro). Se sirven desde la propia
  ficha mediante el Service Worker (igual que el SCORM) y se ven en vivo en el
  lienzo del editor. Al crear el campo se elige primero el tipo de contenido.
- **Campo SCORM 1.2** (grupo «Interactivo» de la paleta): el docente sube un
  paquete SCORM 1.2 (`.zip`) y OpenWorksheets actúa como mini‑LMS en el
  navegador. Genera el **menú de navegación** del paquete a partir de su
  `imsmanifest.xml`, ejecuta los SCO en un iframe servido por un *Service
  Worker* y captura su **puntuación** (`cmi.core.score.raw`) o su estado de
  finalización mediante el runtime `window.API`. La nota se integra en la
  puntuación de la ficha de forma proporcional a los puntos del campo, con dos
  modos: *nota del SCORM* o *aprobado/suspendido*.
  - El paquete se previsualiza **en vivo en el lienzo del editor** (sin
    interacción, para poder moverlo y redimensionarlo) y de forma interactiva
    en la vista previa.
  - Admite **título y pie** opcionales con sus controles de texto (tipo de
    letra, tamaño y color), igual que los campos de vídeo/audio/insertar.
  - Requiere abrir la ficha desde un sitio web (https): el *Service Worker* no
    está disponible al abrir los HTML como archivo local.
  - Limitaciones actuales: solo SCORM 1.2 (no 2004 ni secuenciamiento) y la
    sesión no se reanuda entre recargas.

### Cambiado
- **Nueva extensión `.owpkg` para los paquetes de ficha** (OpenWorksheets
  Package): la ficha nativa se guarda ahora como `.owpkg` en lugar de `.zip`. El
  formato interno no cambia (sigue siendo un ZIP con `manifest.json`), pero la
  extensión propia evita confundir el paquete de la ficha con el **ZIP de
  exportación SCORM** (que sigue siendo `.zip` porque lo exige el LMS). Al abrir
  se aceptan **tanto `.owpkg` como `.zip`**, de modo que las fichas guardadas con
  la extensión antigua siguen funcionando. Las fichas de ejemplo y los textos de
  la interfaz se actualizan en consecuencia.
- **Nueva extensión `.owsub` para el archivo de entrega del alumno**
  (OpenWorksheets Submission): la entrega se descarga ahora como `.owsub` en
  lugar de `.json`. Sigue siendo un JSON internamente, pero la extensión propia
  la identifica como archivo de OpenWorksheets. El selector de **«Abrir archivos
  de entrega»** muestra por defecto solo `.owsub`; las entregas `.json` antiguas
  se abren con «Todos los archivos» y al arrastrar y soltar (la validación es por
  el campo `formato`, no por la extensión).
- **Menú «Archivo» más claro para el profesorado**: cada opción muestra ahora un
  **subtítulo** que explica para qué sirve. Se distingue mejor *guardar* de
  *exportar*: **«Guardar ficha (.owpkg)»** (antes «Guardar ZIP») es la acción
  principal —el formato propio para compartir con el alumnado y volver a editar—
  y queda separada del grupo de **exportaciones** («Exportar a PDF» y «Exportar a
  SCORM 1.2»). «Abrir ZIP» pasa a «Abrir ficha (.owpkg)».

### Corregido
- **Respuestas legibles en el verificador de entregas y en «Copiar resumen»**:
  algunos tipos de campo mostraban identificadores internos o índices en vez de
  la respuesta del alumnado —«Huecos en documento» y «Casillas» enseñaban IDs
  como `tbmqfeix0yhn5ir`, y «Opción única/múltiple», «Desplegable», «Ordenar» y
  «Verdadero/falso» mostraban números o `true`/`false`—. Ahora la entrega guarda
  el texto legible de cada respuesta (etiquetas de las opciones, valores escritos,
  «☑ 1, 2»…), que es lo que ve el docente. Las entregas antiguas se siguen
  mostrando como antes.
- Al guardar los ajustes de la ficha desde el botón ⚙️ se lanzaba una excepción
  silenciosa en consola (`cb is not a function`); no afectaba al guardado, pero
  se ha eliminado.

## [1.8.0] — 2026-06-16

### Añadido
- **Deshacer y rehacer** en el editor: botones en la barra superior y atajos de
  teclado (Ctrl/Cmd+Z para deshacer, Ctrl/Cmd+Y o Ctrl/Cmd+Mayús+Z para rehacer).
  Los cambios rápidos se agrupan en un solo paso; abrir o reemplazar una ficha
  reinicia el historial.
- El campo **«Texto»** admite ahora **Markdown**: barra con **negrita** y
  *cursiva* (envuelven la selección), conmutador entre edición Markdown y vista
  con los efectos aplicados, y soporte de títulos, listas y enlaces. Si se pega
  Markdown, se interpreta. Mantiene color, tamaño y tipo de letra.
- El **título y el pie** de los campos de vídeo/audio/insertar admiten también
  **color y tamaño de texto** (además del tipo de letra).
- Tres **campos decorativos nuevos** (no puntúan), en el grupo «Diseño» de la
  paleta, con **título y pie opcionales**:
  - **Vídeo**: de YouTube/Vimeo (se incrusta el reproductor), enlace directo a un
    archivo o archivo subido. Opciones: controles, autoreproducir, silenciar, bucle.
  - **Audio**: archivo subido o enlace directo. Opciones: controles, autoreproducir, bucle.
  - **Insertar (Web/HTML)**: contenido externo por URL (en un iframe) o pegando su
    código de inserción/HTML tal cual (sin filtrar; bajo responsabilidad del autor).
  El contenido real se ve también en el editor (sin autorreproducir), pudiendo
  mover y redimensionar el campo por encima.
- **Tipos de letra** seleccionables para los campos con texto. Una **fuente
  global** de la ficha (en Ajustes → «Datos») se aplica a todos los campos, y
  cada campo puede elegir **otra distinta** desde su sección «Diseño» (opción
  «Igual que la ficha» para heredar la global). Catálogo de 8 familias pensadas
  por propósito: Atkinson Hyperlegible (predeterminada), Lexend (lectura fácil),
  **OpenDyslexic** (dislexia), Andika (infantil), Patrick Hand (manuscrita),
  Nunito, Lora (serif) y Monospace.
- Menú **«Archivo»** en la barra del editor: un único botón agrupa **Página en
  blanco**, **Abrir ZIP…**, **Abrir PDF o imágenes…**, **Exportar a PDF** y
  **Guardar ZIP**, en lugar de tenerlos como iconos sueltos. Se abre y cierra al
  pulsar, con clic fuera o con `Esc`. Las opciones de abrir **reemplazan** la
  ficha del editor (pidiendo confirmación si hay algo que se perdería); para
  **añadir** páginas a la ficha actual están los botones entre páginas.
- Opción **«Exportar a PDF»** en el menú Archivo, que abre el diálogo de
  impresión del navegador para guardar la ficha como PDF (mismo flujo que el
  botón Imprimir, más fácil de descubrir).

### Cambiado
- La sección **«Diseño»** del panel de campo se muestra ahora **siempre
  desplegada** (antes era un acordeón que había que abrir).
- El diálogo de **Ajustes de la ficha** se organiza ahora en **pestañas**
  (Datos · Corrección y privacidad · Restricciones de acceso), mostrando una
  sección a la vez, para que no se desborde verticalmente y los botones queden
  siempre a la vista.
- En las **fichas nuevas**, las opciones **«Mostrar la nota al alumnado al
  finalizar»** y **«Mostrar la corrección detallada»** vienen **marcadas por
  defecto**.
- La **barra superior del editor** se reorganiza en bloques separados por
  familia (Archivo · edición · ficha) con divisores sutiles, y el **selector de
  idioma** y el **tema** se mueven al extremo derecho, fuera del flujo de
  trabajo, para ganar claridad.
- El campo **Casillas** ya no muestra la sección **«Diseño»**: son casillas
  sueltas sobre la página, sin texto ni un recuadro de fondo que estilizar, así
  que esos ajustes no aplicaban.
- Los ajustes de **«Diseño»** se vuelven coherentes en todos los campos: el
  **color de texto** ahora también tiñe el texto que escribe el alumnado en las
  respuestas, y en **«Huecos en documento»** el tamaño, el color y el fondo
  pasan a aplicarse a sus huecos.

### Corregido
- Las opciones de abrir/empezar del menú **«Archivo»** solo piden confirmación
  («¿Reemplazar la ficha actual?») si hay **cambios sin guardar**. Una ficha
  recién cargada o ya guardada se reemplaza sin avisar.
- En **«Arrastrar a zonas»** en modo **recorte**, el recuadro principal de la
  «bandeja» ya no aparece: no se usa (las piezas parten del PDF y van a las
  zonas) y solo distraía. El campo sigue accesible desde la lista de campos y
  desde «volver al campo».
- El texto de ayuda de la **contraseña de acceso del alumnado** era engañoso
  («solo para abrir la ficha»): en realidad **cifra todo el contenido de la
  ficha** (páginas y respuestas correctas), así que sin ella no se puede ver
  nada. El nuevo texto lo explica y advierte de que, si se olvida, la ficha no
  se puede recuperar, y de que esa contraseña también se pedirá al **reabrir la
  ficha en el editor**.
- Al **abrir en el editor una ficha protegida** con la contraseña del alumnado,
  el mensaje que pedía la contraseña era el del alumno («…que te ha dado tu
  docente…»). Ahora muestra un texto adecuado para el profesorado.

---

## [1.7.0] — 2026-06-15

### Añadido
- Opción **«Mostrar las opciones en horizontal»** en los campos **Opción única**,
  **Opción múltiple**, **Verdadero / falso** y **Ordenar**: las opciones se
  disponen en fila y saltan a una segunda fila si no caben. Por defecto se
  mantiene la disposición vertical. En **Ordenar**, los botones de mover pasan a
  ser ◀ / ▶ cuando está en horizontal.
- La **vista previa** se abre ahora en la misma página que se está editando, en
  lugar de empezar siempre por la página 1, y al volver al editor se sitúa en la
  página que se estaba viendo en la vista previa.
- Al **abrir una ficha (ZIP)** o **añadir un PDF o imágenes**, el zoom del lienzo
  se restablece al 100 %.
- Botón **«Ver un ejemplo en el editor»** en la página principal, que abre una
  ficha de ejemplo lista para editar (vía `editor.html?ejemplo=…`, solo rutas
  relativas del propio sitio).

### Cambiado
- El botón de **vista previa** pasa de la barra superior a la barra del lienzo,
  junto al control de zoom, con icono y texto «Vista previa» y un color acorde a
  la zona de trabajo.

---

## [1.6.1] — 2026-06-15

### Corregido
- Los campos marcados para **no puntuar** ya no generan el aviso de «falta
  completar la respuesta correcta» al guardar el ZIP. El resto de campos sigue
  avisando igual que antes.

---

## [1.6.0] — 2026-06-15

### Añadido
- En el panel de un hueco, botón **«Dibujar nuevo hueco»** para añadir otro sin
  tener que volver al campo (flujo de trabajo continuo, como en «Arrastrar a
  zonas»).

### Cambiado
- Iconos de paleta más claros: **«Rellenar huecos»** (recuadro con puntos) y
  **«Respuesta numérica»** (calculadora).
- **«Rellenar huecos» unifica los dos campos de huecos.** En la paleta, en lugar
  de dos botones parecidos («Completar huecos» y «Huecos en documento»), hay una
  sola entrada **«Rellenar huecos»** que, al elegirla, pregunta cómo se quiere
  proceder antes de dibujar: *escribir un texto con huecos* o *marcar huecos
  sobre el documento*. Después, el panel indica en cada momento qué hacer. Las
  fichas ya creadas siguen funcionando igual.

---

## [1.5.0] — 2026-06-15

### Añadido
- **«Arrastrar a zonas» con modo «Recortar del PDF»**: además de escribir las
  etiquetas (modo clásico), el profesorado puede **marcar recortes del propio
  documento** (texto o imagen) dentro de cada zona. En el visor, las piezas
  parten de su sitio y, al arrastrarlas a su zona, **el origen queda vacío**
  (con color configurable). Los recortes se marcan zona a zona, conservan su
  tamaño original y se corrigen por pieza → zona.

### Corregido
- Al exportar, el ZIP incluye **solo los archivos en uso**: se descartan
  imágenes que han quedado huérfanas (p. ej. recortes de campos borrados).
- Cambiar de modo en «Arrastrar a zonas» descarta los datos del otro modo para
  que no queden colgados.

## [1.4.0] — 2026-06-15

### Añadido
- **Nuevo campo «Huecos en documento»**: para rellenar huecos que **ya existen**
  en el PDF o imagen. Se coloca un cuadro sobre cada hueco y se le asigna su
  respuesta; admite **varias respuestas válidas** por hueco, normalización de
  texto (mayúsculas, tildes, espacios) y puntuación repartida por igual.
  Corrección visual por hueco, con la solución mostrada bajo los fallados.

## [1.3.0] — 2026-06-15

### Añadido
- **Nuevo campo «Casillas de verificación»**: casillas dibujadas libremente
  sobre el documento, en modo **respuesta única** o **múltiple** (con varias
  correctas y puntuación parcial opcional). Corrección visual por casilla.
- **Ayuda contextual en la paleta**: al elegir un tipo de campo, el panel
  muestra su nombre y una breve descripción de qué hace y cómo colocarlo.

### Cambiado
- **«Arrastrar a zonas»**: cada zona tiene su propio botón-resumen en el panel
  del campo; al pulsarlo se abre el editor de esa zona (se elimina la edición de
  etiquetas separadas por comas).

## [1.2.0] — 2026-06-14

### Añadido
- **Insertar páginas** en cualquier posición y **combinar** varias fichas/ZIP.
- **Selector de tamaño de página** para las hojas en blanco e **impresión** de
  la ficha desde el editor.
- Botón **«Nueva ficha»** en la barra superior del editor.
- **Cuentagotas** para tomar colores del propio documento y más opciones de
  propiedades de los campos.

### Cambiado
- Interfaz más limpia y consistente (iconografía renovada).

## [1.1.0] — 2026-06-14

### Añadido
- **Hojas en blanco** para crear fichas desde cero (no solo sobre un PDF).
- **Copiar y pegar campos** entre páginas.

### Corregido
- En móvil y tablet, los textos y los controles de respuesta **se ajustan al
  tamaño de la página** y ya no se desbordan.

## [1.0.0] — 2026-06-13

Primera versión numerada. Consolida la aplicación de creación de fichas
interactivas y autocorregibles a partir de un PDF o una imagen.

### Añadido
- **Paleta de campos agrupada** y **formas de dibujo** (línea, flecha,
  rectángulo, elipse) para resaltar, enmarcar o señalar, con **zoom** del lienzo.
- **Nuevo campo «Unir con flechas»**: conectar elementos dibujando flechas
  sobre la página.
- **Rotación** de imágenes y textos en el editor.
- **Corrección detallada** visible para el alumnado cuando el docente la activa
  (y solo si decide no repetir el intento).
- **Cifrado de la ficha** protegida con contraseña, para proteger las soluciones.
- **Gestión de la entrega**: lista de entregas que se conserva, eliminación de
  entregas individuales, **compartir la entrega por enlace** e **imprimir / PDF**
  de la ficha entregada.
- Control de acceso por **contraseña, fecha de apertura, plazo y tiempo límite**.
- Interfaz disponible en **cinco idiomas**: español, English, català, galego y
  euskera.

---

> Antes de la 1.0.0 hubo una fase inicial de desarrollo sin número de versión, en
> la que se construyeron las bases de la aplicación (subir un PDF o imagen,
> dibujar preguntas autocorregibles, definir respuestas y puntuación, exportar la
> ficha y resolverla en el visor del alumnado con nota automática).
