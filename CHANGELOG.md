# Registro de cambios

Todas las novedades destacables de OpenWorksheets, por versión.

El formato sigue, a grandes rasgos, [Keep a Changelog](https://keepachangelog.com/es-ES/),
y el proyecto usa [versionado semántico](https://semver.org/lang/es/).
Las versiones publicadas también están en la página de
[Releases](https://github.com/openworksheets/openworksheets.github.io/releases).

---

## [1.24.1] — 2026-06-24

### Añadido
- **Aviso de carga lenta en el visor del alumnado**: si la apertura de la ficha se alarga (más de ~10 segundos, p. ej. con fichas grandes o conexión lenta), la pantalla de carga muestra un aviso discreto pidiendo paciencia y que no se cierre la página. No aparece cuando la carga es rápida.

## [1.24.0] — 2026-06-24

### Añadido
- **Continuidad del intento tras recargas accidentales**: el visor del alumnado guarda en el navegador no solo las respuestas, sino también el estado del intento en curso (inicio del tiempo, incidencias de supervisión y cierre forzado si ya se alcanzó el límite). Si la pestaña se recarga o se cierra por error, la ficha puede reabrirse y continuar en el mismo punto, sin reiniciar temporizador ni contador de incidencias.
- **Caché local de la ficha del alumnado**: al abrir una ficha desde enlace o desde archivo local `.owpkg`, el navegador conserva una copia en `IndexedDB` para poder recuperarla tras una recarga accidental sin volver a descargarla.

### Cambiado
- **Apertura preferente desde copia local**: si una ficha del alumnado ya estaba guardada en el navegador, OpenWorksheets la abre primero desde esa copia para reducir esperas y mejorar la tolerancia a fallos de red. Después comprueba en segundo plano si la versión remota ha cambiado y, si detecta una versión nueva, avisa para recargar.
- **Comprobación de versión sin descargar la ficha**: la detección de versión nueva usa ahora validadores HTTP ligeros (`ETag`/`Last-Modified`/tamaño) mediante una petición `HEAD`, en lugar de volver a descargar el archivo completo para compararlo byte a byte. Solo se descarga la ficha cuando esos validadores confirman un cambio real, lo que evita tráfico innecesario en el aula y los avisos falsos al reexportar una ficha sin cambios.
- **Intentos y progreso por alumno en el mismo navegador**: el visor guarda ahora un perfil independiente por alumno (nombre + grupo) dentro de cada ficha, en lugar de un único estado compartido. En un equipo de aula compartido, cada persona tiene su propio recuento de intentos, su corrección y su última entrega, y empezar como otra persona ya no queda bloqueado porque la anterior agotara sus intentos. La pantalla de inicio actualiza los intentos restantes y el aviso de progreso guardado según el nombre que se escribe. El estado anterior (formato único por ficha) se migra automáticamente.

### Corregido
- **Apertura con almacenamiento bloqueado**: si el navegador no permite usar `IndexedDB` (modo privado, restricciones del centro…), la lectura de la copia local ya no impide abrir la ficha; OpenWorksheets degrada con normalidad a la descarga remota en lugar de mostrar un error de apertura.
- **Actualización durante un intento en curso**: la comprobación de versión remota ya no avisa de una versión nueva mientras el alumnado tiene un intento activo, evitando que recargar para abrirla descarte el progreso (respuestas, temporizador e incidencias).
- **Intento heredado en equipos compartidos**: si en el mismo navegador entra una persona distinta de la que dejó un intento a medias, ahora se inicia un intento limpio. Solo se reanudan el temporizador, las respuestas y las incidencias de supervisión cuando coincide el nombre de quien continúa, evitando que un alumno herede el reloj o el contador de incidencias de otro.
- **Caché local sin crecimiento ilimitado**: la copia local de fichas en `IndexedDB` se poda automáticamente; se conservan como mucho las 25 fichas más recientes y se descartan las que llevan más de 60 días sin usarse, para no acumular fichas indefinidamente en equipos de aula compartidos.

### Documentado
- **Ámbito de la mejora**: el caché local y la comprobación de versión remota afectan al visor oficial del enlace del alumnado (`alumno.html`, incluido su uso incrustado con `embed=1`). La reanudación del intento tras recarga afecta también a las exportaciones que reutilizan `player.js` (web autónoma, IMS CP y paquete SCORM), aunque en esas exportaciones no existe comprobación de actualización remota de la ficha empaquetada.
- **Límite de la comprobación de versión**: solo se realiza cuando el origen de la ficha expone validadores HTTP accesibles (servidor propio, GitHub Pages…). En orígenes servidos por proxy, como Google Drive, no hay validadores accesibles por CORS, por lo que no se comprueba la versión para no descargar la ficha entera en segundo plano; en esos casos basta con volver a abrir el enlace para obtener la versión más reciente.

### Pruebas
- **Verificación en navegador real (Chromium headless)**: el visor del alumnado (`test_player.html`) pasa con el nuevo estado por alumno —identificación, autoguardado, nota, reintento, código de entrega, corrección, plazos, contraseña y cronómetro—. La exportación a web autónoma (`test_webexport.html`) genera el paquete con el visor y la ficha empaquetada reabrible. Una prueba *end to end* adicional genera el paquete web, lo extrae, lo sirve y abre su `index.html` real: identificación, relleno, autoguardado por perfil de alumno, entrega y cierre del intento (intentos contabilizados y entrega registrada) funcionan correctamente.

## [1.23.0] — 2026-06-23

### Mejorado
- **Diálogo de compartir del editor**: input URL y botón «Generar enlace» ahora aparecen en la misma fila (igual que en la pantalla de inicio), con label y aviso de tamaño debajo del campo; anchura aumentada a 680 px para que todos los puntos de la lista quepan en una línea.
- **Instrucciones de compartir más claras**: tanto en la pantalla de inicio como en el modal del editor, los textos explican mejor que el enlace final generado es el que debe compartirse con el alumnado para abrir la ficha y completar los ejercicios.
- **Mensajes de supervisión más directos**: los avisos al alumnado sobre salir de la pestaña o de la pantalla completa se han simplificado y armonizado en los cinco idiomas, con una redacción más clara para norma, aviso y cierre forzado.

### Cambiado
- **Enlaces para el alumnado sin índice externo**: la generación de enlaces compartibles deja de depender del archivo `shortlinks.json` y pasa a usar un formato autocontenido y opaco (`?d=...`) que no necesita servidor ni almacenamiento adicional. Se mantiene compatibilidad con enlaces antiguos `?s=` y `?z=`.

### Corregido
- **Aviso de supervisión**: el mensaje al salir de la pestaña/ventana/pantalla completa ya no dice «quedará registrada en la entrega» cuando el modo es solo aviso (`warn`); esa frase aparece únicamente en modo registro (`record`).
- **Salida de pantalla completa**: al cerrar el aviso de supervisión ya no se encadenan dos incidencias visibles por una sola salida; la reentrada en pantalla completa vuelve a producirse sin mostrar el mismo mensaje dos veces.
- **Ajustes de supervisión**: la opción «Entregar automáticamente tras este número de incidencias» solo se muestra cuando el profesorado ha activado el control de pantalla completa y ha elegido avisar o registrar incidencias, evitando configuraciones incoherentes.

## [1.22.0] — 2026-06-23

### Añadido
- **Diálogo de compartir reorganizado con pestañas**: el resultado (enlace,
  código QR e iframe) se organiza en tres pestañas (Enlace / Código QR /
  Incrustar) en ambos diálogos —pantalla de inicio y editor—. Las instrucciones
  se muestran siempre visibles encima del campo de URL.
- **«Otras formas de compartir y distribuir»**: acordeón discreto bajo el botón
  «Generar enlace» que da acceso a los formatos de exportación sin enlace externo.
  En el **editor** muestra botones clicables para exportar directamente a
  **Web (ZIP)**, **SCORM 1.2** e **IMS CP**; en la **pantalla de inicio** muestra
  los mismos formatos como información, indicando que hay que abrir la ficha en el
  editor para acceder a ellos. El estilo reutiliza el de los items del menú
  principal (icono + título + descripción con separador).
- **Código QR en la pantalla de inicio**: el diálogo «Generar enlace» de la
  pantalla de inicio genera ahora también un código QR (con zoom para proyectar
  en clase), igual que el diálogo del editor.
- **Aviso de URL única**: ambos diálogos de compartir (pantalla de inicio y editor)
  advierten claramente que cada generación produce una URL diferente, y piden
  guardar el enlace, el QR o el iframe antes de cerrar.
- **Estilo del enunciado en Respuesta larga y Grabación de voz**: el panel de
  configuración de estos dos campos incluye ahora controles para personalizar el
  enunciado: **negrita**, **color**, **alineación** y **tamaño** (control
  deslizante + número, igual que el tamaño del texto en otros campos). Los cambios
  se aplican en tiempo real en el lienzo.
- **Código para incrustar la ficha (iframe)**: en el modal de compartir —tanto el
  del **editor** como el de la **pantalla de inicio**—, junto al enlace del
  alumnado, aparece ahora un **código `<iframe>` listo para pegar** en un blog o
  página web. Reutiliza el enlace generado añadiéndole `embed=1`, un modo del
  visor que oculta la barra superior. La altura es configurable e incluye los
  permisos `fullscreen` y `microphone`.
- **Aviso del límite de Google Drive**: en el diálogo de compartir del editor,
  bajo el campo de URL, aparece un aviso informando de que Google Drive limita
  la descarga directa a unos 20 MB y sugiriendo Dropbox o Nextcloud para
  fichas más grandes. El aviso está localizado en los cinco idiomas disponibles
  (es, en, ca, gl, eu).

### Cambiado
- **Acordeón «Otras formas de compartir y distribuir» con animación suave**: la apertura y el cierre del acordeón ya no son bruscos; se anima con una transición CSS de 0,28 s usando `grid-template-rows`.
- **Separador entre páginas rediseñado**: los botones de añadir página que
  aparecían entre cada par de páginas del editor se reemplazan por una línea
  fina con un botón circular «+» que solo es visible al pasar el ratón. Al
  hacer clic se despliega un menú con las cuatro opciones (PDF/imagen, paquete,
  hoja en blanco, IA). La barra de añadir del final del documento mantiene su
  diseño original con los botones siempre visibles.

### Eliminado
- **Botones «Soy alumno/a» y «Abrir ficha»** de la cabecera de la pantalla de
  inicio.

## [1.21.0] — 2026-06-21

### Añadido
- **Imagen de fondo importable en las páginas**: en la configuración de página, un
  botón **«Importar imagen o PDF…»** permite poner una imagen de fondo sobre
  cualquier página (en blanco o importada) con cuatro **modos de ajuste**:
  *mantener proporción*, *cubrir*, *estirar* y *mosaico*, más un control de
  **opacidad**. Así se puede combinar un **tamaño de página controlado** (A4,
  carta, libre) con una imagen de fondo, antes imposible en las hojas en blanco.
  Si se importa un **PDF de varias páginas**, se muestra un **selector de
  miniaturas** para elegir cuál usar de fondo (útil para insertar una hoja suelta
  de un PDF tras un cambio puntual en el original). La imagen se reajusta sola al
  cambiar el tamaño de la página y se guarda y exporta con la ficha.
- **Crear ficha con ayuda de IA** (menú «Archivo → Crear con IA…», botón en la
  pantalla inicial del editor y opción «entre páginas» para insertar páginas
  generadas en una ficha ya empezada): un asistente de 3 pasos que **genera un
  prompt** a partir de un formulario (tema, nivel, idioma, nº de preguntas y tipos
  permitidos), el profesor lo **copia y lo pega en la IA que prefiera** (Claude,
  ChatGPT, Gemini…) y luego **pega la respuesta** (JSON), que OpenWorksheets
  valida e importa creando la ficha con los campos colocados automáticamente.
  Las páginas se crean **en blanco**; el color o la imagen de fondo se ajustan
  después desde la configuración de página.
  **No realiza ninguna llamada externa ni usa APIs**: todo es copiar/pegar manual,
  para preservar la independencia de la herramienta. Soporta texto, numérico,
  fórmula, verdadero/falso, opción única/múltiple, desplegable, respuesta larga,
  huecos, tabla, emparejar y ordenar.
- **Página «Características»** (`caracteristicas.html`): descripción completa para
  el profesorado organizada en 13 bloques temáticos (crear fichas, tipos de
  pregunta, corrección automática, fórmulas LaTeX, multimedia e interactivos,
  exportar y compartir, entregas, control de acceso y supervisión, privacidad y
  seguridad, idiomas y accesibilidad, software libre, **creación con IA** y
  **¿qué diferencia a OpenWorksheets?**), con traducciones a los 5 idiomas de la
  aplicación. Enlazada desde la barra superior y el pie de la página de inicio.

### Mejorado
- **Web pública de OpenWorksheets**: se reforzó el mensaje diferencial de la
  portada y de la página **«Características»** en los 5 idiomas de la
  aplicación. Ahora se destaca mejor que OpenWorksheets es **software libre**,
  que las fichas **se pueden guardar, editar y exportar** sin quedar atrapadas
  en una plataforma cerrada, la compatibilidad con **SCORM 1.2 para Moodle**,
  la **privacidad y el cifrado** y el uso de **IA por copia/pega sin proveedor
  impuesto**. Además, la portada añade un icono al botón «Características» y la
  página de características separa mejor los bloques de privacidad, edición y
  diferenciación.
- **Página «Características»:** el bloque «¿Qué diferencia a OpenWorksheets?»
  usa ahora un icono de distinción (medalla), coherente con el resto de iconos
  del sitio, en lugar del icono de código que no encajaba con su contenido.
- **READMEs (ES, EN, CA):** la sección de corrección de texto ya no menciona
  «Huecos en documento» como campo separado; se indica que «Rellenar huecos»
  cubre ambos modos, reflejando la unificación de v1.6.0.
- **Mensaje «sin páginas» en el editor** (`editor.noFieldDescNoPages`): ya no
  dice «botón superior» (inexacto desde el rediseño del menú Archivo en v1.8.0)
  ni omite la hoja en blanco; ahora indica abrir un PDF, imagen o hoja en blanco
  desde el menú «Archivo». Actualizado en los 5 idiomas.
- **Campo Fórmula:** al pulsar el botón «fx» con una fórmula ya escrita en el
  campo (sin seleccionarla), EdiCuaTeX se abre precargando todo su contenido para
  editarlo directamente, sin tener que seleccionarlo antes. Aplica tanto al editor
  (fórmulas aceptadas que escribe el profesor) como al campo que rellena el alumno.

---

## [1.20.0] — 2026-06-20

### Añadido
- **Semáforo de seguridad** en la barra del editor: un escudo con una barra de
  tres segmentos que indica de un vistazo qué protecciones tiene la ficha. La
  contraseña de acceso del alumnado suma un segmento y el cifrado de las entregas
  (contraseña del profesor) suma dos, porque protege los datos reales del
  alumnado. Va de rojo (sin protección) a verde (ambas activas), con un detalle
  emergente; al pulsarlo abre **Ajustes → Privacidad y seguridad**. Se puede
  ocultar desde esos mismos ajustes.
- **Aviso al exportar a SCORM** si la ficha contiene campos de **corrección
  manual** que puntúan (respuesta larga o grabación de voz): el LMS no puede
  corregirlos, así que contarían como 0 y no se podría alcanzar la nota máxima.
  Solo aparece si la ficha lleva alguno de esos campos.
- **Aviso al exportar a IMS CP**: se informa al profesor de que, al insertar el
  paquete en un LMS (Moodle, etc.), el enlace de entrega solo funciona si el
  profesor está autenticado en esa plataforma, y se recomienda la entrega por
  archivo `.owsub` para mayor fiabilidad.

### Corregido
- La validación al exportar ya no marca un falso **«sin respuesta correcta»** en
  el campo **Respuesta larga** (es de corrección manual, como la grabación de voz).
- El diálogo de aviso de supervisión ya **no cuenta como incidente adicional**:
  mientras el aviso está visible, los eventos de foco o pantalla completa quedan
  suspendidos, evitando que pulsar «Aceptar» generara un segundo incidente.

---

## [1.19.0] — 2026-06-20

### Añadido
- **Campo «Fórmula»**: respuesta corta autocorregible en la que el alumnado
  escribe una fórmula matemática o química con el editor visual **EdiCuaTeX**
  (botón «fx») y ve su representación renderizada debajo del campo en tiempo
  real. La corrección compara el LaTeX ignorando espacios y delimitadores (las
  mayúsculas sí cuentan) y admite varias respuestas aceptadas.
- **Campo «Respuesta larga»**: texto extenso que **corrige el profesor** al
  revisar la entrega (queda «pendiente», como la grabación de voz). Incluye una
  pequeña barra de formato (**negrita**, *cursiva*, enlaces) y el botón «fx»
  para insertar fórmulas con EdiCuaTeX, con **vista previa** renderizada
  (Markdown + LaTeX) mientras se escribe, **contador de palabras** y **límite de
  palabras** opcional fijado por el profesor. En la corrección, el docente ve la
  respuesta ya renderizada y le pone la nota. Incluye un **botón de ayuda (?)**
  que explica con ejemplos qué hace cada botón, sin tecnicismos, y el profesor
  puede **ocultar el botón «fx»** por campo cuando no haga falta.
- El **botón de fórmulas (EdiCuaTeX)** está ahora disponible también para el
  alumnado (en los campos «Fórmula» y «Respuesta larga») y en el **editor de
  tabla a pantalla completa**, además del panel del editor.
- El ajuste de ficha **«Habilitar fórmulas matemáticas (LaTeX)»** (antes
  «Mostrar el botón para insertar fórmulas») actúa ahora como **interruptor
  global**: al desactivarlo desaparece todo lo relacionado con fórmulas —el campo
  «Fórmula» en la paleta, el botón «fx» en todos los campos y la opción por campo
  de la «Respuesta larga»— para que las materias sin fórmulas no muestren nada de
  LaTeX al alumnado. Incluye un texto explicativo en Ajustes.
- **Control durante la realización (supervisión)**: nueva sección en Ajustes →
  Privacidad y seguridad para **mantener la pantalla completa** mientras el
  alumnado hace la ficha, **registrar** salidas de la pestaña/ventana/pantalla
  completa en la entrega y, opcionalmente, **entregar automáticamente** tras un
  número de incidencias. Las opciones de qué hacer al salir y de entrega
  automática solo aparecen al activar el control de pantalla completa.
- **Aviso de supervisión en la pantalla de inicio** del alumnado: antes de
  empezar, se informa de las reglas de vigilancia según lo que el profesor haya
  configurado, **sin revelar cuántas salidas** fuerzan el envío. Así el alumnado
  sabe a qué atenerse.
- **Marca de supervisión en la tabla de entregas**: las entregas con incidencias
  de vigilancia se **destacan con la fila resaltada y un icono 👁** con el
  recuento, para que el profesorado las revise.
- La tabla de entregas indica con un **distintivo ámbar** las que tienen
  respuestas **pendientes de corrección manual** (grabación de voz o respuesta
  larga), antes solo un punto gris poco visible para las grabaciones.
- En Ajustes → Privacidad y seguridad, si el **cifrado de entregas está activado
  pero falta la contraseña**, aparece un **asterisco rojo** en la etiqueta de la
  contraseña y en el título de la pestaña, para no pasar por alto que hay que
  rellenarla.

### Cambiado
- Los avisos de **vigilancia** al alumnado (salir de la pantalla completa y
  alcanzar el límite de salidas) pasan de ser un *toast* efímero abajo a un
  **aviso centrado en pantalla que permanece hasta que el alumnado lo cierra**,
  para que no pase desapercibido.
- El **diálogo de ajustes** es algo más ancho y con desplazamiento para que los
  textos largos no se salgan de la pantalla.
- El tooltip del botón de ajustes se simplifica a **«Configuración de la ficha»**.

### Corregido
- La **vista previa** ahora **cifra la entrega de prueba** cuando el cifrado de
  entregas está activado (antes el par de claves solo se generaba al exportar, así
  que la entrega de la previa salía sin cifrar y su enlace se abría sin pedir
  contraseña). Ahora la previa refleja el comportamiento real.

### Documentación
- **README traducido al inglés**: el `README.md` principal pasa a estar en inglés para mayor visibilidad internacional en GitHub. El contenido en español se conserva en `README.es.md`.

---

## [1.18.0] — 2026-06-19

### Añadido
- **Fórmulas LaTeX en todos los campos de texto**: cualquier texto de la ficha
  (título, instrucciones, campo «Texto», opciones, encabezados y celdas de tabla,
  etc.) renderiza fórmulas escritas con `\(…\)` (en línea) y `\[…\]` (en bloque):
  fracciones, matrices, integrales, flechas, química (`\ce{…}`) y demás. Usa
  MathJax con salida SVG, que se carga solo cuando hay fórmulas y funciona sin
  conexión, también en los paquetes SCORM y en la exportación a web.
- **Aviso en la página inicial** que destaca el soporte de fórmulas matemáticas
  y químicas, con ejemplos renderizados.
- **Tipos de celda en «Tabla editable»**: cada celda puede ser de **texto** o de
  **número** (se corrige por valor, admite coma o punto decimal). Convierte la
  tabla en un mini-formulario didáctico, útil para biología, matemáticas,
  idiomas, economía, física o tecnología.
- **Celdas desplegables**: junto a «Ejemplo visible», una casilla **«Convertir en
  desplegable»** ofrece al alumnado las varias respuestas de la celda como
  opciones de un desplegable, y un selector marca cuál es la correcta (el resto
  son distractores). Si la ficha tiene activado «barajar opciones», el orden se
  mezcla.
- **Tolerancia numérica por celda**: en las celdas de tipo número se puede fijar
  un margen de acierto (±), igual que en «Respuesta numérica». Muy práctico en
  matemáticas y ciencias.
- **Pegar desde una hoja de cálculo (en un solo paso)**: un botón sobre la tabla
  lee el portapapeles e importa directamente el contenido copiado de Calc, Sheets
  o Excel (separado por tabuladores) o de un CSV (`;` o `,`), ajustando el tamaño
  de la tabla. El contenido pegado **reemplaza por completo** el de la tabla y, si
  están activados los encabezados de columna y/o de fila, la primera fila y/o la
  primera columna pegadas se usan como encabezados. Si el navegador no permite
  leer el portapapeles, aparece un cuadro de reserva para pegar a mano.
- **Borrar filas y columnas y vaciar la tabla**: en la configuración, cada fila
  y cada columna tienen un botón ✕ para eliminarla, y un botón **«Vaciar tabla»**
  borra todo el contenido para empezar de cero conservando el tamaño.
- **Editar la tabla a pantalla completa**: botón **«Editar a pantalla completa»**
  que abre el mismo editor de la tabla en un diálogo que aprovecha todo el ancho
  y alto de la ventana, con columnas más anchas y desplazamiento horizontal,
  para trabajar con comodidad en tablas grandes que no caben en el panel lateral.
- **Corrección por filas o por columnas**: además de la corrección celda a celda
  (por defecto), la tabla puede puntuar por **filas completas** o **columnas
  completas** —la fila o columna solo suma si todas sus celdas son correctas—,
  útil para ejercicios de clasificación.

### Corregido
- En la página inicial, al desplegar **«Seguridad y privacidad»** su contenido
  podía quedar por debajo del borde inferior; ahora el título se lleva a la vista
  al abrirlo. Reducido también el espacio sobrante entre ese bloque y el pie.

## [1.17.3] — 2026-06-19

### Añadido
- **Tabla editable con celdas de ejemplo**: el profesorado puede marcar algunas
  celdas para que se muestren ya resueltas al alumnado como ejemplo. Esas
  celdas no se pueden editar y no cuentan en la puntuación.
- **Varias respuestas válidas por celda en «Tabla editable»**, con el mismo
  esquema que en «Respuesta corta»: una respuesta principal y alternativas, más
  las opciones de normalización (ignorar tildes, mayúsculas y espacios).

### Documentación
- El README aclara que **se pueden crear fichas desde una hoja en blanco**, sin
  necesidad de cargar antes un PDF o una imagen.
- Añadida explicación de cuándo conviene usar **alternativas de respuesta** y
  cuándo basta con las opciones de normalización.

## [1.17.2] — 2026-06-19

### Añadido
- **La columna de configuración (derecha) se puede ocultar**, igual que la tira
  de páginas y con el mismo icono de chevrons. No es permanente: cada ficha
  (nueva o abierta) arranca con el panel desplegado.
- **Controles simétricos**: el botón de plegar de cada columna va en su borde
  interior (mirando al lienzo) y los botones para reabrirlas aparecen centrados
  verticalmente en el borde de cada lado, de forma especular.

---

## [1.17.1] — 2026-06-19

### Cambiado
- **La fuente elegida (global o por campo) ya se ve en el modo edición**, no solo
  en la vista previa: el texto que muestra el lienzo —la etiqueta de cada campo,
  los chips de respuesta de «Huecos en documento», zonas e «Unir con flechas», y
  el enunciado de «Completar huecos»— se dibuja con la tipografía seleccionada.
- **«Completar huecos» muestra ahora su enunciado en el lienzo** (con sus
  `[huecos]`), antes solo aparecía la etiqueta del campo.

---

## [1.17.0] — 2026-06-19

### Cambiado
- **Panel de propiedades de los campos reorganizado**: ahora todos los tipos de
  campo comparten el mismo armazón de secciones, en este orden: **Puntuación ·
  Contenido · Tamaño y posición · Estilo**. Antes el orden y el agrupamiento
  variaban según el tipo y los botones de acción aparecían en mitad del panel.
- **Acciones (Duplicar / Eliminar) siempre al final** del panel, separadas del
  contenido, de forma coherente en todos los paneles.
- **La rotación** pasa a vivir dentro de la sección «Tamaño y posición».
- **Estilo separado del contenido en «Texto» y en los medios** (vídeo, audio,
  «Insertar», SCORM): el tamaño de texto, el tipo de letra, el color, la
  alineación y el marco se muestran ahora en la sección «Estilo», como en el
  resto de campos, en lugar de mezclados con el contenido.
- **Bloque «color + opacidad» unificado** (fondo del campo, «Tapar zona» y
  relleno de formas): mismo aspecto y comportamiento en todos los sitios.
- **Etiquetas más cortas y cabeceras más ligeras** para reducir el ruido visual
  (p. ej. «Color del texto» / «Color de fondo» en lugar de «… del campo»).

---

## [1.16.4] — 2026-06-19

### Corregido
- **Tamaño de página**: el selector de unidad ya no se solapa con el texto del
  tamaño; la etiqueta «Unidad» y el desplegable van en su propia línea.

---

## [1.16.3] — 2026-06-19

### Añadido
- **Tamaño de página en distintas unidades**: en las propiedades de página se
  puede elegir la unidad (cm, mm, pulgadas o px) para ver y editar el ancho y el
  alto. La preferencia se recuerda. En las páginas importadas el tamaño se
  muestra como información (no se redimensionan para no deformar el escaneo).

### Notas
- La conversión a unidades físicas es aproximada: internamente el tamaño se
  guarda en píxeles a una resolución de referencia (A4 = 1600 px ≈ 193 dpi).

---

## [1.16.2] — 2026-06-19

### Añadido
- **Opacidad de la imagen de fondo de la página**: en la configuración de página,
  un control deslizante (con casilla en %) permite atenuar la imagen importada
  (PDF/imagen) para usarla como marca de agua y resaltar los campos de encima.
- **Color de fondo de página para todas las páginas**: el selector de color, que
  antes solo aparecía en las páginas en blanco, ahora está disponible también en
  las páginas importadas. Es el color que asoma al transparentar la imagen.

---

## [1.16.1] — 2026-06-19

### Añadido
- **Opacidad para el campo «Tapar zona»**: un control deslizante permite hacer
  el rectángulo semitransparente, de modo que se intuya lo que hay debajo en
  lugar de ocultarlo por completo.

### Cambiado
- **Los controles de opacidad se pueden escribir como porcentaje**: junto al
  deslizante (tapar zona, relleno de formas y fondo del campo) hay ahora una
  casilla numérica con el valor en % para introducirlo con precisión.

---

## [1.16.0] — 2026-06-18

### Añadido
- **Desplazar la ficha ampliada arrastrando el fondo** con el ratón (pan),
  además de las barras de desplazamiento. El cursor cambia a «mano» cuando hay
  zona oculta y no interfiere con la edición de campos.
- **Escribir el porcentaje de zoom a mano**: clic derecho sobre el indicador de
  zoom lo convierte en un campo editable (Enter aplica, Escape cancela).

### Cambiado
- **El zoom del editor llega hasta el 500 %** (antes 300 %); el tooltip recuerda
  que también se cambia con **Ctrl + rueda del ratón**.
- **Los controles de vista previa y zoom permanecen fijos** en la esquina
  superior derecha al desplazar la ficha en cualquier dirección.
- **La tira de miniaturas se muestra u oculta al añadir o borrar páginas**, al
  pasar de una sola página a varias y viceversa.

---

## [1.15.0] — 2026-06-18

### Añadido
- **Campo «Polígono»**: forma decorativa regular con número de lados configurable
  (3–20): triángulo, rombo, pentágono, hexágono… Comparte borde, estilo, relleno
  con opacidad y rotación. Opción **«Mantener regular»** (conserva la forma) o
  deformarse para llenar la caja.
- **Tamaño exacto de los campos**: nueva sección «Tamaño» con anchura y altura en
  porcentaje de la página (2 decimales), editable por teclado además de con el
  ratón. En los campos con subelementos se aplica a la casilla, hueco, zona o
  item seleccionado.
- **Rotación en las formas de diseño** (línea/flecha, rectángulo, polígono y
  elipse): manija para girar con el ratón y campo numérico con botones
  −90°/+90°/0°, igual que en imagen y texto.

### Cambiado
- **«Línea» y «Flecha» se unifican** en un solo campo «Línea / Flecha» con una
  opción de **puntas de flecha**: ninguna (línea), una o dos. Las fichas con
  flechas anteriores se siguen viendo y se migran de forma transparente.
- **Cambiar el idioma en el editor ya no recarga la página**: la interfaz se
  re-traduce en caliente, conservando la ficha en curso y los cambios sin
  guardar.
- **La tira de miniaturas se muestra u oculta según el número de páginas** al
  abrir una ficha (visible con más de una, oculta con una sola). El colapso
  manual ya no se guarda entre sesiones.

---

## [1.14.0] — 2026-06-18

### Añadido
- **Tira de miniaturas de páginas** (estilo presentación), a la izquierda del
  lienzo: muestra todas las páginas en miniatura. Permite **navegar** (clic en
  una miniatura desplaza el lienzo a esa página), **reordenar** las páginas
  arrastrando y soltando, **minimizar/ocultar** la tira (estado recordado entre
  sesiones; arranca colapsada) y **redimensionar** tanto la tira como el panel
  de configuración arrastrando sus divisores.
- **Menús contextuales (clic derecho)** en toda la zona de edición:
  - Sobre una **miniatura**: copiar, cortar, pegar, duplicar, eliminar página y
    ajustes de la ficha.
  - Sobre un **campo**: copiar, cortar, duplicar, pegar, eliminar y ajustes.
  - Sobre el **fondo de una página**: pegar campo, duplicar página, eliminar
    página y ajustes.
  - En el **área del lienzo** junto a las páginas: pegar página, nueva hoja en
    blanco y ajustes.
- **Atajos de teclado para páginas**: con una miniatura enfocada, Ctrl+C, Ctrl+X,
  Ctrl+V, Ctrl+D y Supr copian, cortan, pegan, duplican y borran páginas.
- **Menú «Utilidades»** en la barra superior con:
  - **Buscar campo** (Ctrl+K): búsqueda insensible a mayúsculas y acentos sobre
    todos los campos de la ficha.
  - **Estadísticas de la ficha**: número de páginas, campos por tipo y campos con
    o sin corrección automática, con botones para copiar e imprimir/PDF.
  - **Vista previa** (Ctrl+Shift+E).
- **Filtro de búsqueda** en la lista «Campos de la ficha» del panel, con lupa y
  botón para limpiar.
- **Exportación a IMS Content Package 1.1.4** desde el menú «Exportar como…», e
  **importación de paquetes IMS CP** como modo del campo «Insertar (Web/HTML)»,
  con menú de navegación a partir del manifiesto.
- **Submenú «Exportar como…»** en el menú Archivo, que agrupa las exportaciones
  (PDF, SCORM 1.2, IMS CP y web ZIP).
- **«Ajustes de la ficha»** accesible también desde el menú Archivo.
- **Guardar conservando el nombre y la carpeta de origen**: al abrir una ficha en
  navegadores compatibles (Chrome/Edge), «Guardar ficha» reescribe el mismo
  archivo; en el resto propone su nombre original. Nueva opción **«Guardar ficha
  como…»** para elegir nombre y ubicación.
- **Atajo Ctrl+Shift+X** para imprimir/exportar a PDF.

### Cambiado
- Los botones **«Archivo»** y **«Utilidades»** tienen aspecto de barra de menú
  (planos, con flecha desplegable).
- Al **guardar** la ficha se descartan automáticamente los archivos huérfanos
  (paquetes o medios de campos eliminados).
- Las flechas de **mover página** se desactivan en los extremos (la primera no
  puede subir, la última no puede bajar).

### Corregido
- El submenú «Exportar como…» ya no se cierra al desplazar el ratón hacia él.
- Visibilidad de los botones «Archivo» y «Utilidades» en modo oscuro.

---

## [1.13.0] — 2026-06-18

### Añadido
- **Ficha de ejemplo en euskera** (`ejemplos/openworksheets-erako-adibide-fitxa.owpkg`):
  traducción completa de la ficha de prueba con sus imágenes en euskera. Al
  seleccionar el idioma **EU** en la portada, el enlace «Ver un ejemplo» abre ya
  esta ficha. Cubre todos los tipos de campo del editor (respuesta corta y
  numérica, huecos, opción única y múltiple, casillas, verdadero/falso,
  desplegable, emparejar, ordenar, arrastrar a zonas y unir con flechas).
- **Ficha de ejemplo en gallego** (`ejemplos/ficha-de-exemplo-para-openworksheets.owpkg`):
  traducción completa de la ficha de prueba con sus imágenes en gallego, enlazada
  al idioma **GL** de la portada. Cubre todos los tipos de campo del editor.
- **Alineación del campo «Texto»**: el elemento de texto libre permite ahora
  alinear el contenido a la izquierda, al centro, a la derecha o justificado,
  desde su panel de configuración. Se refleja en el editor, el visor y las
  exportaciones a web y SCORM.
- **Alineación del título y el pie en los campos multimedia** (vídeo, audio,
  insertar web/HTML y SCORM): su título y pie de texto se pueden alinear a la
  izquierda, al centro o a la derecha. Estos textos siguen vacíos por defecto.

### Cambiado
- En **respuesta corta** y **respuesta numérica**, al marcar «No contar para la
  puntuación» se ocultan los ajustes que solo sirven para corregir (respuestas
  aceptadas, tolerancia e ignorar mayúsculas/tildes/espacios), ya que no aplican
  cuando el campo no puntúa.

### Corregido
- El icono de **«Exportar a SCORM 1.2»** del menú *Archivo* ahora coincide con el
  del campo SCORM de la paleta (mismo icono de paquete), por consistencia.

### Cambiado
- **El botón «Crear una ficha» de la portada pasa a ser «Abrir ficha»** (con icono
  de carpeta): permite elegir un paquete `.owpkg` y abrirlo directamente en el
  editor para seguir editándolo, sin pasar por el editor vacío. (Para empezar una
  ficha nueva siguen estando el botón *Abrir el editor* y el menú *Archivo* del
  editor.)

---

## [1.12.0] — 2026-06-17

### Corregido
- El espacio entre el texto introductorio y las fichas de la portada ahora es igual al espacio entre las fichas y el apartado «Seguridad y privacidad».

### Cambiado
- **Pantalla de inicio más simple y clara**: la portada se reduce ahora a tres
  pasos —*Crea*, *Comparte* y *Revisa las entregas*—, cada uno con su botón. La
  autocorrección instantánea se menciona dentro de *Comparte* (ya no ocupa una
  tarjeta propia) y *Revisa las entregas* sustituye al antiguo paso 4.
- **Generar enlace** se abre ahora en un **modal** (con botón de cierre y cierre
  al pulsar fuera o con Esc), dejando la portada despejada.
- **Ver y verificar entregas** pasa a su **propia página** (`entregas.html`), que
  ocupa todo el ancho y tiene su botón *Volver al inicio*, en lugar de un modal.
  El arrastrar y soltar de archivos `.owsub` sigue disponible y los enlaces de
  entrega del alumnado (`#e=…`, que apuntan a `index.html` por compatibilidad)
  se redirigen automáticamente a esta página.
- **La corrección de la web exportada es ahora la misma página** que la del
  programa principal: los paquetes «Exportar a web» incluyen una copia de
  `entregas.html` (sin la analítica ni el `config.js` del autor, y sin el botón
  «Volver al inicio», que ahí no tiene destino), y al abrir un enlace de entrega
  (`#e=…`) o `#corregir` el visor redirige a ella. Antes la exportación mostraba
  un panel propio, parecido pero distinto.
- **El detalle de una entrega ya no se abre solo**: al añadir entregas solo se
  actualiza la tabla de resultados. El detalle (respuestas pregunta a pregunta)
  aparece únicamente al **pulsar una fila** y se cierra con su botón **✕**.
- **Aviso de seguridad y privacidad de la portada**: ahora es un **desplegable**
  (candado «Seguridad y privacidad») que no ocupa espacio hasta pulsarlo. Explica
  que **no se envía ningún dato a servidores externos ni a terceros** (todo ocurre
  en el navegador) y describe las **dos contraseñas** —la de acceso del alumnado,
  que cifra el contenido de la ficha, y la del profesorado, que cifra las entregas
  para que solo el docente pueda leerlas y no se puedan interceptar ni modificar—,
  recomendando usar al menos la del profesorado. Cada contraseña indica además su
  ubicación exacta en el editor (Ajustes → Restricciones de acceso, y Ajustes →
  Corrección y privacidad).

## [1.11.0] — 2026-06-17

### Añadido
- **Panel de corrección de clase en la web exportada autónoma**: al abrir un
  enlace de entrega (`#e=…`) en una ficha publicada en tu propio sitio, ya no se
  ve solo esa entrega: aparece un panel donde se van **acumulando** las entregas
  en una tabla con **resumen** (media y aprobados) y **exportación/copia de CSV**,
  igual que en la web oficial. Se pueden **pegar varios enlaces** (uno por línea)
  o abrir archivos `.owsub`, y la lista se guarda por sitio. Con `#corregir` se
  abre el panel vacío para empezar a pegar enlaces.
  - El render del verificador y el panel de clase se han extraído a módulos
    compartidos (`verifyview.js`, `classview.js`), usados por la página de inicio
    y por la web exportada.

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
