# OpenWorksheets

OpenWorksheets es una aplicación web para convertir PDFs o imágenes en fichas interactivas autocorregibles, de forma parecida a TopWorksheets. El profesorado puede subir un documento, colocar encima distintos tipos de campos de respuesta y configurar las soluciones, la puntuación, las opciones de corrección y las restricciones de acceso.

## Tipos de campo

Permite crear actividades con respuestas cortas, respuestas numéricas, opción única o múltiple, verdadero/falso, desplegables, casillas de verificación, huecos, emparejamientos, ordenaciones, arrastrar a zonas y unir con flechas. También incluye elementos de diseño como texto, imágenes, líneas, flechas y formas.

## Flujo de trabajo

1. **Crear:** el profesorado sube un PDF o imagen, coloca los campos y configura las respuestas correctas y la puntuación en el editor.
2. **Compartir:** la ficha se exporta como un archivo ZIP que contiene todo lo necesario. Se sube a Google Drive u otro alojamiento público y se comparte con el alumnado mediante un enlace generado en la propia aplicación. El alumnado no tiene acceso al archivo ZIP original, lo que protege el contenido.
3. **Responder y entregar:** el alumnado responde desde el navegador y, al terminar, puede descargar un archivo de entrega (.json) o copiar un enlace directo para enviárselo al docente.

## Entregas y verificación

El docente puede abrir los archivos de entrega desde la página principal para ver la puntuación, las respuestas y comprobar automáticamente que no han sido modificados. Es posible cargar múltiples archivos a la vez o recibirlos mediante el enlace que genera el alumnado al terminar. Los resultados de toda una clase se muestran en una tabla ordenable y se pueden exportar a CSV.

Las entregas pueden cifrarse con una contraseña para que solo el docente pueda leerlas. La verificación de integridad es automática y avisa si algún archivo ha sido manipulado.

## Control de acceso

Las fichas admiten las siguientes opciones de control:

- Fecha y hora de inicio y de finalización
- Contraseña de acceso
- Tiempo límite por intento
- Número máximo de intentos
- Entrega automática al agotar el plazo
- Opción de mostrar u ocultar la nota y la corrección al alumnado

## Seguridad

OpenWorksheets ofrece un nivel de seguridad alto para el uso en el aula. El alumnado no puede acceder al archivo de la ficha y las entregas pueden cifrarse para que solo el docente pueda leerlas. No obstante, ningún sistema de este tipo es infalible y no sustituye a un sistema de examen de alta seguridad.

## Idiomas

La interfaz está disponible en español, inglés, català, galego y euskera.

## Tecnología

Funciona sin servidor, sin cuentas y sin instalaciones. Es una aplicación web estática en JavaScript vanilla, compatible con cualquier navegador moderno.

## Licencia

[AGPLv3](LICENSE) · © Juan José de Haro
