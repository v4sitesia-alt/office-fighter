#!/usr/bin/env python3
"""
Gera as vozes do jogo com a síntese de fala do macOS (`say`) e processa em numpy:
tom (pitch), distorção, bitcrush e reverb por personagem. Saída: public/audio/voice/*.wav
(mono, 16 bits, 22050 Hz) + manifest.json com a lista de ids.

  python3 tools/voices.py

Locutor: Daniel (en-GB), grave + reverb + bitcrush (locutor de fliperama).
Santana: Rocko pt-BR, muito grave, com raiva (distorção forte).
Edgard: Eddy pt-BR, voz média, risadas malignas (leve distorção + reverb).
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
    # Edgard — voz média, risadas malignas
    ('edgard-laugh-1',  'Eddy (Português (Brasil))', 'Mua ha ha ha ha ha!', 190, 0.95),
    ('edgard-laugh-2',  'Eddy (Português (Brasil))', 'He he he he he!', 210, 0.97),
    ('edgard-attack-1', 'Eddy (Português (Brasil))', 'Toma!', 220, 0.95),
    ('edgard-attack-2', 'Eddy (Português (Brasil))', 'Ha!', 220, 0.95),
    ('edgard-attack-3', 'Eddy (Português (Brasil))', 'Alinha!', 230, 0.95),
    ('edgard-special',  'Eddy (Português (Brasil))', 'Grid sagrado!', 200, 0.95),
    ('edgard-super',    'Eddy (Português (Brasil))', 'Portal dos morcegos! Mua ha ha ha ha!', 200, 0.95),
    ('edgard-hurt-1',   'Eddy (Português (Brasil))', 'Ai!', 240, 0.95),
    ('edgard-hurt-2',   'Eddy (Português (Brasil))', 'Ugh!', 240, 0.95),
    ('edgard-ko',       'Eddy (Português (Brasil))', 'Não! Aaah!', 200, 0.95),
    ('edgard-win',      'Eddy (Português (Brasil))', 'Aprovado. Mua ha ha ha ha ha!', 190, 0.95),
    # Santana — gritos graves e com raiva
    ('santana-attack-1', 'Rocko (Português (Brasil))', 'Raaah!', 230, 0.68),
    ('santana-attack-2', 'Rocko (Português (Brasil))', 'Hua!', 240, 0.68),
    ('santana-attack-3', 'Rocko (Português (Brasil))', 'Toma!', 240, 0.68),
    ('santana-special',  'Rocko (Português (Brasil))', 'Impulsiona!', 220, 0.68),
    ('santana-super',    'Rocko (Português (Brasil))', 'Soco sísmico! Graaaaah!', 210, 0.66),
    ('santana-hurt-1',   'Rocko (Português (Brasil))', 'Argh!', 240, 0.68),
    ('santana-hurt-2',   'Rocko (Português (Brasil))', 'Ugh!', 240, 0.68),
    ('santana-ko',       'Rocko (Português (Brasil))', 'Aaaargh!', 200, 0.66),
    ('santana-win',      'Rocko (Português (Brasil))', 'É isso! Raaah!', 210, 0.68),
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
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump({'ids': ids}, f, indent=1)


if __name__ == '__main__':
    main()
