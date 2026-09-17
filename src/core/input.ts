// Input abstrato: teclado e toque escrevem no mesmo estado de botões por "porta"
// (porta 0 = jogador 1, porta 1 = jogador 2 / CPU). O jogo lê held()/pressed()
// uma vez por passo fixo; toques mais curtos que um passo ficam retidos (latch).

export type Button =
  | 'left' | 'right' | 'up' | 'down'
  | 'block' | 'punch' | 'kick' | 'heavy' | 'special'
  | 'start' | 'pause';

export const BUTTONS: Button[] = ['left', 'right', 'up', 'down', 'block', 'punch', 'kick', 'heavy', 'special', 'start', 'pause'];

/** Mapeamento de teclado, remapeável. Porta 1 já prevista pro multiplayer local. */
export const KEYMAP: Record<number, Record<string, Button>> = {
  0: {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    KeyZ: 'block', KeyA: 'punch', KeyS: 'kick', KeyD: 'heavy', KeyX: 'special',
    Enter: 'start', Escape: 'pause', KeyP: 'pause',
  },
  1: {
    KeyJ: 'left', KeyL: 'right', KeyI: 'up', KeyK: 'down',
    KeyN: 'block', KeyU: 'punch', KeyO: 'kick', KeyH: 'heavy', KeyM: 'special',
  },
};

/** Alguns teclados virtuais não preenchem e.code; cai pra e.key. */
function codeOf(e: KeyboardEvent) {
  if (e.code) return e.code;
  const k = e.key;
  if (k.length === 1 && /[a-z]/i.test(k)) return 'Key' + k.toUpperCase();
  return k;
}

export interface Controller {
  held(b: Button): boolean;
  pressed(b: Button): boolean;   // borda de descida neste passo
}

export class Port implements Controller {
  private down = new Set<Button>();
  private latch = new Set<Button>();
  private edge = new Set<Button>();

  set(b: Button, isDown: boolean) {
    if (isDown) {
      if (!this.down.has(b)) this.latch.add(b);
      this.down.add(b);
    } else {
      this.down.delete(b);
    }
  }
  /** Chamado uma vez por passo fixo, antes da lógica ler o input. */
  step() {
    this.edge = this.latch;
    this.latch = new Set();
  }
  held(b: Button) { return this.down.has(b); }
  pressed(b: Button) { return this.edge.has(b); }
  clear() { this.down.clear(); this.latch.clear(); this.edge.clear(); }
}

export class Input {
  ports: Port[] = [new Port(), new Port()];
  /** Qualquer botão de confirmação/ataque foi pressionado neste passo (menus). */
  anyPressed = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (this.route(codeOf(e), true)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.route(codeOf(e), false); });
    window.addEventListener('blur', () => this.ports.forEach((p) => p.clear()));
  }

  private route(code: string, isDown: boolean) {
    let handled = false;
    for (const [port, map] of Object.entries(KEYMAP)) {
      const b = map[code];
      if (b) { this.ports[Number(port)].set(b, isDown); handled = true; }
    }
    return handled;
  }

  step() {
    this.ports.forEach((p) => p.step());
    const p = this.ports[0];
    this.anyPressed = (['start', 'punch', 'kick', 'heavy', 'special'] as Button[]).some((b) => p.pressed(b));
  }
}

/** Controle "virtual" onde a IA escreve seus comandos. */
export class VirtualController implements Controller {
  private cur = new Set<Button>();
  private prev = new Set<Button>();
  begin() { this.prev = this.cur; this.cur = new Set(); }
  press(b: Button) { this.cur.add(b); }
  held(b: Button) { return this.cur.has(b); }
  pressed(b: Button) { return this.cur.has(b) && !this.prev.has(b); }
}
