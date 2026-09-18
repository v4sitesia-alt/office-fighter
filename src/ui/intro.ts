// Abertura cinematográfica desenhada no canvas, sincronizada com a música (t em segundos):
//  0–5,5   TV antiga ligando com interferência -> logo V4
//  5,5–12,5 cidade à noite, câmera da esquerda pra direita
//  12,5–20  torre: câmera sobe até o letreiro V4; aos 20 s entra a tela de título
import { loadImage } from '../core/assets';
import { H, W } from '../game/consts';

export const INTRO_END = 19;
const T_LOGO = 5.5, T_CITY = 9.5;

export class Intro {
  private logo!: HTMLImageElement; private city!: HTMLImageElement; private tower!: HTMLImageElement;
  async load(base: string) {
    [this.logo, this.city, this.tower] = await Promise.all(['logo.jpg', 'city.jpg', 'tower.jpg'].map((f) => loadImage(`${base}intro/${f}`)));
  }

  render(ctx: CanvasRenderingContext2D, t: number) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (t < T_LOGO) this.tv(ctx, t);
    else if (t < T_CITY) this.cityPan(ctx, (t - T_LOGO) / (T_CITY - T_LOGO));
    else this.towerRise(ctx, Math.min(1, (t - T_CITY) / (INTRO_END - T_CITY)));
    // fusões entre as cenas
    const fade = (at: number, len: number) => Math.max(0, 1 - Math.abs(t - at) / len);
    const f = Math.max(fade(T_LOGO, 0.5), fade(T_CITY, 0.6), t > INTRO_END - 0.35 ? (t - (INTRO_END - 0.35)) / 0.35 : 0);
    if (f > 0) { ctx.fillStyle = t > INTRO_END - 0.35 ? `rgba(255,255,255,${f})` : `rgba(0,0,0,${f})`; ctx.fillRect(0, 0, W, H); }
    this.scanlines(ctx);
  }

  private tv(ctx: CanvasRenderingContext2D, t: number) {
    // 0–0,5 s: linha branca abrindo; depois chuvisco cedendo lugar ao logo
    if (t < 0.5) {
      const k = t / 0.5;
      ctx.fillStyle = '#fff';
      ctx.fillRect(W / 2 - (W / 2) * Math.min(1, k * 2), H / 2 - 1 - (H / 2) * Math.max(0, k * 2 - 1) ** 2, W * Math.min(1, k * 2), 2 + H * Math.max(0, k * 2 - 1) ** 2);
      return;
    }
    const signal = Math.min(1, (t - 0.5) / 2.2);             // 0 = só chuvisco, 1 = imagem firme
    const glitch = Math.random() < 0.12 + (1 - signal) * 0.5;
    const size = 430, x0 = (W - size) / 2, y0 = (H - size) / 2;
    const roll = glitch ? (Math.random() - 0.5) * 60 * (1.2 - signal) : 0;
    // separação RGB
    ctx.globalAlpha = 0.25 + signal * 0.75;
    ctx.drawImage(this.logo, x0, y0 + roll, size, size);
    if (glitch) {
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.5;
      ctx.drawImage(this.logo, x0 - 8, y0 + roll, size, size); ctx.drawImage(this.logo, x0 + 8, y0 + roll, size, size);
      ctx.globalCompositeOperation = 'source-over';
      // faixas rasgadas na horizontal
      for (let i = 0; i < 4; i++) {
        const by = Math.random() * H, bh = 6 + Math.random() * 26, dx = (Math.random() - 0.5) * 120;
        ctx.globalAlpha = 1; ctx.drawImage(ctx.canvas, 0, by, W, bh, dx, by, W, bh);
      }
    }
    // chuvisco
    ctx.globalAlpha = (1 - signal) * 0.85 + 0.06;
    for (let i = 0; i < 1400; i++) {
      const v = Math.random() * 255 | 0;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 5, 2);
    }
    ctx.globalAlpha = 1;
    // vinheta de tubo
    const g = ctx.createRadialGradient(W / 2, H / 2, 140, W / 2, H / 2, 560);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  private cityPan(ctx: CanvasRenderingContext2D, k: number) {
    const s = 1.15, dw = W * s, dh = H * s;   // quase a imagem inteira: cidade vista de longe
    const x = -(dw - W) * k, y = -(dh - H) * 0.55;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.city, x, y, dw, dh);
  }

  private towerRise(ctx: CanvasRenderingContext2D, k: number) {
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // ease in-out
    const s0 = W / this.tower.width;                                    // largura cheia
    const zoom = 1 + e * 0.9;                                           // fecha no letreiro
    const s = s0 * zoom, dw = this.tower.width * s, dh = this.tower.height * s;
    const signX = 0.62, signY = 0.31;                                   // letreiro V4 na imagem
    const startCy = this.tower.height * s0 - H / 2;                     // base da torre
    const cy = startCy + (signY * dh - startCy) * e;
    const cx = W / 2 + (signX * dw - W / 2) * e;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.tower, W / 2 - cx, H / 2 - cy, dw, dh);
  }

  private scanlines(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  }
}
