// Random com seed (mulberry32) pra IA reproduzível em teste.
export class Rng {
  private s: number;
  constructor(seed = Date.now() >>> 0) { this.s = seed >>> 0; }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  chance(p: number) { return this.next() < p; }
  range(a: number, b: number) { return a + this.next() * (b - a); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
}
