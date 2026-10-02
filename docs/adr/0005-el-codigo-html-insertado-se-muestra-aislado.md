# 5. El código HTML insertado se muestra aislado de la ficha

Fecha: 2026-10-02 · Estado: aceptado

## Contexto

El campo «Insertar (Web/HTML)», en su modo de código HTML, metía el código
pegado por el autor de la ficha directamente en la página de OpenWorksheets
(`innerHTML`), sin sanearlo. Aunque un `<script>` insertado así no se ejecuta,
sí lo hacen los atributos de evento (`onerror`, `onload`…). Ese código corría con
el origen oficial de OpenWorksheets y podía leer o cambiar lo que el navegador
guarda: los intentos, las entregas y los resultados de clase. Una ficha
preparada por otra persona bastaba para hacerlo. Lo señaló la revisión de
seguridad de julio de 2026 como hallazgo crítico.

Lo que se pega en ese modo suele ser el código de inserción de un servicio
(YouTube, Genially, H5P, Canva, mapas): uno o varios `<iframe>` de otra web, a
veces con envoltorios de tamaño o, en H5P, con un script externo que ajusta la
altura. Ese campo no puntúa: solo muestra contenido.

## Decisión

`buildEmbedHtml` (`js/render.js`) decide cómo mostrar el código:

- Si solo contiene `<iframe>` de otra web (http o https, de otro origen), con
  envoltorios sin atributos de evento y, como mucho, scripts externos sin código
  en línea, se recrean esos iframes con su dirección y sus permisos (`allow`,
  `allowfullscreen`, `title`…). Los scripts externos se descartan: el campo ya
  tiene su tamaño en la página. Al ser de otro origen, el navegador ya los aísla.
- Cualquier otro código va a un `iframe` con `srcdoc` y
  `sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads"`,
  sin `allow-same-origin`. Sus scripts se ejecutan, pero en un origen opaco, sin
  acceso a la página ni a su almacenamiento.

El aviso del editor dice ahora que el código se muestra aislado.

## Alternativas descartadas

- **Aislarlo todo en el marco con `sandbox`**: lo que va dentro hereda el
  aislamiento, y un iframe de YouTube o Genially metido en él pierde su propio
  origen y puede dejar de funcionar. Por eso los iframes de otras webs se sacan
  del marco.
- **Sanear el HTML con una biblioteca (DOMPurify)**: añade una dependencia y
  quita justo lo que algunos usuarios quieren insertar (scripts de widgets).
- **`sandbox` con `allow-same-origin`**: con `srcdoc` el contenido heredaría el
  origen de OpenWorksheets y podría quitarse el propio sandbox.

## Consecuencias

El HTML pegado deja de heredar los estilos de la aplicación. Los widgets que
necesitan su propio almacenamiento y no son un iframe de su web pueden fallar
dentro del marco aislado; para esos casos sirve el modo «Página web (URL)».

No cambia nada en SCORM, IMS CP, web en ZIP ni eXeLearning, que siguen
sirviéndose desde el mismo origen. SCORM lo necesita para encontrar
`window.API` y devolver la nota. Aislarlos de verdad exige servirlos desde otro
dominio y pasar la nota con `postMessage`; queda como trabajo pendiente.

## Evidencia

Comportamiento de `sandbox` y `srcdoc` según la especificación HTML (los
documentos `srcdoc` heredan el origen de la página salvo que el sandbox lo
convierta en opaco) y la documentación de MDN sobre el atributo `sandbox`.

## Riesgos y limitaciones

Un iframe de otra web sigue mostrando lo que esa web sirva; el aislamiento solo
impide que toque la ficha. Queda abierto el riesgo de los paquetes ZIP, ELPX,
IMS y SCORM descrito arriba.

## Validación

Prueba en Chromium y Firefox (2 de octubre de 2026): un iframe de YouTube, el
código de H5P (iframe y script de altura) y el de Genially (iframe con
envoltorios) se insertan como iframes sin `sandbox`. Un script en línea, un
`<img onerror>` y un iframe `javascript:` van al marco aislado: el script recibe
`SecurityError` al leer `parent.localStorage` y su propio `localStorage`, y el
`onerror` se ejecuta con origen `null`.
