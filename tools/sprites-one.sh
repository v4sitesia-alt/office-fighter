#!/bin/sh
# Roda só UM lutador do tools/sprites-all.sh. Uso: sh tools/sprites-one.sh <id> [pasta-debug]
set -e
ID=$1; M=Personagens/Mais-movimentos; D=${2:-}
run() { id=$1; src=$2; shift 2; if [ "$id" = "$ID" ]; then python3 tools/sprites.py "$src" public/fighters/$id "$@" ${D:+--debug $D/$id.png}; fi; }
python3() { case "$*" in *"public/fighters/$ID"*|*"public/fighters/$ID "*) command python3 "$@";; *) :;; esac; }
eval "$(sed -n '/^run /,$p' tools/sprites-all.sh)"
