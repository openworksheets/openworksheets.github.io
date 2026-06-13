# Google Apps Script

OpenWorksheets no usa el codigo de `gas/Code.gs` en produccion.

El despliegue configurado en `../config.js` corresponde al Google Apps Script
del proyecto Visor Web-ZIP:

`/home/jjdeharo/Documentos/github/visor-webzip.github.io/gas/Code.js`

OpenWorksheets reutiliza ese despliegue para:

- Descargar ZIPs publicos mediante el protocolo `bundle=1`.
- Generar enlaces cortos con `?short=1&url=...`.
- Resolver enlaces cortos con `?short=TOKEN`.

El archivo `Code.gs` se conserva solo como referencia historica/minima. Si hay
que modificar o desplegar el GAS real, debe hacerse en el repositorio
`visor-webzip.github.io`.
