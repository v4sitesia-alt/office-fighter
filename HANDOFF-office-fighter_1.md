# Handoff — Office Fighter (jogo de luta 2D, web)

Documento de passagem pro Claude Code. Contém escopo, stack, especificação de assets, arquitetura de arquivos e o prompt inicial pra colar lá.

Referência de estilo: `https://stf.fepache.co/` (fighting game arcade 90s, roda no navegador, teclado + toque).

---

## 1. Escopo da v1

**Entra:**

- Tela de título → seleção de lutador → luta → resultado → próxima fase → tela final
- 4 lutadores (personagens do escritório, tema: Designer / Atendimento / Diretor / Tráfego)
- Campanha de 3 lutas contra CPU, dificuldade selecionável (fácil / normal / difícil)
- Combate: andar, pular, agachar, defender, soco, chute, golpe forte, 1 especial por lutador
- Barras de vida, barra de especial (enche batendo e levando dano), timer de 60s, contador de round (melhor de 1 na v1)
- Controles: teclado + botões de toque no mobile
- Sprites externos, carregados de arquivo — nada desenhado por código

**Não entra na v1 (backlog):**

- Multiplayer local (2 jogadores no mesmo teclado) — arquitetura já prevê, mas não expõe na UI
- Combos/cancels, throws, juggle
- Som e trilha
- Mais de 4 lutadores

**Nota de conteúdo:** os personagens são caricaturas produzidas pelo usuário (Edgard/design). Nomes reais do time nos lutadores é escolha do usuário. Nada de uso de imagem de terceiros sem consentimento.

---

## 2. Stack decidida

- **Vite + TypeScript**, Canvas 2D puro. Sem engine.
- Sem framework de UI: as telas (título, seleção, resultado) são DOM/HTML sobrepostos ao canvas — mais fácil de estilizar e acessível; o canvas cuida só da luta.
- Resolução interna fixa **960×540**, escalada por CSS com `image-rendering: pixelated`. Toda a lógica trabalha em coordenadas de 960×540, independente do tamanho da tela.
- Loop com **passo fixo de 60fps** (acumulador). Jogo de luta precisa de frame data determinística — não usar delta variável na lógica de combate.
- Deploy: build estático (`vite build`) → qualquer host (Vercel/Netlify/Pages).

**Por que não Phaser:** o valor de um fighting game está na frame data e nas hitboxes, não na física. Phaser adiciona peso e abstrações que atrapalham o controle frame-a-frame. Canvas 2D + ~400 linhas de engine próprio resolve.

---

## 3. Especificação de assets (o que o Edgard produz)

### 3.1 Sprite sheet

- **Formato:** PNG com transparência, um arquivo por lutador.
- **Frame:** `320 × 320 px`, grid horizontal, sem padding entre frames.
- **Personagem no frame:** ~280px de altura, **pés colados na borda de baixo do frame**, centralizado horizontalmente no eixo do corpo. Consistência de ancoragem entre frames é crítica — se o personagem "flutuar" em alguns frames, o jogo treme.
- **Direção:** todos os frames olhando para a **direita**. O jogo espelha por código quando o lutador virar.
- **Organização:** uma animação por linha. Linha = animação, coluna = frame.
- **Escala entre lutadores:** todos na mesma proporção. Um lutador "grande" pode ocupar mais do frame, mas a unidade de medida é a mesma.

### 3.2 Animações necessárias (11)

| # | Nome | Frames | Loop | Observação |
|---|------|--------|------|-----------|
| 0 | `idle` | 6 | sim | respiração/guarda |
| 1 | `walk` | 8 | sim | tocada ao contrário quando andando pra trás |
| 2 | `jump` | 6 | não | 2 subida, 2 ápice, 2 descida |
| 3 | `crouch` | 2 | não | 1 transição, 1 mantido |
| 4 | `block` | 2 | não | 1 em pé, 1 agachado |
| 5 | `punch` | 5 | não | frame de impacto na pose mais estendida |
| 6 | `kick` | 6 | não | idem |
| 7 | `heavy` | 8 | não | golpe forte, antecipação longa |
| 8 | `special` | 10 | não | pose de especial; o efeito/projétil é separado |
| 9 | `hit` | 3 | não | tomando dano |
| 10 | `ko` | 6 | não | último frame fica congelado no chão |
| 11 | `win` | 8 | sim | pose de vitória |

**Extra por lutador:**

- `portrait.png` — 256×256, busto, pra tela de seleção
- `special_fx.png` (opcional) — sheet 128×128, 6 frames, do projétil/efeito do especial

### 3.3 Nomenclatura e pasta

```
public/fighters/<id>/
  sheet.png
  portrait.png
  special_fx.png      (opcional)
  fighter.json
```

`<id>` em kebab-case, sem acento: `designer`, `atendimento`, `diretor`, `trafego`.

### 3.4 `fighter.json` — contrato

```json
{
  "id": "designer",
  "name": "Edgard",
  "role": "O Designer",
  "colors": { "primary": "#ff2e88", "secondary": "#21e6ff" },
  "stats": { "speed": 1.15, "power": 0.9, "weight": 1.0 },
  "frame": { "w": 320, "h": 320 },
  "hurtbox": { "x": -46, "y": -250, "w": 92, "h": 250 },
  "anims": {
    "idle":    { "row": 0,  "frames": 6,  "fps": 8,  "loop": true },
    "walk":    { "row": 1,  "frames": 8,  "fps": 12, "loop": true },
    "jump":    { "row": 2,  "frames": 6,  "fps": 10, "loop": false },
    "crouch":  { "row": 3,  "frames": 2,  "fps": 12, "loop": false },
    "block":   { "row": 4,  "frames": 2,  "fps": 12, "loop": false },
    "punch":   { "row": 5,  "frames": 5,  "fps": 16, "loop": false },
    "kick":    { "row": 6,  "frames": 6,  "fps": 16, "loop": false },
    "heavy":   { "row": 7,  "frames": 8,  "fps": 14, "loop": false },
    "special": { "row": 8,  "frames": 10, "fps": 14, "loop": false },
    "hit":     { "row": 9,  "frames": 3,  "fps": 14, "loop": false },
    "ko":      { "row": 10, "frames": 6,  "fps": 10, "loop": false },
    "win":     { "row": 11, "frames": 8,  "fps": 8,  "loop": true }
  },
  "moves": {
    "punch":   { "anim": "punch",   "startup": 3, "active": 2, "recovery": 5,  "damage": 5,  "hitbox": { "x": 40,  "y": -190, "w": 80,  "h": 46 }, "knockback": 3,  "meterGain": 6,  "hitstun": 10 },
    "kick":    { "anim": "kick",    "startup": 5, "active": 3, "recovery": 8,  "damage": 8,  "hitbox": { "x": 46,  "y": -120, "w": 100, "h": 50 }, "knockback": 5,  "meterGain": 8,  "hitstun": 14 },
    "heavy":   { "anim": "heavy",   "startup": 9, "active": 3, "recovery": 14, "damage": 14, "hitbox": { "x": 50,  "y": -170, "w": 110, "h": 70 }, "knockback": 12, "meterGain": 12, "hitstun": 22 },
    "special": {
      "anim": "special", "startup": 12, "active": 6, "recovery": 18,
      "damage": 26, "knockback": 20, "meterCost": 100, "hitstun": 34,
      "name": "Grid Sagrado",
      "projectile": { "sheet": "special_fx.png", "frames": 6, "speed": 9, "w": 90, "h": 90, "y": -170, "lifetime": 90 }
    }
  }
}
```

**Regra:** `startup + active + recovery` deve somar aproximadamente a duração da animação em frames de jogo. Se não somar, o engine trunca/estica — o balanceamento é ajustado neste JSON, nunca no código.

Coordenadas de `hitbox`/`hurtbox`: origem nos pés do lutador, X positivo pra frente (direção em que ele olha), Y negativo pra cima.

---

## 4. Arquitetura de arquivos

```
office-fighter/
  index.html
  vite.config.ts
  tsconfig.json
  src/
    main.ts                 boot, mount, roteador de telas
    core/
      loop.ts               passo fixo 60fps + render
      input.ts              teclado + toque → estado de botões (abstrato, agnóstico de device)
      assets.ts             loader de PNG/JSON com preload e barra de progresso
      rng.ts                random com seed (pra IA reproduzível em teste)
    game/
      types.ts              tipos de FighterDef, MoveDef, Box
      fighter.ts            entidade: física, state machine, frame data, aplicação de dano
      hit.ts               resolução de hitbox × hurtbox, prioridade, trade
      ai.ts                 CPU: máquina de estados por dificuldade
      projectile.ts
      stage.ts              fundo, parallax, limites da arena
      fx.ts                 partículas, screenshake, flash de impacto
      match.ts              round, timer, condições de vitória, campanha
    ui/
      screens.ts            título / seleção / resultado / fim (DOM)
      hud.ts                barras de vida, especial, timer (DOM sobre o canvas)
      touch.ts              d-pad + botões no mobile
    data/
      roster.ts             lista de ids de lutadores + ordem da campanha
    styles.css
  public/
    fighters/designer/...
    stages/office.png
```

### State machine do lutador

`idle | walking | jumping | crouching | blocking | attacking | hitstun | ko`

Regras:

- `attacking` não é interrompível, exceto por `hitstun` (counter-hit)
- `hitstun` trava input pelo número de frames de `hitstun` do golpe
- defesa reduz dano a 25% e knockback a 50%; defesa em pé não protege golpe baixo (v2)
- pulo tem arco fixo, sem controle aéreo após o impulso
- cada golpe registra `hasHit` pra não aplicar dano duas vezes na mesma execução

### IA

Três perfis por dificuldade, cada um um conjunto de pesos: distância preferida, chance de atacar por frame, chance de defender quando o oponente está em `startup`, tempo de reação em frames (fácil: 18f, normal: 10f, difícil: 5f). Nada de scripting de combo — pesos + distância já produzem CPU convincente.

---

## 5. Ordem de implementação sugerida

1. Scaffold Vite + TS, canvas 960×540 escalado, loop de passo fixo, `input.ts`
2. Loader de assets + render de um lutador com `idle` animando (valida o sheet do personagem 1)
3. Física + movimentação + pulo + agachar, com hurtbox desenhada em modo debug
4. Golpes com frame data, hitboxes, dano, hitstun, knockback — **modo debug com boxes visíveis é obrigatório aqui**
5. Segundo lutador (pode ser clone do primeiro com cores trocadas) + `hit.ts` resolvendo os dois lados
6. HUD: vida, especial, timer, round
7. `ai.ts` + condições de vitória + `match.ts`
8. Telas de título / seleção / resultado
9. Especial + projétil + fx de impacto + screenshake
10. Controles de toque + responsivo
11. Campanha de 3 fases + tela final
12. Entram os lutadores 2, 3 e 4 conforme a arte sai

Passo 4 é o que decide se o jogo é bom. Não avançar dele sem o modo debug de hitbox funcionando.

---

## 6. Controles

| Ação | Teclado | Toque |
|------|---------|-------|
| Andar | ← → | d-pad |
| Pular | ↑ | d-pad |
| Agachar | ↓ | d-pad |
| Defender | Z | botão Z |
| Soco | A | botão A |
| Chute | S | botão S |
| Golpe forte | D | botão D |
| Especial | X | botão X |
| Confirmar (menus) | Enter / A | toque |
| Pause | Esc / P | botão ⏸ |

Mapeamento fica num único objeto em `input.ts`, remapeável.

---

## 7. Pendências pro usuário responder no Claude Code

1. **Dimensões reais do sheet do personagem 1** — se não bateu com 320×320, a spec se ajusta ao que já foi produzido. Rode `file public/fighters/<id>/sheet.png` (ou abra no Preview) e informe largura × altura + quantas animações/frames você fez.
2. **Nomes finais dos 4 lutadores** e o nome do especial de cada um.
3. **Fundo da arena** — imagem pronta ou o Claude Code desenha um placeholder?
4. **Nome do jogo** e domínio de deploy.

---

## 8. Prompt inicial pra colar no Claude Code

> Vamos construir um jogo de luta 2D estilo arcade anos 90 que roda no navegador. Já existe um documento de handoff completo com escopo, stack, especificação de sprite sheet, contrato de `fighter.json` e arquitetura de arquivos — está em `HANDOFF-office-fighter.md` na raiz do projeto. Leia ele primeiro.
>
> Comece pelos passos 1 e 2 da ordem de implementação: scaffold Vite + TypeScript com canvas 960×540 escalado por CSS, game loop de passo fixo em 60fps, módulo de input abstraindo teclado e toque, e um loader de assets que carrega `public/fighters/<id>/sheet.png` + `fighter.json` e renderiza a animação `idle` do personagem 1 na tela.
>
> Antes de escrever código, confira as dimensões reais do sheet que já está em `public/fighters/` e me diga se batem com a spec do handoff — se não baterem, ajuste o `fighter.json` e a spec pro que existe de fato, em vez de assumir.
>
> Inclua desde já um modo debug (tecla F1) que desenha hurtbox, hitbox ativa e o número do frame atual na tela. Vou depender dele nos próximos passos.


---

## 9. Anexo — board v2 (5 × 7, 35 poses) — 2026-09-17

Substitui a spec de sprite sheet da seção 3 para os dois primeiros lutadores. Cada célula tem ~216 × 208 px;
a grade não precisa ser exata porque `tools/sprites.py` recorta cada sprite pelo alpha.

| Linha | Poses (esq → dir) |
|-------|-------------------|
| 1 | guarda, guarda, andar 1, andar 2, andar 3 |
| 2 | salto (subida), salto (ápice), agachar, defesa em pé, defesa agachada |
| 3 | soco, soco forte, chute, chute alto, golpe forte (gancho) |
| 4 | especial carga, especial disparo, dano, queda, nocaute |
| 5 | aéreo neutro, soco no ar, aéreo neutro 2, voadora, forte no ar |
| 6 | soco baixo, guarda baixa, rasteira (início), rasteira (estendida), forte baixo |
| 7 | super frame 1, super frame 2, efeito 1, efeito 2, recuperação |

Supers da v2:
- **Edgard — Portal dos Morcegos:** mão no chão (frames 1-2), portal abre sob o adversário (efeitos 1-2, zona com 2 acertos rápidos), recuperação.
- **Santana — Soco Sísmico:** salta (frame 1) sobre o adversário, mergulha com o soco (frame 2), impacto no chão (efeito 1) e explosão em área (efeito 2), recuperação.

Lutadores 3 e 4 (2026-09-17, mesmo board 5×7): **Kevin** (Colombo/PR, atirador mercenário, mais alto que o Santana; linha 7 = sacar, mirar, 3 disparos)
e **Laura** (a lutadora; linha 7 = avanço, agarrar, segurar, levantar, arremessar — super indefensável).
