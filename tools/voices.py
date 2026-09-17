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
    # sons de especial enviados pelo usuário
    import glob, shutil
    for src in sorted(glob.glob('Personagens/Mais-movimentos/especial-*.*')):
        fid = os.path.basename(src).split('.')[0].replace('especial-', '')
        ext = os.path.splitext(src)[1].lower()
        dst = f'{fid}-special{ext}'
        shutil.copy(src, os.path.join(OUT, dst)); ids.append(dst); print(f'{dst:20s} <- {src}')
    files = [i if '.' in i else i + '.wav' for i in ids]
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump({'files': files}, f, indent=1)


if __name__ == '__main__':
    main()
