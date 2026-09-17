// Músicas chiptune tocadas pelo sequenciador em core/audio.ts.
// Cada track é uma string com um token por semicolcheia: nota ("e2", "g#3"), "." = pausa, "-" = sustenta.
// Bateria: k = bumbo, s = caixa, h = chimbal fechado, o = chimbal aberto.

export interface Song {
  bpm: number;
  tracks: { wave: 'square' | 'triangle' | 'sawtooth' | 'pulse' | 'drums'; gain: number; steps: string; octave?: number }[];
}

const bar = (s: string) => s.replace(/\|/g, ' ').trim();

/** Título: E menor, épico e sombrio, tipo abertura de fliperama. */
export const TITLE: Song = {
  bpm: 112,
  tracks: [
    { wave: 'triangle', gain: 0.55, steps: bar(`
      e2 . e2 . e2 . e2 e3 | e2 . e2 . e2 . b1 . | c2 . c2 . c2 . c2 c3 | c2 . c2 . d2 . d2 . |
      e2 . e2 . e2 . e2 e3 | e2 . e2 . e2 . b1 . | a1 . a1 . a1 . a1 a2 | b1 . b1 . b1 . b1 b2`) },
    { wave: 'pulse', gain: 0.22, steps: bar(`
      e4 - - . g4 - b4 - | a4 - g4 - e4 - - - | c4 - e4 - g4 - - - | a4 - g4 - f#4 - d4 - |
      e4 - - . g4 - b4 - | d5 - b4 - g4 - e4 - | c5 - b4 - a4 - g4 - | f#4 - - - b3 - - -`) },
    { wave: 'square', gain: 0.10, steps: bar(`
      e3 g3 b3 g3 e3 g3 b3 g3 | e3 g3 b3 g3 e3 g3 b3 g3 | c3 e3 g3 e3 c3 e3 g3 e3 | d3 f#3 a3 f#3 d3 f#3 a3 f#3 |
      e3 g3 b3 g3 e3 g3 b3 g3 | e3 g3 b3 g3 e3 g3 b3 g3 | a2 c3 e3 c3 a2 c3 e3 c3 | b2 d#3 f#3 d#3 b2 d#3 f#3 d#3`) },
    { wave: 'drums', gain: 0.5, steps: bar(`
      k . h . s . h . k . h h s . h o | k . h . s . h . k . h h s . s s | k . h . s . h . k . h h s . h o | k . h . s . h . k k h . s . o . |
      k . h . s . h . k . h h s . h o | k . h . s . h . k . h h s . s s | k . h . s . h . k . h h s . h o | k . h . s . h . k k h . s s s s`) },
  ],
};

/** Seleção: groove mais leve, A menor, tipo tela de escolha. */
export const SELECT: Song = {
  bpm: 126,
  tracks: [
    { wave: 'triangle', gain: 0.5, steps: bar(`
      a2 . a2 a3 . a2 . a2 | g2 . g2 g3 . g2 . g2 | f2 . f2 f3 . f2 . f2 | g2 . g2 . g2 . g2 g3 |
      a2 . a2 a3 . a2 . a2 | g2 . g2 g3 . g2 . g2 | f2 . f2 f3 . f2 . f2 | e2 . e2 . e2 . e2 e3`) },
    { wave: 'pulse', gain: 0.18, steps: bar(`
      . . a4 . c5 . e5 - | . . g4 . b4 . d5 - | . . f4 . a4 . c5 - | . . g4 . b4 . d5 e5 |
      a5 - g5 - e5 - c5 - | d5 - - - b4 - - - | c5 - a4 - f4 - a4 - | e4 - - - - - . .`) },
    { wave: 'square', gain: 0.08, steps: bar(`
      a3 . e4 . a3 . e4 . | g3 . d4 . g3 . d4 . | f3 . c4 . f3 . c4 . | g3 . d4 . g3 . d4 . |
      a3 . e4 . a3 . e4 . | g3 . d4 . g3 . d4 . | f3 . c4 . f3 . c4 . | e3 . b3 . e3 . b3 .`) },
    { wave: 'drums', gain: 0.45, steps: bar(`
      k . h . s . h h k . h . s . h . | k . h . s . h h k . h . s . o . | k . h . s . h h k . h . s . h . | k . h . s . h h k k s . s . o . |
      k . h . s . h h k . h . s . h . | k . h . s . h h k . h . s . o . | k . h . s . h h k . h . s . h . | k . h . s . h h k k s s s s o .`) },
  ],
};

/** Luta: rápido, D menor, tensão. */
export const FIGHT: Song = {
  bpm: 152,
  tracks: [
    { wave: 'triangle', gain: 0.55, steps: bar(`
      d2 d2 . d2 . d2 c2 . | d2 d2 . d2 . d2 f2 . | a#1 a#1 . a#1 . a#1 c2 . | a1 a1 . a1 . a1 c2 . |
      d2 d2 . d2 . d2 c2 . | d2 d2 . d2 . d2 f2 . | g1 g1 . g1 . g1 a#1 . | a1 . a1 . a1 . a1 a2`) },
    { wave: 'pulse', gain: 0.2, steps: bar(`
      d4 . f4 . a4 - g4 f4 | d4 - - . c4 . d4 - | a#3 . d4 . f4 - g4 f4 | a4 - - - . . g4 f4 |
      d4 . f4 . a4 - g4 f4 | d5 - c5 - a4 - f4 - | g4 - a#4 - d5 - c5 - | a4 - - - e4 - - -`) },
    { wave: 'sawtooth', gain: 0.07, steps: bar(`
      d3 . a3 . d3 . a3 . | d3 . a3 . d3 . a3 . | a#2 . f3 . a#2 . f3 . | a2 . e3 . a2 . e3 . |
      d3 . a3 . d3 . a3 . | d3 . a3 . d3 . a3 . | g2 . d3 . g2 . d3 . | a2 . e3 . a2 . e3 .`) },
    { wave: 'drums', gain: 0.55, steps: bar(`
      k . h . s . k . k . h . s . h h | k . h . s . k . k . h . s . o . | k . h . s . k . k . h . s . h h | k . h . s . k . k k s . s . o . |
      k . h . s . k . k . h . s . h h | k . h . s . k . k . h . s . o . | k . h . s . k . k . h . s . h h | k k h . s s k . s . s . s s o .`) },
  ],
};

export const SONGS = { title: TITLE, select: SELECT, fight: FIGHT };
export type SongName = keyof typeof SONGS;
