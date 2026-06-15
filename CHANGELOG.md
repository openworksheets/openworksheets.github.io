# Registro de cambios

Todas las novedades destacables de OpenWorksheets, por versión.

El formato sigue, a grandes rasgos, [Keep a Changelog](https://keepachangelog.com/es-ES/),
y el proyecto usa [versionado semántico](https://semver.org/lang/es/).
Las versiones publicadas también están en la página de
[Releases](https://github.com/openworksheets/openworksheets.github.io/releases).

---

## [1.7.0] — 2026-06-15

### Añadido
- Opción **«Mostrar las opciones en horizontal»** en los campos **Opción única**,
  **Opción múltiple**, **Verdadero / falso** y **Ordenar**: las opciones se
  disponen en fila y saltan a una segunda fila si no caben. Por defecto se
  mantiene la disposición vertical. En **Ordenar**, los botones de mover pasan a
  ser ◀ / ▶ cuando está en horizontal.
- La **vista previa** se abre ahora en la misma página que se está editando, en
  lugar de empezar siempre por la página 1.

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
