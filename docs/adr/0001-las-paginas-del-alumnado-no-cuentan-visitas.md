# 1. Las páginas del alumnado no cuentan visitas

Fecha: 2026-09-23 · Estado: sustituido por [ADR 2](0002-openworksheets-no-cuenta-visitas.md)

## Contexto

OpenWorksheets cuenta visitas con el sistema propio de estadísticas de
bilateria.org (`js/analytics.js`): sin IP ni cookies, una visita por navegador
cada media hora. El contador estaba en todas las páginas, también en las dos
que maneja el alumnado o sus datos: `alumno.html`, donde se hace la ficha, y
`entregas.html`, donde el profesorado abre lo que entrega el alumnado.

Al evaluar la aplicación con la rúbrica de la «Guía para publicar materiales
educativos creados con vibe coding» salieron dos problemas:

- El contador enviaba la dirección completa (`page_url`). En `alumno.html` la
  dirección lleva el enlace de la ficha, y en `entregas.html` puede llevar la
  entrega entera en `#e=…`, con el nombre del alumno o la alumna si no está
  cifrada. Cuando está cifrada, el `#e=` sigue en la dirección mientras se pide
  la contraseña.
- La vista del alumnado no mostraba ningún aviso de estadísticas.

## Decisión

- `alumno.html` y `entregas.html` no cargan el contador.
- En las demás páginas (portada, editor y Características), el contador envía
  solo la página (`origin + pathname`), sin parámetros ni `#`, y no cuenta la
  visita si la portada se abre con un enlace de entrega (`#e=…`).
- El aviso de privacidad del pie dice que las páginas del alumnado y la de
  entregas no recogen estadísticas.

Las exportaciones (web, IMS CP y SCORM) ya quitaban el contador y siguen igual.

## Alternativas descartadas

- **Dejar el contador en todas las páginas y recortar solo lo que envía.**
  Elimina el riesgo de la entrega, pero sigue contando al alumnado sin que se
  le avise, y la rúbrica lo penaliza igualmente.
- **Quitar el contador de toda la aplicación.** Se pierde la única manera de
  saber cuánto se usa el editor. Queda como opción si se quiere la nota máxima
  en datos personales, porque la rúbrica da un 0 a cualquier analítica.

## Consecuencias

- Las cifras ya no incluyen las fichas que hace el alumnado ni las entregas
  abiertas, solo el uso del profesorado en la portada y el editor.
- Una página nueva que use el alumnado no debe cargar `js/analytics.js`.
- El panel de estadísticas recibe la página sin parámetros: ya no distingue,
  por ejemplo, qué ficha de ejemplo se abrió en el editor.
