#!/bin/sh
# ColorScan Auto — inicia um servidor local e abre o navegador.
# A câmera exige http://localhost (contexto seguro); abrir o index.html
# direto (file://) não funciona.
cd "$(dirname "$0")" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 não encontrado. Instale em https://python.org"
  exit 1
fi

echo "Servidor iniciado. Deixe este terminal aberto enquanto usa o app."
echo "Abrindo http://localhost:8765 ..."
( sleep 1
  if command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:8765
  elif command -v open >/dev/null 2>&1; then open http://localhost:8765
  fi ) &
python3 -m http.server 8765
