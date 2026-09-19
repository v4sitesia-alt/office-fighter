#!/usr/bin/env python3
"""
Ficha de RPG do elenco: aplica atributos, ritmo dos golpes e dano das magias nos fighter.json.
A tabela é a fonte da verdade do balanceamento; mexa AQUI, rode `npm run balance:apply` e meça com `npm run balance`.

Atributos (1,00 = média; a régua do jogo vai de 0,70 a 1,35, o PESO até 1,50):
  FORÇA      multiplica os golpes comuns            AGILIDADE  velocidade de andar
  PODER      multiplica tudo que gasta barra        PESO       segura o empurrão e amortece o dano (1,5 leva ~13% menos)
Ritmo = tempo dos golpes comuns (dano, preparo, ativo, recuperação em frames de 1/60 s). Quem é ágil bate rápido e fraco;
quem é pesado bate devagar e forte. O dano final de um golpe comum é dano x FORÇA; o de magia/super é dano x PODER.

Âncoras pedidas pelo Edgard (dono do jogo):
  - CRM é o mais lento de todos e o mais forte; os golpes demoram mais; o especial tira muito.
  - Xablau é lento que nem o CRM. Laura e Dias são os mais rápidos, com força baixa; o Dias encadeia porrada.
  - Dedê é o equilibrado (tudo no meio). Michael é equilibrado puxando pra força. Leo é um Dedê com tudo um pouco acima.
  - O especial que mais tira é o do Edgard, empatado com o do CRM.
"""
import json, os, sys

# Ajuste fino do dano dos golpes comuns por lutador (multiplica o dano base do ritmo). Sai do calibrador automático
# (`python3 tools/balance.py --tune`), que roda o torneio de CPU e puxa cada um pro alvo de vitórias. Os atributos da
# ficha (o que o jogador vê nas barras) não mudam: muda só o quanto cada golpe comum tira, pra compensar alcance e tamanho.
TUNE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'balance-tune.json')
TUNE = json.load(open(TUNE_FILE)) if os.path.exists(TUNE_FILE) else {}
ALVO = {'leo': 56, 'mundim': 56, 'crm': 52}          # % de vitórias desejada no torneio de CPU (os demais: 50)

#            id        FORÇA  AGIL.  PODER  PESO   ritmo      magia  super   (dano base, antes do PODER)
FICHA = [
    ('edgard',   0.90,  1.10,  1.35,  1.00, 'normal',   15,    (10, 16)),   # portal: dois acertos
    ('santana',  1.12,  0.90,  1.05,  1.20, 'firme',    15,    (10, 16)),   # mergulho + explosão
    ('kevin',    0.90,  0.95,  1.20,  1.05, 'normal',    8,    8),          # x3 tiros
    ('laura',    0.85,  1.35,  0.90,  0.85, 'rapido',   12,    26),         # agarrão (release)
    ('dede',     1.00,  1.00,  1.00,  1.00, 'normal',   13,    26),
    ('dias',     0.88,  1.30,  0.95,  1.05, 'rapido',   12,    25),
    ('michael',  1.10,  1.05,  0.95,  1.00, 'normal',   13,    27),
    ('eneias',   1.18,  0.85,  1.00,  1.30, 'firme',    13,    28),
    ('van',      0.92,  1.20,  1.10,  0.95, 'normal',   13,    6),           # raio contínuo: até 5 acertos + aura
    ('landim',   0.95,  1.05,  1.25,  0.95, 'normal',   13,    7),           # claquete bumerangue: até 4 acertos
    ('crm',      1.30,  0.60,  1.30,  1.50, 'maquina',  15,    27),
    ('leo',      1.15,  1.15,  1.15,  1.10, 'normal',   13,    8),          # x3 drones
    ('xablau',   1.22,  0.75,  1.00,  1.40, 'lento',    13,    28),
    ('mundim',   1.10,  1.00,  1.25,  1.10, 'normal',   13,    25),
    # dener (secreto) fica de fora: é apelão de propósito
]
#                 (dano, preparo, ativo, recuperação)
RITMO = {
 'rapido': {'punch': (4, 2, 3, 5),  'kick': (7, 5, 3, 7),   'heavy': (11, 8, 4, 13),  'airPunch': (5, 3, 8, 3), 'airKick': (8, 4, 10, 3),  'airHeavy': (11, 6, 8, 5),
            'lowPunch': (3, 3, 3, 6), 'lowKick': (6, 5, 6, 10), 'lowHeavy': (9, 7, 4, 12)},
 'normal': {'punch': (5, 3, 3, 6),  'kick': (8, 6, 3, 9),   'heavy': (14, 10, 4, 16), 'airPunch': (6, 4, 8, 4), 'airKick': (9, 5, 10, 4),  'airHeavy': (12, 7, 8, 6),
            'lowPunch': (4, 4, 3, 7), 'lowKick': (7, 6, 6, 12), 'lowHeavy': (10, 8, 4, 14)},
 'firme':  {'punch': (6, 4, 3, 7),  'kick': (9, 7, 3, 10),  'heavy': (16, 11, 4, 18), 'airPunch': (7, 4, 8, 4), 'airKick': (10, 5, 10, 4), 'airHeavy': (13, 7, 8, 6),
            'lowPunch': (5, 4, 3, 8), 'lowKick': (8, 7, 6, 13), 'lowHeavy': (13, 10, 4, 17)},
 'maquina': {'punch': (6, 8, 4, 12), 'kick': (9, 11, 4, 16), 'heavy': (15, 17, 5, 25), 'airPunch': (7, 7, 8, 6), 'airKick': (10, 8, 10, 6), 'airHeavy': (14, 10, 10, 8),
            'lowPunch': (5, 8, 4, 12), 'lowKick': (8, 11, 6, 17), 'lowHeavy': (12, 13, 5, 20)},
 'lento':  {'punch': (6, 5, 3, 8),  'kick': (10, 8, 4, 12), 'heavy': (16, 13, 5, 20), 'airPunch': (7, 5, 8, 5), 'airKick': (10, 6, 10, 5), 'airHeavy': (14, 8, 8, 8),
            'lowPunch': (5, 5, 3, 9), 'lowKick': (9, 8, 6, 14), 'lowHeavy': (13, 11, 4, 18)},
}
# Alcance (caixa de acerto) corrigido à mão, em unidades do sprite: (x, y, largura, altura).
# - quem tinha o golpe forte mais curto que o próprio soco ganhou um forte que chega onde o braço chega;
# - a máquina, o chefão e o Leo tinham alcance de sobra pro tamanho: aparados pra ninguém ganhar só por bater de longe.
ALCANCE = {
 'edgard': {'heavy': (25, -235, 100, 130)}, 'laura': {'heavy': (25, -230, 100, 130)},
 'dede': {'heavy': (25, -230, 105, 190), 'kick': (40, -170, 115, 70)}, 'michael': {'heavy': (25, -230, 108, 190), 'kick': (40, -170, 115, 70)},
 'van': {'heavy': (25, -230, 108, 190), 'kick': (40, -170, 118, 72)}, 'landim': {'heavy': (25, -230, 108, 190), 'kick': (40, -170, 118, 72)},
 'dias': {'heavy': (25, -230, 100, 190)},
 'crm': {},
 'leo': {'kick': (40, -145, 100, 95), 'heavy': (30, -165, 85, 110)},
 'mundim': {'heavy': (36, -192, 118, 134)},      # unidades do board novo (2026-09-19), escala 1,10
}
# Golpe longo (frente + forte): é um cutucão de longe, tira menos que o forte.
LONGO = {'edgard': 10, 'santana': 11, 'kevin': 11, 'laura': 9, 'dede': 10, 'michael': 11, 'dias': 9, 'landim': 9, 'van': 9}
# Dias: combo de porrada. O golpe que encostou pode ser cortado no seguinte (soco -> soco/chute -> forte), até 3 emendas.
CHAIN = {'dias': {'punch': ['punch', 'kick'], 'kick': ['heavy'], 'lowPunch': ['punch', 'kick']}}


def main(quiet=False):
    for fid, power, speed, magic, weight, ritmo, special, sup in FICHA:
        p = f'public/fighters/{fid}/fighter.json'; d = json.load(open(p)); M = d['moves']
        st = d['stats']; st.update({'speed': speed, 'power': power, 'weight': weight, 'magic': magic})
        if ritmo:
            k = TUNE.get(fid, 1.0)
            for name, (dmg, s, a, r) in RITMO[ritmo].items():
                if name in M: M[name].update({'damage': round(dmg * k, 1), 'startup': s, 'active': a, 'recovery': r})
            if 'long' in M: M['long']['damage'] = round(LONGO[fid] * k, 1)
        for name, (x, y, w, h) in ALCANCE.get(fid, {}).items(): M[name]['hitbox'] = {'x': x, 'y': y, 'w': w, 'h': h}
        for name, m in M.items():
            m.pop('chain', None); m.pop('chainMax', None)
            if name in CHAIN.get(fid, {}): m['chain'] = CHAIN[fid][name]; m['chainMax'] = 3
        M['special']['damage'] = special
        su = M['super']
        if isinstance(sup, tuple):                       # acerto do golpe + zona, ou zona com dois acertos
            hits = su['zone']['hits']
            if len(hits) == 2: hits[0]['damage'], hits[1]['damage'] = sup
            else: su['damage'], hits[0]['damage'] = sup
        elif 'throw' in su: su['throw']['release']['damage'] = sup
        else: su['damage'] = sup
        open(p, 'w').write(json.dumps(d, ensure_ascii=False, indent=1))
        total = sum(sup) if isinstance(sup, tuple) else sup * su.get('projectile', {}).get('count', 1)
        if not quiet: print(f'{fid:8s} força {power:.2f} agil {speed:.2f} poder {magic:.2f} peso {weight:.2f}  {ritmo:7s} magia {special * magic:5.1f}  super {total * magic:5.1f}')


def tune(rounds=10, n=12):
    """Calibrador: roda o torneio de CPU, mede as vitórias e corrige o dano comum de cada um na direção do alvo."""
    import subprocess, math
    global TUNE
    subprocess.run(['npx', 'vite', 'build', '--ssr', 'tools/balance.ts', '--outDir', '.nettest', '--emptyOutDir', '--logLevel', 'warn'], check=True)
    for it in range(rounds):
        main(quiet=True)
        out = subprocess.run(['node', '.nettest/balance.js', '--n', str(n), '--json'], capture_output=True, text=True, check=True).stdout
        pct = json.loads(next(l for l in out.splitlines() if l.startswith('JSON '))[5:])
        errs = {f: ALVO.get(f, 50) - p for f, p in pct.items() if f != 'dener'}
        print(f'rodada {it + 1}: amplitude {max(pct[f] for f in errs) - min(pct[f] for f in errs):.0f}  ' + ' '.join(f'{f}:{pct[f]:.0f}' for f in sorted(errs, key=lambda f: -pct[f])))
        step = 0.006 if it < 6 else 0.003
        for f, e in errs.items(): TUNE[f] = round(min(1.20, max(0.80, TUNE.get(f, 1.0) * math.exp(step * e))), 3)
        json.dump(TUNE, open(TUNE_FILE, 'w'), indent=1, sort_keys=True)
    main(quiet=True)


if __name__ == '__main__':
    if '--tune' in sys.argv: tune()
    else: main()
