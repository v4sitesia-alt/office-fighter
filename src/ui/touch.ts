// Joystick + botões do gabinete escrevem na porta 0. Funciona com toque e mouse.
import type { Button, Input } from '../core/input';

export function bindCabinet(input: Input, panel: HTMLElement) {
  const port = input.ports[0];
  panel.querySelectorAll<HTMLElement>('[data-btn]').forEach((el) => {
    const b = el.dataset.btn as Button;
    const down = (e: PointerEvent) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch { /* pointer sintético */ } el.classList.add('down'); port.set(b, true); };
    const up = () => { el.classList.remove('down'); port.set(b, false); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  });

  const stick = panel.querySelector<HTMLElement>('.stick')!;
  const knob = stick.querySelector<HTMLElement>('.knob')!;
  const dirs: Button[] = ['left', 'right', 'up', 'down'];
  let active: number | null = null;
  const apply = (dx: number, dy: number) => {
    const dead = 14;
    port.set('left', dx < -dead); port.set('right', dx > dead);
    port.set('up', dy < -dead); port.set('down', dy > dead);
    const r = Math.min(30, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
    knob.style.transform = r > 4 ? `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px)` : '';
  };
  const center = () => { const b = stick.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault(); active = e.pointerId; stick.setPointerCapture(e.pointerId);
    const [cx, cy] = center(); apply(e.clientX - cx, e.clientY - cy);
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId !== active) return; const [cx, cy] = center(); apply(e.clientX - cx, e.clientY - cy); });
  const release = (e: PointerEvent) => { if (e.pointerId !== active) return; active = null; dirs.forEach((d) => port.set(d, false)); knob.style.transform = ''; };
  stick.addEventListener('pointerup', release);
  stick.addEventListener('pointercancel', release);
}
