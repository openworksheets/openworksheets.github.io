# 6. Al abrir un ZIP se comprueban unos topes antes de descomprimirlo

Fecha: 2026-10-02 · Estado: aceptado

## Contexto

Las fichas (`.owpkg`) y los paquetes que se insertan en ellas (SCORM, IMS CP,
web en ZIP y `.elpx`) son archivos ZIP que el programa descomprimía enteros en
memoria, sin ningún tope. Un archivo enorme, o uno preparado para inflarse al
descomprimirse (un «ZIP bomba»: unos cientos de kilobytes que ocupan cientos de
megas o gigas), podía colgar la pestaña del docente o del alumnado. Lo señaló
la revisión de seguridad de julio de 2026.

Una ficha real puede ser grande: las de ejemplo pesan unos 9 MB y un paquete de
eXeLearning con vídeos puede llegar a cientos de megas. Los topes no deben
afectar a ninguna de ellas.

## Decisión

`loadZipSafely` (`js/zipio.js`) abre el ZIP con JSZip y, antes de descomprimir
nada, comprueba con los tamaños que declara el propio archivo:

- como mucho 50 000 archivos;
- como mucho 2 GB descomprimido en total;
- que no ocupe más de 200 MB descomprimido con una compresión de más de 100 a 1,
  la forma típica de un ZIP bomba (las imágenes y los vídeos apenas se
  comprimen, y el texto y el HTML lo hacen unas 10 veces).

Después suma lo que se extrae de verdad y para si pasa de los 2 GB, por si el
archivo declara tamaños falsos. Se descartan las rutas absolutas, con `..` o con
barras invertidas. Si algo no se cumple, el programa no abre el archivo y dice
por qué, en el idioma de la interfaz. La usan la apertura de fichas (visor del
alumnado, editor, paquetes exportados) y las cuatro subidas de paquetes del
editor.

## Alternativas descartadas

- **Topes bajos, por ejemplo 100 MB**: frenarían fichas legítimas con vídeo o
  paquetes de eXeLearning grandes.
- **Dejar que el usuario cambie los topes**: solo frenan archivos dañados o
  hostiles, que nadie quiere abrir; un ajuste más complicaría la interfaz.

## Consecuencias

Una ficha de más de 2 GB descomprimida o con más de 50 000 archivos no se abre;
no se conoce ninguna así, y el navegador probablemente no podría con ella.

## Evidencia

`_data.uncompressedSize` de cada entrada de JSZip 3.10.1 da el tamaño declarado
sin descomprimir (es una propiedad interna, no documentada: si una versión
futura la quita, la comprobación previa se queda en 0 y solo queda la suma de
lo extraído). JSZip ya normaliza las rutas con `..` al cargar el archivo.

## Riesgos y limitaciones

Un ZIP que mienta en su tamaño declarado se descomprime entrada a entrada hasta
llegar a los 2 GB: frena la acumulación, pero no el pico de memoria de una sola
entrada enorme.

## Validación

Prueba en Chromium y Firefox (2 de octubre de 2026): un ZIP de 300 KB con
300 MB de ceros se rechaza al abrirlo como ficha y al subirlo como `.elpx` en el
editor, con el aviso de archivo sospechoso; uno con 60 001 archivos se rechaza
con el aviso del número de archivos; las cinco fichas de ejemplo y un `.elpx`
real de 10 MB se abren como antes, y las pruebas de HTML del repositorio pasan.
