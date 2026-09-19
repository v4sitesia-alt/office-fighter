#!/usr/bin/env python3
"""
Gera as vozes do jogo com a síntese de fala do macOS (`say`) e processa em numpy:
tom (pitch), distorção, bitcrush e reverb por personagem. Saída: public/audio/voice/*.wav
(mono, 16 bits, 22050 Hz) + manifest.json com a lista de ids.

  python3 tools/voices.py

Locutor: Daniel (en-GB), grave + reverb + bitcrush (locutor de fliperama).
Os lutadores não têm voz: só o som do especial, que vem de um arquivo enviado pelo usuário em
Personagens/Mais-movimentos/especial-<id>.(mp3|wav) e é copiado como <id>-special.<ext>.
"""
import os, subprocess, json, wave, tempfile
import numpy as np

OUT = 'public/audio/voice'
SR = 22050

# id, voz, texto, rate (palavras/min), pitch (fator de reamostragem: <1 = mais grave)
CLIPS = [
    # locutor
    ('ann-round-1', 'Daniel', 'Round one!', 165, 0.86),
    ('ann-round-2', 'Daniel', 'Round two!', 165, 0.86),
    ('ann-round-3', 'Daniel', 'Round three!', 165, 0.86),
    ('ann-fight',   'Daniel', 'Fight!', 150, 0.84),
    ('ann-ko',      'Daniel', 'K, O!', 140, 0.84),
    ('ann-perfect', 'Daniel', 'Perfect!', 160, 0.86),
    ('ann-time',    'Daniel', 'Time over!', 160, 0.86),
    ('ann-you-win', 'Daniel', 'You win!', 160, 0.86),
    ('ann-you-lose','Daniel', 'You lose.', 150, 0.84),
    ('ann-edgard',  'Daniel', 'Edgard!', 160, 0.86),
    ('ann-santana', 'Daniel', 'Santana!', 160, 0.86),
    ('ann-kevin',   'Daniel', 'Kevin!', 160, 0.86),
    ('ann-laura',   'Daniel', 'Laura!', 160, 0.86),
    ('ann-dede',    'Daniel', 'Dedeh!', 160, 0.86),
    ('ann-dias',    'Daniel', 'Dee-as!', 160, 0.86),
    ('ann-michael', 'Daniel', 'Michael!', 160, 0.86),
    ('ann-eneias',  'Daniel', 'Eh-nay-as!', 160, 0.86),
    ('ann-van',     'Daniel', 'Vanessa!', 160, 0.86),
    ('ann-mundim',  'Daniel', 'Moondeem!', 160, 0.84),
    ('ann-landim',  'Daniel', 'Landeem!', 160, 0.86),
    ('ann-xablau',  'Daniel', 'Shablau!', 160, 0.84),
    ('ann-dener',   'Daniel', 'Denner!', 150, 0.8),
    ('dener-laugh-1', 'Eddy (Português (Brasil))', 'Ha ha ha ha ha ha ha!', 240, 1.12),
    ('dener-laugh-2', 'Eddy (Português (Brasil))', 'Hi hi hi hi hi hi hi!', 260, 1.2),
    ('dener-laugh-3', 'Eddy (Português (Brasil))', 'He he he. Ha ha ha ha ha ha!', 230, 1.08),
    ('dener-laugh-4', 'Eddy (Português (Brasil))', 'Mua ha ha ha ha ha ha ha!', 220, 1.15),
    ('ann-secret',  'Daniel', 'Here comes a new challenger!', 165, 0.84),
]


def say(voice, text, rate):
    tmp = tempfile.mktemp(suffix='.wav')
    subprocess.run(['say', '-v', voice, '-r', str(rate), '-o', tmp, '--data-format=LEI16@22050', text], check=True)
    with wave.open(tmp) as w:
        n = w.getnframes(); ch = w.getnchannels()
        data = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
    os.remove(tmp)
    if ch > 1:
        data = data.reshape(-1, ch).mean(axis=1)
    return data


def resample(x, factor):
    """factor < 1 = mais grave e mais longo (reamostragem simples)."""
    n = int(len(x) / factor)
    idx = np.linspace(0, len(x) - 1, n)
    return np.interp(idx, np.arange(len(x)), x)


def trim(x, thr=0.01, pad=0.02):
    idx = np.nonzero(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a, b = max(0, idx[0] - int(pad * SR)), min(len(x), idx[-1] + int(pad * SR))
    return x[a:b]


def comb(x, delay_s, g):
    d = int(delay_s * SR)
    y = np.copy(x)
    for i in range(d, len(y)):
        y[i] += g * y[i - d]
    return y


def reverb(x, amount, tail=0.35):
    y = np.concatenate([x, np.zeros(int(tail * SR))])
    wet = (comb(y, 0.031, 0.72) + comb(y, 0.043, 0.68) + comb(y, 0.059, 0.62)) / 3
    return y + amount * wet


def distort(x, gain):
    return np.tanh(x * gain) / np.tanh(gain)


def bitcrush(x, bits=7, hold=2):
    q = 2 ** (bits - 1)
    y = np.round(x * q) / q
    if hold > 1:
        y = np.repeat(y[::hold], hold)[:len(x)]
    return y


def lowpass(x, alpha):
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x):
        acc += alpha * (v - acc); y[i] = acc
    return y


def fade(x, ms=6):
    n = int(SR * ms / 1000)
    if len(x) > 2 * n:
        x[:n] *= np.linspace(0, 1, n); x[-n:] *= np.linspace(1, 0, n)
    return x


def normalize(x, peak=0.9):
    m = np.abs(x).max()
    return x * (peak / m) if m > 0 else x


def process(cid, x, pitch):
    x = trim(x)
    x = resample(x, pitch)
    if cid.startswith('ann-'):
        x = distort(x, 1.8)
        x = bitcrush(x, bits=7, hold=2)
        x = reverb(x, 0.55, tail=0.5)
    elif cid.startswith('dener-'):
        dbl = resample(x, 1.06); n = min(len(x), len(dbl)); x = x[:n] * 0.7 + dbl[:n] * 0.6      # voz dobrada e desafinada
        x = x * (1 + 0.35 * np.sin(np.arange(n) * 2 * np.pi * 7 / SR))                       # tremor
        x = bitcrush(distort(x, 3.0), bits=8, hold=1); x = reverb(x, 0.55, tail=0.5)
    elif cid.startswith('santana-'):
        x = distort(x, 6.0)            # raiva
        x = lowpass(x, 0.35)           # peso
        x = reverb(x, 0.3, tail=0.25)
    else:  # edgard
        x = distort(x, 2.2)
        x = reverb(x, 0.35, tail=0.3)
    return fade(normalize(x))


def write(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())


def main():
    os.makedirs(OUT, exist_ok=True)
    ids = []
    for cid, voice, text, rate, pitch in CLIPS:
        raw = say(voice, text, rate)
        y = process(cid, raw, pitch)
        write(os.path.join(OUT, cid + '.wav'), y)
        ids.append(cid)
        print(f'{cid:20s} {len(y) / SR:5.2f}s  {voice}: "{text}"')
    # grito do nocaute: "ohhhh" sintetizado (vozes com formantes de "ó", caindo de tom). Um masculino e um feminino.
    def scream(name, f_lo, f_hi, formants, voices, seed):
        rng = np.random.RandomState(seed); dur = 2.4; t = np.arange(int(SR * dur)) / SR; out = np.zeros_like(t)
        for _ in range(voices):
            f0 = rng.uniform(f_lo, f_hi) * (1.12 - 0.3 * (t / dur) ** 1.4); ph = 2 * np.pi * np.cumsum(f0) / SR + rng.uniform(0, 6)
            vib = 1 + 0.012 * np.sin(2 * np.pi * rng.uniform(4.5, 6) * t)
            for h in range(1, 16):
                fh = h * f0.mean(); g = sum(a * np.exp(-((fh - c) / w) ** 2) for c, w, a in formants) + 0.05
                out += g / h ** 0.5 * np.sin(h * ph * vib)
        env = np.minimum(1, t / 0.08) * np.exp(-np.maximum(0, t - 1.0) * 1.7)
        y = reverb(distort(normalize(out * env), 1.8), 0.75, tail=0.7)
        write(os.path.join(OUT, name + '.wav'), fade(normalize(y), 25)); ids.append(name); print(f'{name:20s} {len(y) / SR:5.2f}s  (sintetizado)')
    scream('ko-oh-m', 120, 165, [(520, 150, 1.0), (880, 190, 0.6)], 3, 4)
    scream('ko-oh-f', 250, 320, [(640, 170, 1.0), (1080, 220, 0.65), (2800, 400, 0.12)], 3, 9)
    # sons de especial enviados pelo usuário
    import glob, shutil
    for src in sorted(glob.glob('Personagens/Mais-movimentos/especial-*.*') + glob.glob('Personagens/Mais-movimentos/*-especial.*')):
        fid = os.path.basename(src).split('.')[0].replace('especial-', '').replace('-especial', '')
        ext = os.path.splitext(src)[1].lower()
        dst = f'{fid}-special{ext}'
        shutil.copy(src, os.path.join(OUT, dst)); ids.append(dst); print(f'{dst:20s} <- {src}')
    SONS = {'barrigada.wav': 'dias-special', 'dede-especial.mp3': 'dede-special', 'enais-especial.mp3': 'eneias-special', 'michael-punch.mp3': 'michael-special',
            'van-especial.mp3': 'van-special', 'landim-especial.wav': 'landim-special', 'mundin-especial.wav': 'mundim-special', 'xablau-especial.wav': 'xablau-special',
            'edgard-magia-leve.wav': 'edgard-magic', 'magia-leve-dias.mp3': 'dias-magic', 'xablau-magia-leve.wav': 'xablau-magic'}
    for fn, target in SONS.items():
        src = os.path.join('Personagens/sons', fn)
        if not os.path.exists(src): continue
        dst = target + os.path.splitext(fn)[1].lower()
        shutil.copy(src, os.path.join(OUT, dst)); ids.append(dst); print(f'{dst:20s} <- {src}')
    files = [i if '.' in i else i + '.wav' for i in ids]
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump({'files': files}, f, indent=1)


if __name__ == '__main__':
    main()
