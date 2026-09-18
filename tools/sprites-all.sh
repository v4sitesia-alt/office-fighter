#!/bin/sh
# Regera o atlas de todos os lutadores a partir dos boards em Personagens/. Uso: sh tools/sprites-all.sh [pasta-debug]
set -e
M=Personagens/Mais-movimentos; D=${1:-}
run() { id=$1; src=$2; shift 2; python3 tools/sprites.py "$src" public/fighters/$id "$@" ${D:+--debug $D/$id.png}; }
run edgard  $M/edgard-2.png
run santana $M/santana-2.png --fx 388,646,463,822
run kevin   $M/kevin.png
run laura   $M/laura.png --fx 397,646,429,815
run dede    $M/dede.png --export 33:bolas.png
run dias    $M/dias.png
run michael $M/michael.png
run eneias  $M/thumb-eneias.png          # os nomes vieram trocados: thumb-eneias.png é o board
run van     $M/van.png
run landim  $M/landim.png --wide 6,2     # feixe + lente são uma pose só
run xablau  $M/xablau.png --wide 2,3 --wide 6,2
run mundim  $M/mundim.png --alpha 130 --grow 40 --export 33:garrafas.png   # board com brilho suave ligando as poses
