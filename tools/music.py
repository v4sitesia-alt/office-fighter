#!/usr/bin/env python3
"""Converte as músicas de Personagens/musicas pra AAC (m4a, 128 kbps), mede o volume (RMS) de cada uma
e grava public/audio/music/tracks.json com o ganho que deixa todas no mesmo nível.
  intro.mp3 -> intro · select.mp3 -> select · <id>-song.mp3 -> fighter-<id> (toca na luta no cenário desse lutador)
Uso: python3 tools/music.py   (precisa do afconvert do macOS)"""
import glob, json, os, subprocess, tempfile, wave
import numpy as np
SRC, OUT, TARGET = 'Personagens/musicas', 'public/audio/music', 0.1215   # RMS*vol alvo (intro a 0.55)
os.makedirs(OUT, exist_ok=True)
tracks = {}
for src in sorted(glob.glob(f'{SRC}/*.mp3')):
    base = os.path.basename(src)[:-4]
    name = base if base in ('intro', 'select') else 'fighter-' + base.replace('-song', '').lower()   # CRM-song.mp3 -> fighter-crm
    dst = f'{OUT}/{name}.m4a'
    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '128000', src, dst], check=True)
    tmp = tempfile.mktemp(suffix='.wav')
    subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16@22050', '-c', '1', src, tmp], check=True)
    with wave.open(tmp) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float) / 32768
    os.remove(tmp)
    rms = float(np.sqrt((x ** 2).mean()))
    tracks[name] = {'path': f'audio/music/{name}.m4a', 'vol': round(min(1.0, TARGET / rms), 3)}   # teto 1,0: as faixas gravadas baixas (Landim, Michael) chegam no nível das outras
    print(f'{name:18s} rms {rms:.3f} vol {tracks[name]["vol"]:.2f}  {os.path.getsize(dst) / 1e6:.1f} MB')
json.dump(tracks, open(f'{OUT}/tracks.json', 'w'), indent=1)
