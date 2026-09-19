#!/bin/sh
# Regera o atlas de todos os lutadores a partir dos boards em Personagens/. Uso: sh tools/sprites-all.sh [pasta-debug]
set -e
M=Personagens/Mais-movimentos; D=${1:-}
run() { id=$1; src=$2; shift 2; python3 tools/sprites.py "$src" public/fighters/$id "$@" ${D:+--debug $D/$id.png}; }
# Board extra (<id>-golpelongo-vitoria.png, fundo branco): linha 8 = golpe longo (frames 35-39), linha 9 = vitória (40-44).
# --extra-scale foi medido pela cabeça contra o board principal (os boards não vêm na mesma escala). Os pontos/retângulos
# --white-* são correções do recorte conferidas no zoom, em px do board original (ver tools/whiteboard.py).
run edgard  $M/edgard-2.png \
  --extra $M/edgard-golpelongo-vitoria.png --extra-scale 0.71 --white-fx 250-335 \
  --white-fx-drop 0,380,1983,722 --white-fx-keep 0,722,1983,793      # aura da vitória: branco é vão entre chamas; no anel do portal é brilho
run santana $M/santana-2.png --fx 388,646,463,822 \
  --extra $M/santana-golpelongo-vitoria.png --extra-scale 0.92 --white-fx 185-250 \
  --white-drop 133,342 --white-drop 1338,335 \
  --white-drop 462,640 --white-drop 465,655 --white-drop 463,677 --white-drop 473,683 --white-drop 474,706   # vãos: tronco/punho, linhas de velocidade, braço/vapor
run kevin   $M/kevin.png \
  --extra $M/kevin-golpelongo-vitoria.png --extra-scale 0.60 --white-fx 175-209 --white-core 1440,110,1660,330 \
  --white-drop 1797,539 --white-drop 265,598   # escala: o board novo é mais cabeçudo (cabeça pede 0,56, altura 0,645) · miolo do estouro · vãos braço/tronco e mão/rosto
run laura   $M/laura.png --fx 397,646,429,815 \
  --extra $M/laura-golpelongo-vitoria.png --extra-scale 0.75 --white-fx 125-190 \
  --white-fx-keep 1000,150,1175,345 --white-fx-keep 1430,150,1695,350 \
  --white-drop 954,280 --white-drop 1358,314 --white-drop 1404,296 --white-drop 1401,294 \
  --white-erase 228,598,252,620     # cabeça dos tubarões: branco é dente/brilho · vãos entre a mão e o tubarão · tracinho verde solto
run dede    $M/dede.png --export 33:bolas.png
run dias    $M/dias.png
run michael $M/michael.png
run eneias  $M/thumb-eneias.png          # os nomes vieram trocados: thumb-eneias.png é o board
run van     $M/van.png
run landim  $M/landim.png --wide 6,2     # feixe + lente são uma pose só
run xablau  $M/xablau.png --wide 2,3 --wide 6,2
run dener   $M/dener.png --alpha 150 --grow 22
run mundim  $M/mundim.png --alpha 130 --grow 40 --export 33:garrafas.png   # board com brilho suave ligando as poses
