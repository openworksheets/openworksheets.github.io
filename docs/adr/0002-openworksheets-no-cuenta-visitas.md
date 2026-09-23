# 2. OpenWorksheets no cuenta visitas

Fecha: 2026-09-23 · Estado: aceptado

## Contexto

El [ADR 1](0001-las-paginas-del-alumnado-no-cuentan-visitas.md) quitó el
contador de visitas de las páginas del alumnado y de entregas, pero lo dejó en
la portada, el editor y Características. La rúbrica de la «Guía para publicar
materiales educativos creados con vibe coding» pone un 0, eliminatorio, en
datos personales a cualquier recurso que lleve analítica, aunque sea propia y
sin IP ni cookies. Con un contador en cualquier página, la aplicación salía
«No recomendable».

## Decisión

La aplicación no lleva ningún contador de visitas ni estadísticas de uso. Se
borra `js/analytics.js` y los metadatos `analytics-*` de todas las páginas. El
aviso de privacidad del pie dice que no se cuentan visitas ni se usan cookies.

## Alternativas descartadas

- **Mantener el contador solo en las páginas del profesorado** (ADR 1). Deja
  la aplicación con un 0 en datos personales según la rúbrica que se usa para
  evaluarla.

## Consecuencias

- No hay cifras de uso de OpenWorksheets. Si algún día se necesitan, habrá que
  buscar una vía que no cuente como analítica o aceptar esa nota.
- El registro de la aplicación en el panel de estadísticas de bilateria.org
  deja de recibir visitas; queda allí sin uso.
- Las exportaciones (web, IMS CP) ya no necesitan filtrar el contador; la
  prueba `tests/test_webexport.html` sigue comprobando que no aparece.
