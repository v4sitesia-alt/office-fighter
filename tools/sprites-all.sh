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
  --white-fx-drop 0,380,1983,722 --white-fx-keep 0,722,1983,793 --white-drop 524,604 \
  --extra $M/edgard-invocacao-bolamaligna.png --extra-scale 0.86 --extra-cuts 245,515,805,1255 --white-fx 250-335 \
  --white-erase 0,690,1536,1024 --white-erase 1003,0,1536,300 --white-erase 990,300,1536,400 --white-erase 880,0,1003,196 --white-erase 985,0,1003,226 --white-erase 980,296,1003,400 --white-erase 772,436,932,626 --white-erase 800,626,932,672
# ^ 1º extra: aura da vitória (branco é vão entre chamas; no anel do portal é brilho). 2º extra (frames 45-54): linha 1 = invocação do portal
#   (carrega as mãos, mãos no chão, agachado; o feixe com os morcegos foi APAGADO das poses 4 e 5: no jogo ele é montado por peças e nasce
#   embaixo do adversário), linha 2 = bola maligna (a bola da pose 3 sai do quadro e a pose 4, a bola voando, vira o projétil). A 3ª linha são as peças:
python3 tools/pieces.py $M/edgard-invocacao-bolamaligna.png public/fighters/edgard --scale 0.86 --fx-hue 250-335 \
  --hwall 699,368,542 --hwall 990,368,542 --hwall 990,660,830 --keep 440,702,470,988 --keep 730,900,760,988 \
  --piece portal-base.png:10,780,330,975:trim --piece feixe.png:362,702,548,988:tilev --piece feixe-topo.png:590,695,900,989:trim \
  --piece criaturas.png:925,695,1210,1000:trim --piece bola-maligna.png:930,430,1255,672:trim
run santana $M/santana-2.png --fx 388,646,463,822 \
  --extra $M/santana-golpelongo-vitoria.png --extra-scale 0.84,0.75 --white-fx 185-250 \
  --white-drop 133,342 --white-drop 1338,335 \
  --white-drop 462,640 --white-drop 465,655 --white-drop 463,677 --white-drop 473,683 --white-drop 474,706 \
  --white-drop 765,654 --white-drop 774,712 --white-drop 1057,693   # vãos: tronco/punho, linhas de velocidade, braço/vapor (3 poses)
run kevin   $M/kevin.png \
  --extra $M/kevin-golpelongo-vitoria.png --extra-scale 0.56,0.55 --white-fx 175-209 --white-core 1440,110,1660,330 \
  --white-drop 1797,539 --white-drop 265,598 \
  --extra $M/kevin-golpenovo.png --extra-rows 1 --extra-scale 0.64 --extra-cuts 280,695,1090,1612 --white-fx 175-215 --white-erase 0,440,1983,793 --white-erase 1320,100,1620,440   # escala: o board novo é mais cabeçudo (cabeça pede 0,56, altura 0,645) · miolo do estouro · vãos braço/tronco e mão/rosto
run laura   $M/laura.png --fx 397,646,429,815 \
  --extra $M/laura-golpelongo-vitoria.png --extra-scale 0.69 --white-fx 125-190 \
  --white-fx-keep 1000,150,1175,345 --white-fx-keep 1430,150,1695,350 \
  --white-drop 954,280 --white-drop 1358,314 --white-drop 1404,296 --white-drop 1401,294 \
  --white-erase 228,598,252,620 \
  --extra $M/laura-golpenovo.png --extra-rows 1 --extra-scale 0.80 --extra-cuts 300,774,1332,1812 --white-fx 160-205 --white-erase 299,100,302,680 --white-erase 773,100,776,680 --white-erase 1331,100,1334,680     # cabeça dos tubarões: branco é dente/brilho · vãos entre a mão e o tubarão · tracinho verde solto
# o board extra do Dedê chegou com o nome trocado (leo-golpelongo-vitoria.png); o usuário renomeou em 2026-09-20.
# O dourado do efeito tem o mesmo matiz da roupa marrom: o brilho mínimo (v0.74) separa os dois.
run dede    $M/dede.png --export 33:bolas.png \
  --extra $M/dede-golpelongo-vitoria.png --extra-scale 0.60,0.63 --white-fx 29-50:v0.74 \
  --white-drop 25,120,95,215 --white-drop 350,150,440,235 --white-drop 1730,125,1812,232 --white-drop 1758,258 \
  --white-drop 1181,176 --white-drop 1169,189 --white-drop 1654,209 --white-drop 1641,241 --white-drop 123,624 --white-drop 482,639 \
  --extra $M/dede-golpe-novo.png --extra-scale 0.69 --extra-cuts 330,650,1030,1525 --white-fx 18-50:v0.74   # frestas dentro do laço enrolado · entre as duas cordas · entre o punho e o cinto
# Dias: short, meia e punho são BRANCOS de verdade, então a regra se inverte: todo branco preso fica (--white-keep no board inteiro)
# e só saem, por ponto, os dois vãos debaixo do redemoinho da bola.
run dias    $M/dias.png \
  --extra $M/dias-golpelongo-vitoria.png --extra-scale 0.645 --white-fx 95-135:v0.6:s0.08 --white-fx 45-70:v0.85:s0.08 \
  --white-keep 0,0,1448,1086 --white-drop 337,434 --white-drop 348,452 \
  --extra $M/dias-golpenovo.png --extra-rows 1 --extra-scale 0.65 --extra-cuts 310,676,1028,1417 --white-fx 95-135:v0.6:s0.08 --white-fx 45-70:v0.85:s0.08 --white-keep 0,0,1774,887 --white-erase 0,500,1774,887
# Michael: roupa e efeito são do MESMO vermelho, então a cor não separa os dois. Nas poses sem chama em volta do corpo (0 e 4
# do golpe e a linha da vitória inteira) todo branco cercado de vermelho é roupa (cós, punho da luva, listra): --white-fx-keep.
# Nas poses com aura/riscos/touro o branco entre as chamas sai, e o cós do calção fica por ponto. Escala: a cabeça pede 0,84 e a
# altura 0,78 (o board novo é menos cabeçudo): 0,81.
run michael $M/michael.png \
  --extra $M/michael-golpelongo-vitoria.png --extra-scale 0.77,0.71 --white-fx 345-12:v0.6:s0.08 \
  --white-fx-keep 0,150,215,560 --white-fx-keep 1015,150,1254,560 --white-fx-keep 0,640,1254,1100 \
  --white-keep 758,418 --white-keep 623,888 --white-keep 871,894 --white-keep 94,412 --white-keep 1113,408 --white-keep 111,887 --white-keep 1129,896 --white-keep 683,1004
# Eneias: camiseta e fogo são do mesmo laranja, então o fogo fica opaco (sem matiz de efeito) e os vãos entre as chamas saem por
# retângulo, sem pegar os dentes. A linha 3 do board são as ondas de pedra (peças do projétil), não viram frame.
W_EN="--keep 0,0,1448,1086 --drop 215,90,300,445 --drop 440,90,515,445 --drop 300,90,440,180 --drop 715,280,790,480 --drop 945,280,1010,480 --drop 1190,300,1448,480 --drop 340,810,1100,1060"
run eneias  $M/thumb-eneias.png \
  --extra $M/eneias-golpenovo-vitoria.png --extra-scale 0.72 --extra-rows 3 --extra-cuts 215,508,716,1008 --white-erase 0,790,1448,1086 \
  $(echo $W_EN | sed 's/--/--white-/g')          # os nomes vieram trocados: thumb-eneias.png é o board
python3 tools/pieces.py $M/eneias-golpenovo-vitoria.png public/fighters/eneias --scale 0.72 $W_EN \
  --piece pedras.png:700,810,1100,1060 --piece pedras-p.png:350,890,670,1040
# Van: jaqueta e efeito do mesmo rosa, tênis e body brancos: todo branco preso fica. Os raios desenhados nas poses 3 e 4 saem dos
# frames (o jogo monta o raio contínuo com as peças de baixo do board); a linha 3 do board (peças) não vira frame.
run van     $M/van.png \
  --extra $M/van-golpelongo-vitoria.png --extra-scale 0.70,0.665 --extra-rows 3 --extra-cuts 290,510,784,1104 --white-fx 295-345:v0.7:s0.06 --white-keep 0,0,1536,1024 \
  --white-erase 783,0,786,420 --white-erase 1000,100,1104,420 --white-erase 1312,100,1536,420 --white-erase 0,745,1536,1024
python3 tools/pieces.py $M/van-golpelongo-vitoria.png public/fighters/van --scale 0.70 --fx-hue 295-345:v0.7:s0.06 --keep 0,0,1536,1024 \
  --piece raio-inicio.png:180,815,300,965:fadeL=14 --piece raio-meio.png:300,815,880,965:tile --piece raio-fim.png:1060,735,1365,1015
# Landim: macacão amarelo e efeito amarelo (mesmo matiz) e tênis brancos: todo branco preso fica, só saem os vãos dos redemoinhos
# das claquetes. As 4 claquetes do board viram o projétil bumerangue (tools/pieces.py) e somem dos frames.
run landim  $M/landim.png --wide 6,2 \
  --extra $M/landim-golpelongo-vitoria.png --extra-scale 0.745 --white-fx 48-66:v0.85:s0.08 \
  --white-keep 0,0,1254,1254 --white-fx-drop 460,290,1050,500 --white-erase 548,290,1050,500 --white-erase 535,420     # feixe + lente são uma pose só
python3 tools/pieces.py $M/landim-golpelongo-vitoria.png public/fighters/landim --scale 0.745 --fx-hue 48-66:v0.85:s0.08 \
  --keep 0,0,1254,1254 --fx-drop 460,290,1050,500 --piece claquete.png:792,312,948,492
run xablau  $M/xablau.png --wide 2,3 --wide 6,2
run dener   $M/dener.png --alpha 150 --grow 22
# CRM War Machine e Leo: boards principais com FUNDO BRANCO (recorte do whiteboard.py). Coordenadas em px do board.
run crm     $M/CRM-warmachine.png --axis-ignore-smoke --crop missil.png:712,1200,860,1275:erase:rot=-8 \
  --extra $M/crm-golpeespecial-vitoria.png --extra-scale 0.75,0.70 --extra-cuts 250,548,795,1143 \
  --white-erase 450,45,525,130 --white-erase 700,120,800,300 --white-erase 930,120,1110,335 --white-erase 1042,335,1110,405 --white-erase 1085,375,1448,570
# ^ o tanque (pedido do usuário); o míssil do board principal vira projétil teleguiado. Extra (frames 35-44): linha 1 = CHUVA DE BOMBAS (mira pro alto,
#   dispara, olha pra cima x2; o foguete, as bombas e os estouros saem dos quadros e viram peças), linha 2 = comemoração (o tanque se desmontando de tanto rir).
python3 tools/pieces.py $M/crm-golpeespecial-vitoria.png public/fighters/crm --scale 0.75 \
  --piece foguete.png:468,48,520,122:trim --piece bomba.png:728,216,792,296:trim --piece estouro.png:1098,384,1236,562:trim
run leo     $M/leo.png --white-erase 358,598,540,688 --white-erase 343,598,358,652 --white-erase 500,688,530,702 \
  --crop drone.png:602,1186,686,1250 --white-erase 618,1095,758,1262 --white-erase 575,1095,618,1143 --white-erase 575,1195,618,1262 \
  --extra $M/leo-golpenovo-vitoria.png --extra-scale 0.72,0.68 --extra-cuts 255,548,895,1172 --white-erase 895,225,1172,525
# ^ o raio do olho sai do frame (vira o raio contínuo abaixo) · o drone vira projétil. Extra (frames 35-44): linha 1 = tiro de escopeta (o estouro da
#   pose 4 sai do quadro e vira a peça do impacto), linha 2 = comemoração (engatilha a arma pro alto).
python3 tools/pieces.py $M/leo-golpenovo-vitoria.png public/fighters/leo --scale 0.72 --piece estouro-tiro.png:895,225,1172,525:trim
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

# Monstro do Mundim (metamorfose, 2º round): board completo de 35 poses + a sequência da transformação como extra (frames 35-44, 10 quadros).
# A transformação é desenhada pelo jogo com altura por quadro (src/game/morph.ts), então o extra entra numa escala só.
run monstro $M/mundim-metamorfose-movimentos.png \
  --white-drop 618,267 --white-drop 158,336 --white-drop 723,482 --white-drop 445,518 --white-drop 823,611 --white-drop 842,606 --white-drop 960,800 --white-drop 898,941 --white-drop 262,1153 --white-drop 273,1138 --white-drop 372,1121 --white-drop 717,1147 --white-drop 735,1136 --white-drop 650,1255 --white-drop 690,1280 --white-drop 893,1255 \
  --extra $M/mundim-metamorfose.png --extra-scale 0.6 \
  --white-drop 61,924 --white-drop 283,941 --white-drop 510,949 --white-drop 709,919 --white-drop 803,958 --white-drop 839,1087 --white-drop 25,1185 --white-drop 490,1110 --white-drop 1093,1178   # vãos brancos presos entre garras, pernas e cabos (o monstro não tem branco de verdade)

# Peças dos especiais novos (2026-09-20): raio duplo do canhão do Kevin (início, trecho que se repete, estouro) e a moeda do escudo do Dias.
python3 tools/pieces.py $M/kevin-golpenovo.png public/fighters/kevin --scale 0.64 --fx-hue 175-215 --wall 835,500,720 --wall 1175,500,720 \
  --piece canhao-inicio.png:498,470,790,750:fadeR=10 --piece canhao-meio.png:836,470,1174,750:tile --piece canhao-fim.png:1635,470,1965,750
python3 tools/pieces.py $M/dias-golpenovo.png public/fighters/dias --scale 0.65 --keep 0,500,1774,887 --piece moeda.png:138,522,208,612:trim
