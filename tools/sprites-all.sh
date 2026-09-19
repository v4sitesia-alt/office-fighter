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
  --white-drop 462,640 --white-drop 465,655 --white-drop 463,677 --white-drop 473,683 --white-drop 474,706 \
  --white-drop 765,654 --white-drop 774,712 --white-drop 1057,693   # vãos: tronco/punho, linhas de velocidade, braço/vapor (3 poses)
run kevin   $M/kevin.png \
  --extra $M/kevin-golpelongo-vitoria.png --extra-scale 0.60 --white-fx 175-209 --white-core 1440,110,1660,330 \
  --white-drop 1797,539 --white-drop 265,598   # escala: o board novo é mais cabeçudo (cabeça pede 0,56, altura 0,645) · miolo do estouro · vãos braço/tronco e mão/rosto
run laura   $M/laura.png --fx 397,646,429,815 \
  --extra $M/laura-golpelongo-vitoria.png --extra-scale 0.75 --white-fx 125-190 \
  --white-fx-keep 1000,150,1175,345 --white-fx-keep 1430,150,1695,350 \
  --white-drop 954,280 --white-drop 1358,314 --white-drop 1404,296 --white-drop 1401,294 \
  --white-erase 228,598,252,620     # cabeça dos tubarões: branco é dente/brilho · vãos entre a mão e o tubarão · tracinho verde solto
# o board extra do Dedê veio com o nome trocado (leo-golpelongo-vitoria.png): é o gaúcho das boleadeiras.
# O dourado do efeito tem o mesmo matiz da roupa marrom: o brilho mínimo (v0.74) separa os dois.
run dede    $M/dede.png --export 33:bolas.png \
  --extra $M/leo-golpelongo-vitoria.png --extra-scale 0.70 --white-fx 29-50:v0.74 \
  --white-drop 25,120,95,215 --white-drop 350,150,440,235 --white-drop 1730,125,1812,232 --white-drop 1758,258 \
  --white-drop 1181,176 --white-drop 1169,189 --white-drop 1654,209 --white-drop 1641,241 --white-drop 123,624 --white-drop 482,639   # frestas dentro do laço enrolado · entre as duas cordas · entre o punho e o cinto
run dias    $M/dias.png
# Michael: roupa e efeito são do MESMO vermelho, então a cor não separa os dois. Nas poses sem chama em volta do corpo (0 e 4
# do golpe e a linha da vitória inteira) todo branco cercado de vermelho é roupa (cós, punho da luva, listra): --white-fx-keep.
# Nas poses com aura/riscos/touro o branco entre as chamas sai, e o cós do calção fica por ponto. Escala: a cabeça pede 0,84 e a
# altura 0,78 (o board novo é menos cabeçudo): 0,81.
run michael $M/michael.png \
  --extra $M/michael-golpelongo-vitoria.png --extra-scale 0.81 --white-fx 345-12:v0.6:s0.08 \
  --white-fx-keep 0,150,215,560 --white-fx-keep 1015,150,1254,560 --white-fx-keep 0,640,1254,1100 \
  --white-keep 758,418 --white-keep 623,888 --white-keep 871,894 --white-keep 94,412 --white-keep 1113,408 --white-keep 111,887 --white-keep 1129,896 --white-keep 683,1004
run eneias  $M/thumb-eneias.png          # os nomes vieram trocados: thumb-eneias.png é o board
run van     $M/van.png
run landim  $M/landim.png --wide 6,2     # feixe + lente são uma pose só
run xablau  $M/xablau.png --wide 2,3 --wide 6,2
run dener   $M/dener.png --alpha 150 --grow 22
# CRM War Machine e Leo: boards principais com FUNDO BRANCO (recorte do whiteboard.py). Coordenadas em px do board.
run crm     $M/CRM-warmachine2.png --axis-ignore-smoke --wide 6,3 --crop missil.png:900,1140,1100,1216:erase:rot=-12 \
  --white-erase 1000,1300 --white-erase 900,1255,935,1295 --white-drop 297,1202 --white-drop 312,1201   # míssil vira projétil · some o mecha pequeno da última célula · miolo da mira é vão
run leo     $M/leo.png --white-erase 358,598,540,688 --white-erase 343,598,358,652 --white-erase 500,688,530,702 \
  --crop drone.png:602,1186,686,1250 --white-erase 618,1095,758,1262 --white-erase 575,1095,618,1143 --white-erase 575,1195,618,1262   # o raio do olho sai do frame (vira o raio contínuo abaixo) · o drone vira projétil
# Raio contínuo do Leo (extensao-raio-leo.png): início (cortado onde o cone tem a altura do trecho do meio e sumindo na emenda),
# trecho do meio que se repete e estouro final. Escala 0,55 = a pose dessa folha casada com o frame 16 do board.
# As paredes fecham as pontas cortadas retas, senão o miolo branco do raio vai embora com o fundo.
python3 tools/pieces.py $M/extensao-raio-leo.png public/fighters/leo --scale 0.55 --fx-hue 0-62 --fx-hue 340-360 \
  --wall 595,440,600 --wall 649,450,575 --wall 1131,450,575 --keep 300,484,600,532 --keep 645,496,1135,525 \
  --piece raio-inicio.png:257,436,412,561:fadeL=8:fadeR=12 --piece raio-meio.png:650,448,1131,573:tile --piece raio-fim.png:1165,376,1430,645
# Mundim: board novo (2026-09-19) com FUNDO BRANCO. O rosa do efeito tem o matiz da gravata: brilho mínimo (v0.7) separa os dois,
# e a saturação baixa (s0.08) faz o rosa bem claro da borda contar como efeito. Branco dentro do efeito só é brilho no disco de
# magia e na aura (linhas 3 e 4); nos rastros de chute e nas garrafas (y >= 830) é vão entre os riscos. O resto são vãos entre
# braço e corpo conferidos no zoom. Os rótulos brancos das garrafas ficam.
run mundim  $M/mundim.png --export 33:garrafas.png --white-fx 318-354:v0.7:s0.08 \
  --white-drop 950,445,1015,500 --white-drop 765,481 --white-fx-drop 0,830,1122,1402 \
  --white-drop 906,929 --white-drop 930,946 --white-drop 969,945 --white-drop 1050,902 --white-drop 1063,887 \
  --white-drop 300,99 --white-drop 502,100 --white-drop 708,100 --white-drop 958,103 --white-drop 116,388 --white-drop 549,723 \
  --white-drop 751,834 --white-drop 96,1080 --white-drop 452,1226 --white-drop 769,1056 --white-drop 1049,1070 --white-drop 1081,1064 \
  --white-drop 992,1070 --white-drop 554,950
# Juiz (robô das bandeiras): 4 linhas x 5 poses, fundo branco. Os vãos entre o braço levantado e o corpo são fundo.
python3 tools/sprites.py $M/juiz-sprite.png public/referee --cols 5 --rows 4 ${D:+--debug $D/juiz.png} \
  --white-drop 933,393 --white-drop 1198,393 --white-drop 1001,665 --white-drop 649,935 --white-drop 744,934 --white-drop 1200,937 --white-drop 1275,938 --white-drop 1269,671 --white-drop 1274,664
