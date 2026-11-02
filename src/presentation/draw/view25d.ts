// 2.5D(비스듬히 내려다보는 시점) 시제품 그리기.
// 바닥 좌표는 2D 그대로 두고, 벽·가구는 '앞면 높이'를 세워 그리며, 사람은 서 있는 모습으로 그린다.
// 게임 판정(충돌·시야·길찾기)은 바뀌지 않는다. 그림만 다르다.

import type { TileDef } from '../../world/TileMap';
import { paintDeco, type TileNeighbors } from './tiles';
import { shade, type Look } from './people';

/** 그리기 순서 정렬용: 바닥에 닿는 아래쪽 y가 클수록 나중에 (앞에) 그린다 */
export interface Drawable {
  base: number;
  draw(): void;
}

/** 위에서 덮개 면을 탑다운 장식으로 그려도 자연스러운 가구 */
const TOP_DECO = new Set(['desk', 'bed', 'sofa', 'counter', 'table', 'shelf', 'books', 'readingTable', 'grill']);

/**
 * 칸 하나를 높이 h(칸)의 덩어리로 그린다. 윗면은 위로 h만큼 올라가고, 앞면이 칸 아래쪽까지 내려온다.
 * alpha: 뒤에 사람이 가려질 때 반투명
 */
export function drawBlock(
  g: CanvasRenderingContext2D,
  d: TileDef,
  n: TileNeighbors,
  tx: number,
  ty: number,
  h: number,
  hBelow: number,
  alpha: number,
  dim: number,
): void {
  g.save();
  g.globalAlpha = alpha;
  const top = ty - h;
  const deco = d.deco ?? d.id;

  if (deco === 'plant') {
    drawPlant(g, tx, ty, h, d.color);
    g.restore();
    return;
  }

  // 앞면: 아래 칸이 같은 높이 이상의 덩어리면 가려지므로 생략
  if (hBelow < h) {
    const fy = ty + 1 - h;
    const grad = g.createLinearGradient(0, fy, 0, ty + 1);
    const base = deco === 'window' ? '#7d9db0' : d.color;
    grad.addColorStop(0, shade(base, -0.12 - dim * 0.2));
    grad.addColorStop(1, shade(base, -0.34 - dim * 0.2));
    g.fillStyle = grad;
    g.fillRect(tx, fy, 1.01, h);
    frontDetail(g, deco, tx, fy, h, d.color, n);
    // 바닥과 맞닿는 그림자 선
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(tx, ty + 0.94, 1.01, 0.06);
  }

  // 윗면
  g.fillStyle = shade(d.color, 0.1 - dim * 0.25);
  g.fillRect(tx, top, 1.01, 1.01);
  if (TOP_DECO.has(deco)) {
    paintDeco(g, d, n, tx, top, tx, ty);
  } else if (deco === 'window') {
    g.fillStyle = 'rgba(200, 230, 245, 0.55)';
    g.fillRect(tx, top + 0.3, 1.01, 0.4);
  } else if (deco === 'doorClosed') {
    g.fillStyle = shade(d.color, -0.2);
    g.fillRect(tx, top + 0.35, 1.01, 0.3);
  }
  // 윗면 가장자리: 이웃이 낮으면 어두운 테두리로 끊는다
  g.fillStyle = 'rgba(255,255,255,0.12)';
  if (hBelow < h) g.fillRect(tx, top + 0.94, 1.01, 0.06);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  if (!n.left.tall) g.fillRect(tx, top, 0.04, 1);
  if (!n.right.tall) g.fillRect(tx + 0.96, top, 0.04, 1);
  if (!n.up.tall) g.fillRect(tx, top, 1, 0.04);
  if (dim > 0) {
    g.fillStyle = `rgba(20, 18, 28, ${dim * 0.35})`;
    g.fillRect(tx, top, 1.01, 1.01 + h);
  }
  g.restore();
}

function frontDetail(g: CanvasRenderingContext2D, deco: string, x: number, fy: number, h: number, color: string, n: TileNeighbors): void {
  switch (deco) {
    case 'wall':
    case 'partition':
      // 걸레받이 + 벽지 줄
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x, fy + h - 0.12, 1.01, 0.08);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(x, fy + h * 0.45, 1.01, 0.02);
      break;
    case 'window': {
      // 유리: 바깥 빛이 비친다
      g.fillStyle = 'rgba(210, 236, 248, 0.35)';
      g.fillRect(x + 0.06, fy + 0.12, 0.88, h - 0.3);
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.beginPath();
      g.moveTo(x + 0.15, fy + h - 0.25);
      g.lineTo(x + 0.4, fy + 0.15);
      g.lineTo(x + 0.52, fy + 0.15);
      g.lineTo(x + 0.27, fy + h - 0.25);
      g.fill();
      g.fillStyle = '#5d6b78';
      g.fillRect(x, fy + h - 0.2, 1.01, 0.08);
      if (n.left.deco !== 'window') g.fillRect(x, fy, 0.06, h);
      break;
    }
    case 'doorClosed':
      g.strokeStyle = shade(color, -0.45);
      g.lineWidth = 0.04;
      g.strokeRect(x + 0.12, fy + 0.08, 0.76, h - 0.1);
      g.fillStyle = '#d8c39a';
      g.beginPath();
      g.arc(x + 0.76, fy + h * 0.55, 0.05, 0, Math.PI * 2);
      g.fill();
      break;
    case 'appliance':
      // 냉장고 문 두 짝과 손잡이
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(x, fy + h * 0.38, 1.01, 0.03);
      g.fillStyle = '#9aa0a8';
      g.fillRect(x + 0.8, fy + 0.12, 0.05, h * 0.2);
      g.fillRect(x + 0.8, fy + h * 0.45, 0.05, h * 0.3);
      break;
    case 'desk':
    case 'counter':
      // 서랍·수납장 문
      g.strokeStyle = 'rgba(0,0,0,0.2)';
      g.lineWidth = 0.03;
      g.strokeRect(x + 0.08, fy + 0.06, 0.84, h - 0.14);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x + 0.44, fy + h * 0.35, 0.12, 0.03);
      break;
    case 'bed':
      // 이불 자락
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillRect(x, fy, 1.01, h * 0.45);
      break;
    case 'sofa':
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x + 0.04, fy + 0.04, 0.92, h * 0.4);
      break;
    case 'shelf':
    case 'books':
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 1; i < 3; i++) g.fillRect(x, fy + (h * i) / 3, 1.01, 0.03);
      break;
    default:
      break;
  }
}

/** 화분: 덩어리 대신 화분 + 잎 뭉치 */
function drawPlant(g: CanvasRenderingContext2D, x: number, y: number, h: number, color: string): void {
  const cx = x + 0.5;
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath();
  g.ellipse(cx, y + 0.85, 0.32, 0.1, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#b5764f';
  g.beginPath();
  g.moveTo(cx - 0.24, y + 0.5);
  g.lineTo(cx + 0.24, y + 0.5);
  g.lineTo(cx + 0.17, y + 0.88);
  g.lineTo(cx - 0.17, y + 0.88);
  g.closePath();
  g.fill();
  const leaf = (dx: number, dy: number, r: number, k: number) => {
    g.fillStyle = shade(color, k);
    g.beginPath();
    g.arc(cx + dx, y + 0.5 - h * 0.55 + dy, r, 0, Math.PI * 2);
    g.fill();
  };
  leaf(-0.15, 0.12, 0.26, -0.1);
  leaf(0.16, 0.1, 0.25, -0.05);
  leaf(0, -0.08, 0.3, 0.05);
  leaf(-0.05, -0.2, 0.18, 0.18);
}

export interface StandOptions {
  /** 키 (칸) */
  height: number;
  facing: number;
  walkPhase: number;
  walking: boolean;
  running?: boolean;
  time: number;
  seed: number;
  bob?: number;
  faceless?: boolean;
  /** 손 내밀기 (전단지·시식) 0~0.5 */
  reach?: number;
  talk?: number;
  hunch?: number;
  phoneHold?: number;
  coverFace?: boolean;
  eyesClosed?: boolean;
  mask?: boolean;
  earphones?: boolean;
  blush?: number;
  tremble?: number;
  seated?: boolean;
  /** 고개 돌림 (라디안, 몸 기준) */
  headTurn?: number;
}

/**
 * 서 있는 사람. (x, y) = 발 위치. 위로 height만큼 선다.
 * 앞·뒤·옆 세 방향으로만 그리고, 얼굴은 고개 돌림만큼 옆으로 밀린다.
 */
export function drawStanding(g: CanvasRenderingContext2D, x: number, y: number, look: Look, o: StandOptions): void {
  const H = o.height * (o.seated ? 0.72 : 1);
  const fx = Math.cos(o.facing);
  const fy = Math.sin(o.facing);
  const view: 'front' | 'back' | 'side' = fy > 0.45 ? 'front' : fy < -0.45 ? 'back' : 'side';
  const side = fx >= 0 ? 1 : -1;
  const hunch = o.hunch ?? 0;
  const s = o.walking ? Math.sin(o.walkPhase) : 0;
  const breath = o.walking ? 0 : Math.sin(o.time * 2.1 + o.seed) * 0.012;
  const tremble = o.tremble ? (Math.random() - 0.5) * o.tremble * 0.03 : 0;
  const W = 0.42 * look.build * (view === 'side' ? 0.72 : 1) * (1 - hunch * 0.1);

  // 발밑 그림자
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath();
  g.ellipse(x, y, 0.3, 0.11, 0, 0, Math.PI * 2);
  g.fill();

  g.save();
  g.translate(x + tremble, y + (o.bob ?? 0));
  g.lineCap = 'round';

  const hip = -H * 0.46;
  const shoulder = -H * 0.8 + breath + hunch * 0.05;
  // ── 다리
  if (!o.seated) {
    for (const leg of [-1, 1]) {
      const swing = s * leg * (o.running ? 0.22 : 0.14);
      const footX = view === 'side' ? swing * side : leg * 0.09;
      const lift = view === 'side' ? 0 : Math.max(0, swing) * 0.4;
      g.strokeStyle = look.bottom;
      g.lineWidth = 0.13;
      g.beginPath();
      g.moveTo(leg * (view === 'side' ? 0.02 : 0.08), hip);
      g.lineTo(footX, -0.07 - lift);
      g.stroke();
      g.fillStyle = shade(look.shoes, -0.2);
      g.beginPath();
      g.ellipse(footX + (view === 'side' ? side * 0.05 : 0), -0.04 - lift, 0.08, 0.05, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    g.fillStyle = look.bottom;
    g.fillRect(-W / 2, hip - 0.02, W, 0.18);
  }

  // ── 몸통
  const bodyTop = shoulder;
  const lean = (o.running ? 0.05 : 0) * side * (view === 'side' ? 1 : 0) + hunch * 0.04 * (view === 'side' ? side : 0);
  g.fillStyle = look.top;
  roundRect(g, -W / 2 + lean, bodyTop, W, hip - bodyTop + 0.06, 0.1);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(-W / 2 + lean, hip - 0.06, W, 0.12);
  if (look.pattern === 'stripe') {
    g.fillStyle = 'rgba(255,255,255,0.22)';
    for (let i = 1; i < 4; i++) g.fillRect(-W / 2 + lean, bodyTop + ((hip - bodyTop) * i) / 4, W, 0.025);
  } else if (look.pattern === 'hoodie' && view !== 'front') {
    g.fillStyle = shade(look.top, -0.15);
    g.beginPath();
    g.ellipse(lean, bodyTop + 0.04, W * 0.32, 0.08, 0, 0, Math.PI * 2);
    g.fill();
  } else if (look.pattern === 'jacket' && view === 'front') {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(lean - 0.015, bodyTop + 0.04, 0.03, hip - bodyTop);
  }

  // ── 팔
  const armY = bodyTop + 0.06;
  const handDrop = -H * 0.5;
  const phone = o.phoneHold ?? 0;
  const arm = (ax: number, hx: number, hy: number) => {
    g.strokeStyle = shade(look.top, -0.08);
    g.lineWidth = 0.1;
    g.beginPath();
    g.moveTo(ax, armY);
    g.lineTo(hx, hy);
    g.stroke();
    g.fillStyle = look.skin;
    g.beginPath();
    g.arc(hx, hy, 0.05, 0, Math.PI * 2);
    g.fill();
  };
  const headY = shoulder - H * 0.13 + hunch * 0.06;
  const headX = lean + (view === 'side' ? side * hunch * 0.05 : 0);
  if (o.coverFace) {
    arm(-W / 2 + lean, headX - 0.13, headY + 0.04);
    arm(W / 2 + lean, headX + 0.13, headY + 0.04);
  } else if (phone > 0.3) {
    const px = view === 'side' ? side * 0.2 : 0;
    arm(-W / 2 + lean, px - 0.05, armY + 0.18);
    arm(W / 2 + lean, px + 0.05, armY + 0.18);
    if (view !== 'back') {
      g.fillStyle = '#20232b';
      g.fillRect(px - 0.07, armY + 0.08, 0.14, 0.16);
      g.fillStyle = `rgba(160, 210, 255, ${0.85 * phone})`;
      g.fillRect(px - 0.05, armY + 0.1, 0.1, 0.12);
    }
  } else if ((o.reach ?? 0) > 0) {
    const r = o.reach ?? 0;
    arm(-W / 2 + lean, -W / 2 + lean - 0.02, handDrop);
    const hx = view === 'side' ? side * (0.25 + r) : W / 2 + 0.05;
    const hy = armY + 0.12 + (view === 'front' ? 0.1 : 0);
    arm(W / 2 + lean, hx, hy);
    g.fillStyle = '#fffbe8';
    g.fillRect(hx - 0.06, hy - 0.12, 0.12, 0.16);
  } else {
    const talk = (o.talk ?? 0) * Math.sin(o.time * 6 + o.seed) * 0.08;
    for (const a of [-1, 1]) {
      const swing = -s * a * (o.running ? 0.14 : 0.08);
      const ax = a * W / 2 + lean;
      const hx = view === 'side' ? swing * side + lean : ax + a * 0.03;
      arm(ax, hx, handDrop + (a > 0 ? talk : 0) + (view === 'side' ? 0 : Math.abs(swing) * 0.2));
    }
  }

  // ── 머리
  const hr = 0.17;
  const turn = Math.max(-1, Math.min(1, (o.headTurn ?? 0) / 1.1));
  // 얼굴이 보이는 쪽으로 밀리는 정도 (앞모습일 때만 고개 돌림이 보인다)
  const faceShift = view === 'side' ? side * 0.07 : view === 'front' ? turn * 0.06 : 0;
  const bald = look.hairStyle === 'bald';
  if (view === 'side') {
    // 옆모습: 뒤통수 머리카락 위에 얼굴
    g.fillStyle = bald ? look.skin : look.hair;
    g.beginPath();
    g.arc(headX - side * 0.03, headY - 0.01, hr, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = look.skin;
    g.beginPath();
    g.arc(headX + side * 0.04, headY + 0.02, hr * 0.8, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillStyle = look.skin;
    g.beginPath();
    g.arc(headX, headY, hr, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = look.hair;
  if (!bald) {
    if (view === 'back') {
      g.beginPath();
      g.arc(headX, headY, hr * 1.04, 0, Math.PI * 2);
      g.fill();
    } else if (view === 'front') {
      g.beginPath();
      g.arc(headX, headY - 0.02, hr * 1.03, Math.PI * 1.02, Math.PI * 1.98);
      g.fill();
    }
    if (look.hairStyle === 'long' || look.hairStyle === 'ponytail') {
      // 긴 머리: 얼굴을 가리지 않게 뒤·옆으로만
      const len = hr * (look.hairStyle === 'long' ? 1.3 : 0.8);
      if (view === 'back') g.fillRect(headX - hr, headY, hr * 2, len);
      else if (view === 'front') {
        g.fillRect(headX - hr * 1.02, headY - 0.02, 0.06, len);
        g.fillRect(headX + hr * 1.02 - 0.06, headY - 0.02, 0.06, len);
      } else g.fillRect(side > 0 ? headX - hr * 1.03 : headX + hr * 0.48, headY - 0.02, hr * 0.55, len);
    }
    if (look.hairStyle === 'bun') {
      g.beginPath();
      g.arc(headX - (view === 'side' ? side * 0.12 : 0), headY - hr * 1.05, 0.07, 0, Math.PI * 2);
      g.fill();
    }
    if (look.hairStyle === 'cap') {
      g.fillStyle = look.accent;
      g.fillRect(headX - hr, headY - hr * 0.9, hr * 2, hr * 0.45);
      if (view !== 'back') g.fillRect(headX + (view === 'side' ? side * hr * 0.5 : -hr * 0.6), headY - hr * 0.5, view === 'side' ? side * hr * 0.9 : hr * 1.2, 0.04);
    }
  }
  if (view !== 'back' && !o.faceless) {
    const ex = headX + faceShift;
    const ey = headY + 0.01;
    // 볼 홍조
    if ((o.blush ?? 0) > 0.05) {
      g.fillStyle = `rgba(232, 90, 90, ${Math.min(0.75, (o.blush ?? 0) * 0.8)})`;
      for (const c of view === 'side' ? [side] : [-1, 1]) {
        g.beginPath();
        g.ellipse(ex + c * 0.08, ey + 0.06, 0.05, 0.03, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    // 눈
    g.fillStyle = '#2e2a30';
    const eyes = view === 'side' ? [side * 0.07] : [-0.065, 0.065];
    for (const e of eyes) {
      if (o.eyesClosed) g.fillRect(ex + e - 0.03, ey - 0.005, 0.06, 0.015);
      else {
        g.beginPath();
        g.arc(ex + e, ey, 0.022, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (o.mask) {
      g.fillStyle = '#e8edf0';
      roundRect(g, ex - (view === 'side' ? 0.02 - side * 0.04 : 0.1), ey + 0.04, view === 'side' ? 0.12 : 0.2, 0.09, 0.03);
      g.fill();
    } else if ((o.talk ?? 0) > 0 && view === 'front') {
      g.fillStyle = '#7a3e3e';
      g.fillRect(ex - 0.025, ey + 0.08, 0.05, 0.01 + Math.abs(Math.sin(o.time * 12)) * 0.025);
    }
  }
  if (o.earphones) {
    g.fillStyle = '#f5f5f5';
    for (const c of view === 'side' ? [-side] : [-1, 1]) {
      g.beginPath();
      g.arc(headX + c * hr * (view === 'side' ? 0.3 : 0.95), headY + 0.03, 0.04, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/** 고양이 (옆모습) */
export function drawCatStanding(g: CanvasRenderingContext2D, x: number, y: number, facing: number, color: string, time: number): void {
  const side = Math.cos(facing) >= 0 ? 1 : -1;
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath();
  g.ellipse(x, y, 0.28, 0.08, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y - 0.2, 0.26, 0.13, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(x + side * 0.24, y - 0.33, 0.11, 0, Math.PI * 2);
  g.fill();
  // 귀
  for (const e of [-0.05, 0.05]) {
    g.beginPath();
    g.moveTo(x + side * 0.24 + e - 0.04, y - 0.4);
    g.lineTo(x + side * 0.24 + e, y - 0.5);
    g.lineTo(x + side * 0.24 + e + 0.04, y - 0.4);
    g.fill();
  }
  g.strokeStyle = color;
  g.lineWidth = 0.05;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - side * 0.24, y - 0.22);
  g.quadraticCurveTo(x - side * 0.42, y - 0.3 + Math.sin(time * 3) * 0.08, x - side * 0.36, y - 0.5);
  g.stroke();
  g.fillStyle = '#f2e6a0';
  g.beginPath();
  g.arc(x + side * 0.28, y - 0.35, 0.02, 0, Math.PI * 2);
  g.fill();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
