// 작은 입자 효과. 연출 계층 전용: 시뮬레이션 상태는 읽기만 한다.
//   발밑 먼지(달리기), 떨어지는 잎, 찻잔 김·고기 연기, 창가 먼지 반짝임, 반딧불, 빗방울 튐,
//   한숨 입김(대화가 끝난 뒤), 깜짝 놀람 선(기습), 안전지대의 따뜻한 불티

import type { ParticlesConfig } from '../../core/configSchemas';
import type { Rect, Vec2 } from '../../world/TileMap';

type Kind = 'dust' | 'leaf' | 'steam' | 'smoke' | 'mote' | 'firefly' | 'splash' | 'breath' | 'shock' | 'ember';

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  /** 흔들림·색 고르기용 0~1 */
  seed: number;
  /** 회전 (잎) 또는 방향 (놀람 선) */
  rot: number;
}

export interface ParticleEnv {
  view: Rect;
  player: { pos: Vec2; facing: number; running: boolean; moving: boolean };
  /** 달리는 다른 사람들 */
  runners: Vec2[];
  night: number;
  raining: boolean;
  /** 0~1 안전지대 */
  sanctuary: number;
  tileAt(x: number, y: number): string;
  outdoorAt(x: number, y: number): boolean;
  /** 지금 그리는 층 안인지 */
  inLayer(x: number, y: number): boolean;
}

const LEAF_COLORS = ['#7aa05a', '#93b06a', '#c9a24b', '#d08a4a', '#a7b65e'];
const MAX = 700;

export class Particles {
  private readonly list: Particle[] = [];
  private stepTimer = 0;
  private fireflies: Particle[] = [];

  constructor(private readonly cfg: ParticlesConfig) {}

  /** 대화가 끝난 뒤의 한숨 */
  sigh(p: Vec2, facing: number): void {
    for (let i = 0; i < 7; i++) {
      const a = facing + (Math.random() - 0.5) * 0.7;
      const sp = 0.5 + Math.random() * 0.5;
      this.add('breath', p.x + Math.cos(facing) * 0.3, p.y + Math.sin(facing) * 0.3 - 0.1, Math.cos(a) * sp, Math.sin(a) * sp - 0.15, 1.2 + Math.random() * 0.5, 0.1 + Math.random() * 0.06);
    }
  }

  /** 기습: 머리 둘레로 튀는 짧은 선 */
  startle(p: Vec2): void {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const pt = this.add('shock', p.x + Math.cos(a) * 0.45, p.y + Math.sin(a) * 0.45 - 0.2, Math.cos(a) * 2.2, Math.sin(a) * 2.2, 0.35, 0.22);
      if (pt) pt.rot = a;
    }
  }

  update(dt: number, e: ParticleEnv): void {
    const c = this.cfg;
    // 기존 입자
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        this.list[i] = this.list[this.list.length - 1]!;
        this.list.pop();
        continue;
      }
      this.move(p, dt);
    }

    // 발밑 먼지: 달릴 때 발걸음마다
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.stepTimer = 0.16;
      const feet = e.player.running && e.player.moving ? [e.player.pos, ...e.runners] : e.runners;
      for (const f of feet) {
        for (let k = 0; k < c.dustPerStep; k++) {
          const a = Math.random() * Math.PI * 2;
          this.add('dust', f.x + Math.cos(a) * 0.15, f.y + 0.25, Math.cos(a) * 0.35, -0.08 - Math.random() * 0.1, 0.5 + Math.random() * 0.3, 0.08 + Math.random() * 0.06);
        }
      }
    }

    // 구역 입자: 보이는 칸을 무작위로 골라, 맞는 칸이면 생긴다 (칸 수에 비례한 밀도)
    const [vx, vy, vw, vh] = e.view;
    const tries = Math.min(80, Math.ceil(vw * vh * dt * c.samplesPerTileSec));
    const day = 1 - e.night;
    for (let i = 0; i < tries; i++) {
      const tx = Math.floor(vx + Math.random() * vw);
      const ty = Math.floor(vy + Math.random() * vh);
      if (!e.inLayer(tx + 0.5, ty + 0.5)) continue;
      const id = e.tileAt(tx, ty);
      const r = Math.random();
      if (id === 'tree' && r < c.leaf) {
        this.add('leaf', tx + Math.random(), ty + Math.random() * 0.5, 0.25 + Math.random() * 0.3, 0.3 + Math.random() * 0.25, 3 + Math.random() * 2, 0.11 + Math.random() * 0.05);
      } else if (id === 'grill' && r < c.smoke) {
        this.add('smoke', tx + 0.3 + Math.random() * 0.4, ty + 0.5, (Math.random() - 0.5) * 0.1, -0.5 - Math.random() * 0.2, 2.2 + Math.random(), 0.18);
      } else if ((id === 'table' || id === 'counter' || id === 'appliance') && !e.outdoorAt(tx + 0.5, ty + 0.5) && r < c.steam) {
        this.add('steam', tx + 0.3 + Math.random() * 0.4, ty + 0.4, 0, -0.35 - Math.random() * 0.15, 1.6 + Math.random() * 0.6, 0.08);
      } else if (!e.outdoorAt(tx + 0.5, ty + 0.5) && r < c.mote * day && this.nearWindow(e, tx, ty)) {
        this.add('mote', tx + Math.random(), ty + Math.random(), (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, 4 + Math.random() * 3, 0.035 + Math.random() * 0.025);
      } else if (e.raining && r < c.splash && e.outdoorAt(tx + 0.5, ty + 0.5) && id !== 'tree' && id !== 'wall' && id !== 'window') {
        this.add('splash', tx + Math.random(), ty + Math.random(), 0, 0, 0.35, 0.05);
      }
    }

    // 안전지대: 따뜻한 불티가 천천히 오른다
    if (e.sanctuary > 0.3 && Math.random() < dt * c.embersPerSec * e.sanctuary) {
      this.add('ember', e.player.pos.x + (Math.random() - 0.5) * 6, e.player.pos.y + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 0.1, -0.15 - Math.random() * 0.1, 3 + Math.random() * 2, 0.05);
    }

    // 반딧불: 밤의 공원 수풀. 화면 안 수풀 칸에 떠 있다
    this.updateFireflies(dt, e);
  }

  draw(g: CanvasRenderingContext2D, time: number): void {
    g.save();
    for (const p of this.list) this.drawOne(g, p, time);
    g.globalCompositeOperation = 'lighter';
    for (const f of this.fireflies) {
      const blink = Math.max(0, Math.sin(time * (1.3 + f.seed) + f.seed * 20));
      const a = Math.min(1, f.age / 1.5) * Math.min(1, (f.life - f.age) / 1.5) * blink;
      if (a < 0.02) continue;
      const grad = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, 0.45);
      grad.addColorStop(0, `rgba(230, 255, 150, ${0.55 * a})`);
      grad.addColorStop(1, 'rgba(230, 255, 150, 0)');
      g.fillStyle = grad;
      g.fillRect(f.x - 0.45, f.y - 0.45, 0.9, 0.9);
    }
    g.restore();
  }

  private add(kind: Kind, x: number, y: number, vx: number, vy: number, life: number, size: number): Particle | null {
    if (this.list.length >= MAX) return null;
    const p: Particle = { kind, x, y, vx, vy, age: 0, life, size, seed: Math.random(), rot: Math.random() * Math.PI * 2 };
    this.list.push(p);
    return p;
  }

  private nearWindow(e: ParticleEnv, tx: number, ty: number): boolean {
    for (let d = 1; d <= 3; d++) if (e.tileAt(tx, ty - d) === 'window' || e.tileAt(tx - d, ty) === 'window' || e.tileAt(tx + d, ty) === 'window') return true;
    return false;
  }

  private move(p: Particle, dt: number): void {
    const k = p.age / p.life;
    switch (p.kind) {
      case 'leaf': {
        // 바람에 흔들리며 떨어지다가 땅에 닿으면 멈춘다
        if (k < 0.7) {
          p.x += (p.vx + Math.sin(p.age * 3 + p.seed * 9) * 0.5) * dt;
          p.y += p.vy * dt;
          p.rot += dt * (2 + p.seed * 3);
        }
        break;
      }
      case 'steam':
      case 'smoke':
        p.x += (p.vx + Math.sin(p.age * 2.5 + p.seed * 10) * 0.12) * dt;
        p.y += p.vy * dt;
        p.vy *= 1 - dt * 0.3;
        break;
      case 'mote':
        p.x += (p.vx + Math.sin(p.age * 0.7 + p.seed * 6) * 0.04) * dt;
        p.y += (p.vy + Math.cos(p.age * 0.5 + p.seed * 4) * 0.03) * dt;
        break;
      case 'shock':
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - dt * 8;
        p.vy *= 1 - dt * 8;
        break;
      default:
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - dt * 2.2;
        p.vy *= 1 - dt * 2.2;
    }
  }

  private drawOne(g: CanvasRenderingContext2D, p: Particle, time: number): void {
    const k = p.age / p.life;
    const fadeIn = Math.min(1, p.age / 0.15);
    switch (p.kind) {
      case 'dust': {
        g.fillStyle = `rgba(190, 175, 150, ${0.35 * (1 - k)})`;
        g.beginPath();
        g.arc(p.x, p.y, p.size * (1 + k * 1.6), 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'leaf': {
        const a = Math.min(fadeIn, k > 0.75 ? (1 - k) / 0.25 : 1);
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.scale(1, 0.5 + 0.5 * Math.abs(Math.sin(p.rot)));
        g.globalAlpha = a;
        g.fillStyle = LEAF_COLORS[Math.floor(p.seed * LEAF_COLORS.length)]!;
        g.beginPath();
        g.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(60, 50, 30, 0.35)';
        g.lineWidth = 0.012;
        g.beginPath();
        g.moveTo(-p.size, 0);
        g.lineTo(p.size, 0);
        g.stroke();
        g.restore();
        break;
      }
      case 'steam':
      case 'smoke': {
        const smoke = p.kind === 'smoke';
        const a = fadeIn * (1 - k) * (smoke ? 0.28 : 0.3);
        g.fillStyle = smoke ? `rgba(120, 115, 112, ${a})` : `rgba(255, 255, 255, ${a})`;
        g.beginPath();
        g.arc(p.x, p.y, p.size * (1 + k * (smoke ? 3 : 2.2)), 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'mote': {
        const tw = 0.5 + 0.5 * Math.sin(time * 3 + p.seed * 30);
        g.fillStyle = `rgba(255, 244, 210, ${0.55 * Math.sin(Math.PI * k) * tw})`;
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'splash': {
        g.strokeStyle = `rgba(220, 232, 250, ${0.6 * (1 - k)})`;
        g.lineWidth = 0.02;
        g.beginPath();
        g.ellipse(p.x, p.y, p.size + k * 0.12, (p.size + k * 0.12) * 0.55, 0, 0, Math.PI * 2);
        g.stroke();
        break;
      }
      case 'breath': {
        g.fillStyle = `rgba(240, 244, 250, ${0.4 * fadeIn * (1 - k)})`;
        g.beginPath();
        g.arc(p.x, p.y, p.size * (1 + k * 2), 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'shock': {
        g.strokeStyle = `rgba(255, 255, 255, ${0.9 * (1 - k)})`;
        g.lineWidth = 0.05;
        g.lineCap = 'round';
        const len = p.size * (1 - k * 0.5);
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x + Math.cos(p.rot) * len, p.y + Math.sin(p.rot) * len);
        g.stroke();
        break;
      }
      case 'ember': {
        const a = Math.sin(Math.PI * k) * (0.6 + 0.4 * Math.sin(time * 4 + p.seed * 12));
        g.fillStyle = `rgba(255, 196, 120, ${0.5 * a})`;
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'firefly':
        break;
    }
  }

  private updateFireflies(dt: number, e: ParticleEnv): void {
    const want = e.night > 0.5 ? Math.round(this.cfg.fireflies * (e.night - 0.5) * 2) : 0;
    for (const f of this.fireflies) {
      f.age += dt;
      f.vx += (Math.random() - 0.5) * dt * 1.2;
      f.vy += (Math.random() - 0.5) * dt * 1.2;
      f.vx *= 1 - dt;
      f.vy *= 1 - dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
    const [vx, vy, vw, vh] = e.view;
    this.fireflies = this.fireflies.filter((f) => f.age < f.life && f.x > vx - 2 && f.x < vx + vw + 2 && f.y > vy - 2 && f.y < vy + vh + 2);
    for (let i = 0; i < 6 && this.fireflies.length < want; i++) {
      const tx = Math.floor(vx + Math.random() * vw);
      const ty = Math.floor(vy + Math.random() * vh);
      const id = e.tileAt(tx, ty);
      if (id !== 'bush' && id !== 'tree' && id !== 'grass') continue;
      if (!e.inLayer(tx, ty)) continue;
      this.fireflies.push({ kind: 'firefly', x: tx + Math.random(), y: ty + Math.random(), vx: 0, vy: 0, age: 0, life: 6 + Math.random() * 6, size: 0.05, seed: Math.random(), rot: 0 });
    }
  }
}
