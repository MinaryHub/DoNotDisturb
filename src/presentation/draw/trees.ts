// 나무 수관: 칸보다 크게, 바람에 살짝 흔들리게 사람 위에 그린다. 밑을 지나가면 반투명해진다.
// 잎 덩어리는 모양 몇 가지를 미리 오프스크린에 그려 두고 늘려 쓴다.

import { hashOf, shade } from './people';

const SPRITE_PX = 96;
const VARIANTS = 4;

export class Canopies {
  private readonly sprites = new Map<string, HTMLCanvasElement>();

  /** 바닥에 떨어지는 큰 그림자 (사람보다 먼저) */
  drawShadows(g: CanvasRenderingContext2D, trees: { x: number; y: number }[], time: number): void {
    g.fillStyle = 'rgba(20, 30, 20, 0.16)';
    for (const t of trees) {
      const r = radiusOf(t);
      const s = sway(t, time);
      g.beginPath();
      g.ellipse(t.x + 0.45 + s * 0.6, t.y + 0.55, r * 0.95, r * 0.8, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  draw(g: CanvasRenderingContext2D, trees: { x: number; y: number }[], color: string, time: number, near: { x: number; y: number }): void {
    for (const t of trees) {
      const r = radiusOf(t);
      const v = hashOf(`${t.x},${t.y}`) % VARIANTS;
      const s = sway(t, time);
      const d = Math.hypot(near.x - t.x, near.y - t.y);
      g.globalAlpha = d < r + 0.2 ? 0.4 + 0.6 * Math.max(0, (d - r * 0.4) / (r * 0.6 + 0.2)) : 1;
      const size = r * 2.2;
      g.drawImage(this.sprite(color, v), t.x - size / 2 + s, t.y - size / 2 - 0.15, size, size);
    }
    g.globalAlpha = 1;
  }

  private sprite(color: string, variant: number): HTMLCanvasElement {
    const key = `${color}:${variant}`;
    let c = this.sprites.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = SPRITE_PX;
    const g = c.getContext('2d')!;
    g.scale(SPRITE_PX / 2.2, SPRITE_PX / 2.2);
    g.translate(1.1, 1.1);
    const lobes = 7 + variant;
    const blob = (r: number, fill: string, dx = 0, dy = 0) => {
      g.fillStyle = fill;
      for (let i = 0; i < lobes; i++) {
        const k = hashOf(`${variant}:${i}`);
        const a = (i / lobes) * Math.PI * 2 + (k % 10) * 0.05;
        const rr = r * (0.42 + (k % 7) * 0.025);
        g.beginPath();
        g.arc(dx + Math.cos(a) * r * 0.55, dy + Math.sin(a) * r * 0.55, rr, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      g.arc(dx, dy, r * 0.62, 0, Math.PI * 2);
      g.fill();
    };
    // 바깥 어두운 잎 → 중간 → 볕 받은 왼쪽 위 → 하이라이트 점
    blob(1, shade(color, -0.2));
    blob(0.88, color, -0.03, -0.04);
    blob(0.6, shade(color, 0.1), -0.14, -0.16);
    blob(0.3, shade(color, 0.22), -0.26, -0.28);
    for (let i = 0; i < 14; i++) {
      const k = hashOf(`leaf${variant}:${i}`);
      const a = (k % 628) / 100;
      const rr = ((k >>> 10) % 80) / 100;
      g.fillStyle = i % 3 ? shade(color, -0.28) : shade(color, 0.3);
      g.beginPath();
      g.ellipse(Math.cos(a) * rr, Math.sin(a) * rr, 0.07, 0.04, a, 0, Math.PI * 2);
      g.fill();
    }
    this.sprites.set(key, c);
    return c;
  }
}

function radiusOf(t: { x: number; y: number }): number {
  return 0.95 + (hashOf(`r${t.x},${t.y}`) % 5) * 0.08;
}

function sway(t: { x: number; y: number }, time: number): number {
  const p = (hashOf(`s${t.x},${t.y}`) % 100) / 16;
  return Math.sin(time * 0.9 + p) * 0.035 + Math.sin(time * 2.3 + p * 2) * 0.012;
}
