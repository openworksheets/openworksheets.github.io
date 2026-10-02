#!/usr/bin/env bash
# Pasa todas las pruebas del repositorio y termina con un resumen.
# Uso, desde la raíz del proyecto: bash tests/run_all.sh
#
# Levanta un servidor en el puerto 8765 (el que esperan las pruebas) y lo
# cierra al acabar. Si el puerto ya está ocupado, no lo toca y se detiene.
# Sale con error si falla alguna prueba.
cd "$(dirname "$0")/.." || exit 1

if ss -ltn 2>/dev/null | grep -q ':8765 '; then
  echo "El puerto 8765 está ocupado: ciérralo antes de pasar las pruebas." >&2
  exit 1
fi
python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 &
SERVIDOR=$!
REGISTROS=$(mktemp -d)
trap 'kill $SERVIDOR 2>/dev/null' EXIT
sleep 1

FALLAN=()
pasar() {
  local nombre=$1; shift
  if "$@" >"$REGISTROS/$nombre.log" 2>&1; then
    echo "OK     $nombre"
  else
    echo "FALLA  $nombre  (detalle en $REGISTROS/$nombre.log)"
    FALLAN+=("$nombre")
  fi
}

for html in tests/test_*.html; do
  pasar "$(basename "$html" .html)" node tests/run_headless.js "$html"
done
for js in tests/run_*.js tests/check_*.js; do
  nombre=$(basename "$js" .js)
  [ "$nombre" = run_headless ] && continue
  pasar "$nombre" node "$js"
done

echo
if [ ${#FALLAN[@]} -eq 0 ]; then
  echo "Todas las pruebas pasan."
  rm -rf "$REGISTROS"
else
  echo "Fallan ${#FALLAN[@]}: ${FALLAN[*]}"
  exit 1
fi
