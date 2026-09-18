#!/usr/bin/env bash
#
# Copia para a hospedagem só o que o navegador usa.
#
#     bash publicar/implantar.sh obd2        $HOME/public_html/obd2.lexinteligencia.com
#     bash publicar/implantar.sh lava-rapido $HOME/public_html/lava-rapido.lexinteligencia.com
#     bash publicar/implantar.sh obd2        /uma/pasta/vazia     # em casa: monta o pacote à mão
#
# Cada aplicativo vive na raiz do seu subdomínio, e o segundo argumento é a
# «raiz do documento» que o cPanel mostra ao criar o subdomínio.
#
# O repositório tem coisas que não são o aplicativo — testes, `package.json`,
# README, as ferramentas de ícone e de versão. Nada disso é servido, e servir
# não faria mal; o motivo de deixar de fora é outro: o que está no ar deve ser
# exatamente o que o service worker lista na casca, e nada mais. A única
# ferramenta que sobe é a ponte do adaptador Wi-Fi do Painel OBD-II, porque a
# tela de conexão manda baixá-la de junto do próprio aplicativo.
#
# A cópia é montada ao lado e depois movida, entrada por entrada, e não por
# cima da pasta viva: copiar arquivo a arquivo deixaria, por segundos, um
# `sw.js` novo ao lado de módulos velhos — e é nesse segundo que um aparelho
# pode instalar a casca. Mover uma pasta inteira é instantâneo. O que não é do
# aplicativo (o `.well-known` que o cPanel usa para renovar o certificado, por
# exemplo) não é tocado.
#
# Este arquivo é chamado pelo `.cpanel.yml` (o botão «Deploy HEAD Changes» do
# cPanel) e também serve para gerar a pasta que se envia pelo Gerenciador de
# Arquivos, quando o plano não tem o recurso de Git.

set -euo pipefail

APP="${1:-}"
DESTINO="${2:-}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$APP" in
  obd2|lava-rapido) ;;
  *) echo "uso: $0 <obd2|lava-rapido> <pasta de destino>" >&2; exit 1 ;;
esac
# Um destino vazio faria `rm -rf "/js"`. Não pode acontecer.
[ -n "$DESTINO" ] || { echo "falta a pasta de destino" >&2; exit 1; }

ORIGEM="$RAIZ/$APP"
NOVO="$DESTINO/.novo-$APP"

# O que é do aplicativo: a casca que o `sw.js` lista, mais ele próprio e o
# `.htaccess`. No OBD-II, também a ponte.
ENTRADAS=(index.html manifest.json sw.js .htaccess css icones js)
[ "$APP" = obd2 ] && ENTRADAS+=(ferramentas)

mkdir -p "$DESTINO"
rm -rf "$NOVO"
mkdir -p "$NOVO"
cp "$ORIGEM/index.html" "$ORIGEM/manifest.json" "$ORIGEM/sw.js" "$ORIGEM/.htaccess" "$NOVO/"
cp -R "$ORIGEM/css" "$ORIGEM/icones" "$ORIGEM/js" "$NOVO/"
if [ "$APP" = obd2 ]; then
  mkdir -p "$NOVO/ferramentas"
  cp "$ORIGEM/ferramentas/ponte-wifi.mjs" "$NOVO/ferramentas/"
fi

# A virada. Os módulos primeiro e o `sw.js` e o `index.html` por último: se
# alguém carregar a página no meio, recebe a casca antiga com módulos novos
# (que o worker antigo não guarda, porque a versão mudou), e não o contrário.
for entrada in css icones js ferramentas manifest.json .htaccess sw.js index.html; do
  [ -e "$NOVO/$entrada" ] || continue
  rm -rf "${DESTINO:?}/$entrada"
  mv "$NOVO/$entrada" "$DESTINO/$entrada"
done
rmdir "$NOVO"

echo "$APP → $DESTINO"

# O que ficou de fora, para quem conferir a pasta e estranhar a ausência:
#   README.md, package.json, tests/, ferramentas/ (menos a ponte, no obd2).
