// Loop de passo fixo a 60 fps com acumulador. A lógica de combate roda sempre em
// passos inteiros de 1/60 s (frame data determinística); o render roda por rAF.

export const STEP_MS = 1000 / 60;
const MAX_STEPS = 5; // evita espiral da morte se a aba ficar em segundo plano

export interface LoopHooks {
  update(frame: number): void;
  render(alpha: number): void;
}

export function startLoop(hooks: LoopHooks) {
  let acc = 0;
  let last = performance.now();
  let frame = 0;
  let rafId = 0;

  function tick(now: number) {
    rafId = requestAnimationFrame(tick);
    let dt = now - last;
    last = now;
    if (dt > 250) dt = 250; // voltou de aba oculta: não tenta compensar tudo
    acc += dt;
    let steps = 0;
    while (acc >= STEP_MS && steps < MAX_STEPS) {
      hooks.update(frame++);
      acc -= STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS) acc = 0;
    hooks.render(acc / STEP_MS);
  }
  rafId = requestAnimationFrame(tick);
  return { stop: () => cancelAnimationFrame(rafId) };
}
