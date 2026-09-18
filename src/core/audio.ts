// Áudio: música chiptune por sequenciador, efeitos sintetizados e vozes pré-renderizadas
// (public/audio/voice, geradas por tools/voices.py). Tudo pendurado num AudioContext que só
// nasce depois do primeiro gesto do usuário (política de autoplay).
import { SONGS, type Song } from '../data/songs';

/** Músicas de arquivo (public/audio/music/*.mp3), tocadas em loop por <audio>. */
// public/audio/music/tracks.json (gerado por tools/music.py): caminho + volume nivelado pelo RMS de cada arquivo
let FILE_TRACKS: Record<string, { path: string; vol: number }> = {};
export const hasTrack = (name: string) => name in FILE_TRACKS;
export type SongName = keyof typeof SONGS | string;

export type SfxName =
  | 'hit' | 'hitBig' | 'block' | 'swing' | 'jump' | 'land'
  | 'menuMove' | 'menuConfirm' | 'menuBack' | 'selectChar'
  | 'projectile' | 'portal' | 'explosion' | 'ko' | 'tick' | 'win' | 'lose' | 'meter1' | 'meter2' | 'talkA' | 'talkB';

export type VoiceChannel = 'ann' | 'p1' | 'p2';

const NOTE_INDEX: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
function noteFreq(tok: string): number {
  const m = /^([a-g])(#?)(\d)$/.exec(tok);
  if (!m) return 0;
  const semi = NOTE_INDEX[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * Math.pow(2, (semi - 69) / 12);
}

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode; private musicBus!: GainNode; private sfxBus!: GainNode; private voiceBus!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private pulseWave: PeriodicWave | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private raw = new Map<string, ArrayBuffer>();
  private voiceNodes = new Map<VoiceChannel, AudioBufferSourceNode>();
  private song: Song | null = null;
  songName: SongName | null = null;
  private step = 0; private nextStepTime = 0; private timer = 0;
  private fileEl: HTMLAudioElement | null = null;
  private files = new Map<string, HTMLAudioElement>();
  base = '/';
  muted = false;

  constructor() {
    try { this.muted = localStorage.getItem('of-muted') === '1'; } catch { /* sem storage */ }
  }

  get ready() { return !!this.ctx; }

  /** Chame no primeiro keydown/pointerdown. Idempotente. */
  unlock() {
    if (this.fileEl && this.fileEl.paused) this.fileEl.play().catch(() => undefined);
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 1; this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.5; this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.8; this.sfxBus.connect(this.master);
    this.voiceBus = ctx.createGain(); this.voiceBus.gain.value = 1.0; this.voiceBus.connect(this.master);
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    // onda "pulse" 25% (timbre de NES)
    const N = 32, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) { re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25); }
    this.pulseWave = ctx.createPeriodicWave(re, im);
    for (const [id, ab] of this.raw) this.decode(id, ab);
    this.raw.clear();
    if (this.song) this.startSequencer();
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('of-muted', this.muted ? '1' : '0'); } catch { /* sem storage */ }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.02);
    if (this.fileEl) this.fileEl.muted = this.muted;
    return this.muted;
  }

  // ---------- vozes
  async preloadVoices(base: string) {
    try {
      const r = await fetch(`${base}audio/voice/manifest.json`);
      const { files } = (await r.json()) as { files: string[] };
      await Promise.all(files.map(async (file) => {
        const id = file.replace(/\.[a-z0-9]+$/i, '');
        const ab = await fetch(`${base}audio/voice/${file}`).then((x) => x.arrayBuffer());
        if (this.ctx) this.decode(id, ab); else this.raw.set(id, ab);
      }));
    } catch (e) { console.warn('vozes não carregaram', e); }
  }
  private decode(id: string, ab: ArrayBuffer) {
    this.ctx!.decodeAudioData(ab.slice(0)).then((buf) => this.buffers.set(id, buf)).catch(() => undefined);
  }
  hasVoice(id: string) { return this.buffers.has(id); }

  /** Toca uma voz; cada canal (locutor, p1, p2) toca uma por vez. */
  voice(id: string, channel: VoiceChannel = 'ann', gain = 1) {
    const buf = this.buffers.get(id);
    if (!this.ctx || !buf) return;
    this.voiceNodes.get(channel)?.stop();
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(g).connect(this.voiceBus); src.start();
    this.voiceNodes.set(channel, src);
    src.onended = () => { if (this.voiceNodes.get(channel) === src) this.voiceNodes.delete(channel); };
  }
  /** Toca uma variação aleatória de um prefixo (ex.: "santana-attack" -> -1, -2, -3). */
  voiceRandom(prefix: string, channel: VoiceChannel, gain = 1) {
    const ids = [...this.buffers.keys()].filter((k) => k.startsWith(prefix + '-') && /-\d+$/.test(k));
    if (!ids.length) { this.voice(prefix, channel, gain); return; }
    this.voice(ids[Math.floor(Math.random() * ids.length)], channel, gain);
  }

  // ---------- efeitos sintetizados
  private osc(type: OscillatorType | 'pulse', f0: number, f1: number, t0: number, dur: number, gain: number, dest: AudioNode, curve: 'exp' | 'lin' = 'exp') {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    if (type === 'pulse') o.setPeriodicWave(this.pulseWave!); else o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    else o.frequency.linearRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(dest); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  private noise(t0: number, dur: number, gain: number, dest: AudioNode, filter?: { type: BiquadFilterType; f0: number; f1?: number; q?: number }) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    let node: AudioNode = s;
    if (filter) {
      const f = ctx.createBiquadFilter(); f.type = filter.type; f.Q.value = filter.q ?? 1;
      f.frequency.setValueAtTime(filter.f0, t0);
      if (filter.f1) f.frequency.exponentialRampToValueAtTime(filter.f1, t0 + dur);
      s.connect(f); node = f;
    }
    node.connect(g).connect(dest); s.start(t0); s.stop(t0 + dur + 0.02);
  }

  sfx(name: SfxName) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, B = this.sfxBus;
    switch (name) {
      // golpes no estilo SF2: "thwack" curto (ruído com banda média + baque grave + estalo)
      case 'hit':
        this.noise(t, 0.07, 0.6, B, { type: 'bandpass', f0: 1400, f1: 600, q: 0.7 });
        this.osc('sine', 190, 60, t, 0.09, 0.6, B);
        this.osc('square', 240, 110, t, 0.03, 0.15, B); break;
      case 'hitBig':
        this.noise(t, 0.16, 0.8, B, { type: 'lowpass', f0: 1200, f1: 150 });
        this.osc('sine', 140, 40, t, 0.22, 0.9, B);
        this.osc('square', 180, 60, t, 0.07, 0.25, B); break;
      case 'block':
        this.osc('square', 1100, 900, t, 0.045, 0.25, B);
        this.noise(t, 0.045, 0.35, B, { type: 'highpass', f0: 2500 });
        this.osc('sine', 300, 200, t, 0.05, 0.2, B); break;
      case 'swing': this.noise(t, 0.12, 0.18, B, { type: 'bandpass', f0: 2200, f1: 500, q: 1.5 }); break;
      case 'jump': this.osc('pulse', 260, 620, t, 0.16, 0.18, B); break;
      case 'land': this.noise(t, 0.06, 0.25, B, { type: 'lowpass', f0: 600 }); break;
      case 'menuMove': this.osc('pulse', 880, 880, t, 0.05, 0.2, B); break;
      case 'menuConfirm': this.osc('pulse', 660, 660, t, 0.06, 0.22, B); this.osc('pulse', 990, 990, t + 0.07, 0.1, 0.22, B); break;
      case 'menuBack': this.osc('pulse', 660, 330, t, 0.12, 0.2, B); break;
      case 'selectChar': [523, 659, 784, 1047].forEach((f, i) => this.osc('pulse', f, f, t + i * 0.07, 0.14, 0.22, B)); break;
      case 'projectile': this.osc('sawtooth', 220, 900, t, 0.3, 0.2, B); this.noise(t, 0.25, 0.2, B, { type: 'bandpass', f0: 1200, f1: 3000, q: 2 }); break;
      case 'portal': this.noise(t, 0.6, 0.45, B, { type: 'bandpass', f0: 300, f1: 2500, q: 3 }); this.osc('sawtooth', 60, 220, t, 0.5, 0.25, B); break;
      case 'explosion': this.noise(t, 0.7, 0.9, B, { type: 'lowpass', f0: 3500, f1: 80 }); this.osc('sine', 90, 25, t, 0.6, 0.9, B); break;
      case 'ko': this.osc('sine', 110, 28, t, 0.9, 0.9, B); this.noise(t, 0.5, 0.5, B, { type: 'lowpass', f0: 1500, f1: 100 }); break;
      case 'meter1': [784, 1175].forEach((f, i) => this.osc('pulse', f, f, t + i * 0.07, 0.12, 0.2, B)); break;
      case 'meter2': [523, 784, 1047, 1568].forEach((f, i) => this.osc('pulse', f, f * 1.01, t + i * 0.06, 0.2, 0.24, B)); this.noise(t, 0.35, 0.18, B, { type: 'highpass', f0: 3000, f1: 9000 }); break;
      case 'talkA': this.osc('square', 300, 280, t, 0.03, 0.06, B); break;
      case 'talkB': this.osc('square', 190, 175, t, 0.03, 0.07, B); break;
      case 'tick': this.osc('square', 1200, 1200, t, 0.04, 0.12, B); break;
      case 'win': [392, 523, 659, 784, 1047].forEach((f, i) => this.osc('pulse', f, f, t + i * 0.11, 0.35, 0.2, B)); break;
      case 'lose': [440, 415, 392, 370, 349].forEach((f, i) => this.osc('square', f, f * 0.9, t + i * 0.2, 0.28, 0.16, B)); break;
    }
  }

  // ---------- música (sequenciador com lookahead)
  music(name: SongName | null) {
    if (name === this.songName) return;
    this.songName = name;
    const file = name && FILE_TRACKS[name];
    this.song = name && !file ? SONGS[name as keyof typeof SONGS] ?? null : null;
    this.step = 0;
    clearInterval(this.timer);
    if (file) this.playFile(name!); else this.stopFile();
    if (!this.ctx) return;
    if (this.song) this.startSequencer();
  }
  async loadTracks() {
    try { FILE_TRACKS = await fetch(`${this.base}audio/music/tracks.json`).then((r) => r.json()); } catch { FILE_TRACKS = {}; }
  }
  /** Baixa uma música antes da hora, pra ela entrar no instante do clique. */
  preload(...names: string[]) { for (const n of names) if (hasTrack(n)) this.fileFor(n); }
  private fileFor(name: string) {
    let el = this.files.get(name);
    if (!el) {
      const t = FILE_TRACKS[name];
      el = new Audio(this.base + t.path); el.loop = true; el.preload = 'auto'; el.volume = t.vol; el.load();
      this.files.set(name, el);
    }
    return el;
  }
  private playFile(name: string) {
    const el = this.fileFor(name);
    if (this.fileEl === el) return;
    this.stopFile();
    el.muted = this.muted; el.currentTime = 0;
    this.fileEl = el;
    el.play().catch(() => { /* toca no próximo gesto (unlock) */ });
  }
  /** Tempo atual da música de arquivo (s), ou -1 se não estiver tocando. */
  musicTime() { return this.fileEl && !this.fileEl.paused ? this.fileEl.currentTime : -1; }
  seekMusic(t: number) { if (this.fileEl) this.fileEl.currentTime = t; }
  private stopFile() { if (this.fileEl) { this.fileEl.pause(); this.fileEl = null; } }
  private startSequencer() {
    this.nextStepTime = this.ctx!.currentTime + 0.05;
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.schedule(), 25);
  }
  private schedule() {
    const ctx = this.ctx!, song = this.song;
    if (!song) { clearInterval(this.timer); return; }
    const stepDur = 60 / song.bpm / 4;
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      this.playStep(song, this.step, this.nextStepTime, stepDur);
      this.step++;
      this.nextStepTime += stepDur;
    }
  }
  private playStep(song: Song, step: number, t: number, stepDur: number) {
    for (const tr of song.tracks) {
      const toks = tr.steps.split(/\s+/);
      const tok = toks[step % toks.length];
      if (tok === '.' || tok === '-') continue;
      if (tr.wave === 'drums') { this.drum(tok, t, tr.gain); continue; }
      // duração = até o próximo token que não seja "-"
      let len = 1;
      while (toks[(step + len) % toks.length] === '-' && len < 16) len++;
      const f = noteFreq(tok);
      if (!f) continue;
      const dur = stepDur * len * 0.9;
      const o = this.ctx!.createOscillator();
      if (tr.wave === 'pulse') o.setPeriodicWave(this.pulseWave!); else o.type = tr.wave;
      o.frequency.value = f;
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(tr.gain, t + 0.01);
      g.gain.setValueAtTime(tr.gain, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.musicBus); o.start(t); o.stop(t + dur + 0.01);
    }
  }
  private drum(tok: string, t: number, gain: number) {
    const M = this.musicBus;
    if (tok === 'k') this.osc('sine', 150, 40, t, 0.16, gain, M);
    else if (tok === 's') { this.noise(t, 0.14, gain * 0.5, M, { type: 'highpass', f0: 900 }); this.osc('triangle', 200, 120, t, 0.1, gain * 0.5, M); }
    else if (tok === 'h') this.noise(t, 0.035, gain * 0.25, M, { type: 'highpass', f0: 6000 });
    else if (tok === 'o') this.noise(t, 0.16, gain * 0.25, M, { type: 'highpass', f0: 5000 });
  }
}

export const audio = new AudioEngine();
