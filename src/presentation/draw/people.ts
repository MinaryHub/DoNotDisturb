// 사람 그리기 (탑다운). 원·타원·둥근 선 조합만 쓴다: 다리 → 가방 → 팔 → 몸통 → 머리 → 얼굴 → 소지품.
// 외형은 id 해시로 정해져서 같은 사람은 매번 같은 모습이다. 프로필의 look으로 덮어쓸 수 있다.
// 그릴 때는 바라보는 방향으로 돌린 지역 좌표를 쓴다: +x = 앞, +y = 오른쪽.

export type HairStyle = 'short' | 'long' | 'bun' | 'bald' | 'cap' | 'ponytail' | 'curly';
export type Accessory = 'none' | 'bag' | 'backpack' | 'phone' | 'apron' | 'lanyard' | 'glasses' | 'tray' | 'umbrella';
export type Pattern = 'plain' | 'stripe' | 'collar' | 'jacket' | 'hoodie';

export interface Look {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  top: string;
  accessory: Accessory;
  /** 소지품·앞치마 색 */
  accent: string;
  /** 윗옷 무늬 */
  pattern: Pattern;
  shoes: string;
  /** 바지·치마 */
  bottom: string;
  /** 어깨 폭 배율 (마른 0.9 ~ 다부진 1.1) */
  build: number;
}

export interface LookOverride {
  skin?: string;
  hair?: string;
  hairStyle?: HairStyle;
  accessory?: Accessory;
  accent?: string;
}

const SKINS = ['#f3dcc6', '#ecd0b4', '#e2bf9e', '#d6ae8b', '#c49a76'];
const HAIRS = ['#2b2523', '#3a2c25', '#4d3a2e', '#6b4f3a', '#24242a', '#8a7f78', '#b98e5c'];
const STYLES: HairStyle[] = ['short', 'short', 'long', 'long', 'bun', 'cap', 'bald', 'ponytail', 'curly', 'short'];
const CROWD_ACCESSORIES: Accessory[] = ['none', 'none', 'bag', 'backpack', 'phone', 'phone', 'glasses'];
const ACCENTS = ['#4b5563', '#7c5c3e', '#2f4858', '#8b3a3a', '#355e3b', '#d9cbb4'];
const PATTERNS: Pattern[] = ['plain', 'plain', 'plain', 'stripe', 'collar', 'jacket', 'jacket', 'hoodie'];
const SHOES = ['#2b2523', '#f4f1ea', '#5b4636', '#3d5a80', '#2b2523'];
const BOTTOMS = ['#2f3542', '#3d5a80', '#4a4a4a', '#6b5b4b', '#283044', '#8c8577', '#1f2329'];
const BUILDS = [0.9, 0.96, 1, 1, 1.04, 1.1];

/** 문자열 → 0 이상 정수 (FNV-1a) */
export function hashOf(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(list: readonly T[], h: number, salt: number): T {
  return list[(((h >>> (salt * 3)) ^ Math.imul(h, salt * 2 + 1)) >>> 0) % list.length]!;
}

export function lookFor(seed: string, top: string, override?: LookOverride, accessories: readonly Accessory[] = CROWD_ACCESSORIES): Look {
  const h = hashOf(seed);
  return {
    skin: override?.skin ?? pick(SKINS, h, 1),
    hair: override?.hair ?? pick(HAIRS, h, 2),
    hairStyle: override?.hairStyle ?? pick(STYLES, h, 3),
    top,
    accessory: override?.accessory ?? pick(accessories, h, 4),
    accent: override?.accent ?? pick(ACCENTS, h, 5),
    pattern: pick(PATTERNS, h, 6),
    shoes: pick(SHOES, h, 7),
    bottom: pick(BOTTOMS, h, 8),
    build: pick(BUILDS, h, 9),
  };
}

export interface PoseOptions {
  /** 몸 반지름 (어깨 폭의 절반 정도) */
  r: number;
  facing: number;
  /** 걷기 위상 (라디안). walking=false면 팔다리가 멈춘다 */
  walkPhase: number;
  walking: boolean;
  /** 달리기: 보폭이 크고, 팔을 굽혀 흔들고, 몸이 앞으로 기운다 */
  running?: boolean;
  /** 위아래 흔들림 (이미 계산된 값) */
  bob?: number;
  /** 얼굴을 그리지 않는다 (지친 눈에 비친 군중) */
  faceless?: boolean;
  /** 손에 무언가를 들고 앞으로 내민다 (전단지·시식) */
  reach?: number;
  /** 머리는 호출한 쪽이 따로 그린다 */
  noHead?: boolean;
  /** 연출 시각(초): 숨쉬기·눈 깜빡임·손짓 */
  time?: number;
  /** 사람마다 깜빡임·숨 박자를 엇갈리게 */
  seed?: number;
  /** 말하는 중 손짓 (0~1) */
  talk?: number;
  /** 웃음: 어깨가 들썩인다 (0~1) */
  laugh?: number;
  /** 움츠림: 어깨가 좁아지고 고개가 숙여진다 (0~1) */
  hunch?: number;
  /** 고개 돌림 (라디안, 몸 기준) */
  headTurn?: number;
  /** 두 손으로 폰을 들여다봄 (0~1) */
  phoneHold?: number;
  /** 두 손으로 볼을 감쌈 */
  coverFace?: boolean;
  eyesClosed?: boolean;
  mask?: boolean;
  earphones?: boolean;
  /** 볼 홍조 (0~1) */
  blush?: number;
  /** 떨림 (0~1) */
  tremble?: number;
  /** 앉아 있음: 다리를 앞으로 모으고 팔은 책상 위 */
  seated?: boolean;
}

/** 해가 비치는 방향 (월드, 왼쪽 위) */
const LIGHT = { x: -0.55, y: -0.83 };
const OUTLINE = 'rgba(25, 22, 30, 0.38)';

/** (x, y)에 사람 하나. ctx는 월드 좌표(1 = 1m) */
export function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, look: Look, o: PoseOptions): void {
  const { r, facing } = o;
  const t = o.time ?? 0;
  const seed = o.seed ?? 0;
  const run = !!o.running && o.walking;
  const s = o.walking ? Math.sin(o.walkPhase) : 0;
  const hunch = o.hunch ?? 0;
  const W = r * 0.98 * look.build * (1 - hunch * 0.12);
  const D = r * 0.6;
  // 가만히 있을 때 숨쉬기
  const breath = o.walking ? 0 : Math.sin(t * 2.1 + seed) * 0.025;
  const laugh = (o.laugh ?? 0) * Math.abs(Math.sin(t * 14)) * 0.06;
  // 빛 방향을 지역 좌표로
  const c = Math.cos(facing);
  const sn = Math.sin(facing);
  const lx = LIGHT.x * c + LIGHT.y * sn;
  const ly = -LIGHT.x * sn + LIGHT.y * c;
  const tremble = o.tremble ?? 0;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.translate(x + (tremble ? (Math.random() - 0.5) * tremble * 0.03 : 0), y + (o.bob ?? 0));
  ctx.rotate(facing);

  // ── 다리와 신발: 걸으면 번갈아 앞뒤로, 달리면 보폭이 크다
  const stride = r * (run ? 1.0 : 0.78);
  for (const side of [-1, 1]) {
    const fx = o.seated ? r * 0.75 : o.walking ? s * side * stride : r * 0.16;
    const fy = side * r * (o.seated ? 0.24 : 0.3);
    ctx.strokeStyle = look.bottom;
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 0.36;
    ctx.beginPath();
    ctx.moveTo(0, side * r * 0.28);
    ctx.lineTo(fx * 0.8, fy);
    ctx.stroke();
    // 신발: 밑창 → 윗면 → 코 하이라이트
    ctx.fillStyle = shade(look.shoes, -0.35);
    ctx.beginPath();
    ctx.ellipse(fx + r * 0.1, fy, r * 0.28, r * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.shoes;
    ctx.beginPath();
    ctx.ellipse(fx + r * 0.1, fy, r * 0.24, r * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(fx + r * 0.2, fy - r * 0.03, r * 0.08, r * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = 'butt';

  // 어깨는 걸음에 맞춰 살짝 비틀린다 (팔과 몸통이 함께)
  const twist = s * (run ? 0.2 : 0.1);
  ctx.save();
  ctx.rotate(twist);
  // 달리면 상체가 앞으로 기운다
  if (run) ctx.translate(r * 0.08, 0);

  // ── 백팩: 등 뒤
  if (look.accessory === 'backpack') {
    ctx.fillStyle = shade(look.accent, -0.15);
    roundRectPath(ctx, -D - r * 0.42, -W * 0.62, r * 0.55, W * 1.24, r * 0.22);
    ctx.fill();
    ctx.fillStyle = look.accent;
    roundRectPath(ctx, -D - r * 0.36, -W * 0.55, r * 0.45, W * 1.1, r * 0.18);
    ctx.fill();
    ctx.fillStyle = shade(look.accent, 0.18);
    roundRectPath(ctx, -D - r * 0.44, -W * 0.35, r * 0.2, W * 0.7, r * 0.08);
    ctx.fill();
  }

  // ── 팔: 어깨 → 팔꿈치 → 손. 다리와 반대로 흔든다
  const sleeve = shade(look.top, -0.1);
  for (const side of [-1, 1]) {
    const sh = { x: -r * 0.02, y: side * W * 0.84 };
    let hand: { x: number; y: number };
    let elbow: { x: number; y: number };
    const swing = -s * side * r * (run ? 0.5 : 0.38);
    if (o.coverFace) {
      hand = { x: r * 0.42, y: side * r * 0.5 };
      elbow = { x: r * 0.05, y: side * W * 1.1 };
    } else if ((o.phoneHold ?? 0) > 0.3) {
      hand = { x: r * 0.74, y: side * r * 0.17 };
      elbow = { x: r * 0.32, y: side * W * 0.8 };
    } else if (o.seated) {
      hand = { x: r * 0.9, y: side * r * 0.45 };
      elbow = { x: r * 0.35, y: side * W * 1.0 };
    } else if (side === 1 && o.reach) {
      hand = { x: r * 0.3 + o.reach, y: r * 0.6 };
      elbow = { x: (r * 0.3 + o.reach) * 0.45, y: W * 0.98 };
    } else if (side === 1 && (o.talk ?? 0) > 0) {
      // 말하면서 손짓
      const g = Math.sin(t * 6 + seed) * r * 0.15;
      hand = { x: r * 0.6 + g, y: r * 0.55 - g * 0.5 };
      elbow = { x: r * 0.15, y: W * 1.05 };
    } else if (run) {
      hand = { x: swing + r * 0.3, y: side * W * 0.72 };
      elbow = { x: swing * 0.3 - r * 0.08, y: side * W * 1.12 };
    } else {
      hand = { x: swing, y: side * W * 1.14 };
      elbow = { x: swing * 0.45, y: side * W * 1.12 };
    }
    ctx.strokeStyle = OUTLINE;
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 0.36;
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();
    ctx.strokeStyle = sleeve;
    ctx.lineWidth = r * 0.29;
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.lineTo(hand.x * 0.85 + elbow.x * 0.15, hand.y * 0.85 + elbow.y * 0.15);
    ctx.stroke();
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = r * 0.04;
    ctx.stroke();
  }
  ctx.lineCap = 'butt';

  // ── 몸통: 어깨가 넓은 타원, 빛 방향으로 볼륨
  const tw = W * (1 + breath + laugh);
  const td = D * (1 + breath);
  ctx.beginPath();
  ctx.ellipse(0, 0, td, tw, 0, 0, Math.PI * 2);
  const vol = ctx.createRadialGradient(lx * td * 0.45, ly * tw * 0.45, 0, 0, 0, tw * 1.25);
  vol.addColorStop(0, shade(look.top, 0.14));
  vol.addColorStop(0.55, look.top);
  vol.addColorStop(1, shade(look.top, -0.22));
  ctx.fillStyle = vol;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = r * 0.06;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, td, tw, 0, 0, Math.PI * 2);
  ctx.clip();
  drawTopPattern(ctx, look, r, td, tw);
  ctx.restore();

  if (look.accessory === 'apron') {
    ctx.fillStyle = look.accent;
    ctx.beginPath();
    ctx.ellipse(td * 0.45, 0, td * 0.55, tw * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(look.accent, -0.25);
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    ctx.moveTo(td * 0.2, -tw * 0.6);
    ctx.lineTo(td * 0.05, 0);
    ctx.lineTo(td * 0.2, tw * 0.6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(td * 0.55, -tw * 0.25, td * 0.25, tw * 0.5);
  } else if (look.accessory === 'lanyard') {
    ctx.strokeStyle = '#3b6fb6';
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    ctx.moveTo(0, -tw * 0.45);
    ctx.lineTo(td * 0.85, 0);
    ctx.lineTo(0, tw * 0.45);
    ctx.stroke();
    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(td * 0.78, -r * 0.11, r * 0.2, r * 0.22);
    ctx.fillStyle = '#3b6fb6';
    ctx.fillRect(td * 0.78, -r * 0.11, r * 0.2, r * 0.06);
  } else if (look.accessory === 'bag') {
    // 크로스백: 대각선 끈 + 옆구리 가방
    ctx.strokeStyle = shade(look.accent, -0.25);
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    ctx.moveTo(-td * 0.6, tw * 0.75);
    ctx.lineTo(td * 0.6, -tw * 0.75);
    ctx.stroke();
    ctx.fillStyle = look.accent;
    roundRectPath(ctx, -r * 0.35, -tw - r * 0.3, r * 0.6, r * 0.42, r * 0.1);
    ctx.fill();
    ctx.fillStyle = shade(look.accent, -0.2);
    ctx.fillRect(-r * 0.35, -tw - r * 0.3, r * 0.6, r * 0.12);
  } else if (look.accessory === 'backpack') {
    // 어깨끈
    ctx.strokeStyle = shade(look.accent, -0.2);
    ctx.lineWidth = r * 0.12;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-td * 0.9, side * tw * 0.5);
      ctx.quadraticCurveTo(0, side * tw * 0.75, td * 0.55, side * tw * 0.5);
      ctx.stroke();
    }
  }
  ctx.restore(); // 비틀림

  if (!o.noHead) drawHead(ctx, look, o, r, run, s, t, seed, hunch, lx, ly);

  // ── 손에 든 것
  if ((o.phoneHold ?? 0) > 0.3) {
    ctx.fillStyle = '#1f2229';
    roundRectPath(ctx, r * 0.68, -r * 0.18, r * 0.3, r * 0.36, r * 0.05);
    ctx.fill();
    ctx.fillStyle = `rgba(160, 210, 255, ${0.85 * (o.phoneHold ?? 0)})`;
    ctx.fillRect(r * 0.72, -r * 0.14, r * 0.22, r * 0.28);
  } else if (look.accessory === 'phone' && !o.reach && !o.coverFace) {
    const hx = -s * r * 0.38 * 0.9;
    const hy = W * 1.02;
    ctx.fillStyle = '#1f2229';
    ctx.fillRect(hx - r * 0.06, hy - r * 0.12, r * 0.3, r * 0.2);
    ctx.fillStyle = 'rgba(150, 200, 255, 0.85)';
    ctx.fillRect(hx - r * 0.03, hy - r * 0.09, r * 0.24, r * 0.14);
  } else if (look.accessory === 'tray') {
    const px = r * 0.75;
    const py = r * 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.arc(px + r * 0.05, py + r * 0.06, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e2d6';
    ctx.beginPath();
    ctx.arc(px, py, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d98c5f';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(px + Math.cos(i * 2.1) * r * 0.18, py + Math.sin(i * 2.1) * r * 0.18, r * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  if (look.accessory === 'umbrella') drawUmbrella(ctx, x, y + (o.bob ?? 0), r, facing, look.accent);
}

/** 윗옷 무늬 (몸통 타원으로 잘라 낸 상태에서) */
function drawTopPattern(ctx: CanvasRenderingContext2D, look: Look, r: number, td: number, tw: number): void {
  switch (look.pattern) {
    case 'stripe': {
      ctx.strokeStyle = shade(look.top, 0.35);
      ctx.lineWidth = r * 0.09;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.22, -tw);
        ctx.lineTo(i * r * 0.22, tw);
        ctx.stroke();
      }
      break;
    }
    case 'collar': {
      ctx.fillStyle = '#f7f4ec';
      ctx.beginPath();
      ctx.moveTo(td * 0.55, -r * 0.32);
      ctx.lineTo(td * 1.05, 0);
      ctx.lineTo(td * 0.55, r * 0.32);
      ctx.lineTo(td * 0.75, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'jacket': {
      // 열린 앞섶: 안에 받친 셔츠 + 깃 + 단추
      ctx.fillStyle = '#ece6da';
      ctx.beginPath();
      ctx.ellipse(td * 0.75, 0, td * 0.45, r * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = shade(look.top, -0.3);
      ctx.lineWidth = r * 0.06;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(td * 0.2, side * tw * 0.42);
        ctx.lineTo(td * 1.0, side * r * 0.2);
        ctx.stroke();
      }
      ctx.fillStyle = shade(look.top, -0.35);
      ctx.beginPath();
      ctx.arc(td * 0.75, r * 0.24, r * 0.04, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'hoodie': {
      // 등 뒤 모자 + 앞 끈
      ctx.fillStyle = shade(look.top, -0.14);
      ctx.beginPath();
      ctx.ellipse(-td * 0.85, 0, r * 0.38, tw * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(look.top, -0.3);
      ctx.beginPath();
      ctx.ellipse(-td * 0.7, 0, r * 0.18, tw * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f2efe8';
      ctx.lineWidth = r * 0.045;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(td * 0.55, side * r * 0.16);
        ctx.lineTo(td * 0.98, side * r * 0.12);
        ctx.stroke();
      }
      break;
    }
    case 'plain':
      // 어깨 솔기
      ctx.strokeStyle = shade(look.top, -0.12);
      ctx.lineWidth = r * 0.04;
      ctx.beginPath();
      ctx.ellipse(0, 0, td * 0.75, tw * 0.72, 0, Math.PI * 0.3, Math.PI * 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, td * 0.75, tw * 0.72, 0, -Math.PI * 0.7, -Math.PI * 0.3);
      ctx.stroke();
      break;
  }
}

function drawHead(ctx: CanvasRenderingContext2D, look: Look, o: PoseOptions, r: number, run: boolean, s: number, t: number, seed: number, hunch: number, lx: number, ly: number): void {
  const hr = r * 0.56;
  // 머리 위치: 달리면 앞으로, 움츠리면 고개를 숙여 앞으로 조금
  const hx = r * 0.12 + (run ? r * 0.18 : 0) + hunch * r * 0.14 + (o.walking ? Math.abs(s) * r * 0.03 : 0);
  ctx.save();
  ctx.translate(hx, 0);
  ctx.rotate(o.headTurn ?? 0);
  const k = 1 - hunch * 0.06;
  ctx.scale(k, k);

  // 어깨에 드리운 머리 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.arc(-hr * 0.12 - lx * hr * 0.15, -ly * hr * 0.15, hr * 1.04, 0, Math.PI * 2);
  ctx.fill();

  const st = look.hairStyle;
  // 뒤로 늘어진 머리카락
  if (st === 'long') {
    ctx.fillStyle = shade(look.hair, -0.1);
    ctx.beginPath();
    ctx.ellipse(-hr * 0.55, 0, hr * 1.0, hr * 1.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(look.hair, 0.12);
    ctx.lineWidth = hr * 0.06;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-hr * 0.4, i * hr * 0.3);
      ctx.lineTo(-hr * 1.35, i * hr * 0.36);
      ctx.stroke();
    }
  } else if (st === 'ponytail') {
    const swayY = (o.walking ? Math.sin(o.walkPhase * 2) : Math.sin(t * 1.5 + seed) * 0.3) * hr * 0.22;
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.ellipse(-hr * 1.35, swayY, hr * 0.55, hr * 0.28, swayY / hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.accent;
    ctx.beginPath();
    ctx.arc(-hr * 0.92, swayY * 0.3, hr * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }

  // 귀
  for (const side of [-1, 1]) {
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.ellipse(-hr * 0.02, side * hr * 0.97, hr * 0.17, hr * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(look.skin, -0.15);
    ctx.beginPath();
    ctx.arc(-hr * 0.02, side * hr * 0.99, hr * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }

  // 얼굴
  ctx.beginPath();
  ctx.arc(0, 0, hr, 0, Math.PI * 2);
  const face = ctx.createRadialGradient(lx * hr * 0.4, ly * hr * 0.4, 0, 0, 0, hr * 1.1);
  face.addColorStop(0, shade(look.skin, 0.08));
  face.addColorStop(1, shade(look.skin, -0.1));
  ctx.fillStyle = face;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = r * 0.05;
  ctx.stroke();

  // 정수리 머리카락
  if (st !== 'bald') {
    const hairColor = st === 'cap' ? look.accent : look.hair;
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    ctx.arc(-hr * 0.1, 0, hr * 1.03, Math.PI * 0.4, Math.PI * 1.6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-hr * 0.3, 0, hr * 0.78, 0, Math.PI * 2);
    ctx.fill();
    if (st === 'curly') {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(-hr * 0.3 + Math.cos(a) * hr * 0.68, Math.sin(a) * hr * 0.75, hr * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = shade(hairColor, 0.15);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.arc(-hr * 0.25 + Math.cos(a) * hr * 0.4, Math.sin(a) * hr * 0.4, hr * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (st === 'cap') {
      // 챙 + 꼭지 단추 + 이음선
      ctx.fillStyle = shade(look.accent, -0.18);
      ctx.beginPath();
      ctx.ellipse(hr * 0.78, 0, hr * 0.45, hr * 0.78, 0, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
      ctx.strokeStyle = shade(look.accent, -0.25);
      ctx.lineWidth = hr * 0.05;
      for (const a of [-0.9, 0, 0.9]) {
        ctx.beginPath();
        ctx.moveTo(-hr * 0.2, 0);
        ctx.lineTo(-hr * 0.2 + Math.cos(a + Math.PI) * hr * 0.8, Math.sin(a + Math.PI) * hr * 0.8);
        ctx.stroke();
      }
      ctx.fillStyle = shade(look.accent, 0.2);
      ctx.beginPath();
      ctx.arc(-hr * 0.2, 0, hr * 0.1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 앞머리: 이마 쪽으로 내려온 뭉치
      if (st === 'short' || st === 'long' || st === 'ponytail') {
        for (let i = -2; i <= 2; i++) {
          if (st !== 'short' && Math.abs(i) === 0) continue;
          ctx.beginPath();
          ctx.ellipse(hr * 0.4, i * hr * 0.24, hr * 0.17, hr * 0.14, i * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (st === 'bun') {
        ctx.beginPath();
        ctx.arc(-hr * 0.95, 0, hr * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = shade(hairColor, 0.2);
        ctx.lineWidth = hr * 0.06;
        ctx.beginPath();
        ctx.arc(-hr * 0.95, 0, hr * 0.25, 0.5, 4.5);
        ctx.stroke();
      }
      // 가르마 + 빛 받은 결
      ctx.strokeStyle = shade(hairColor, -0.18);
      ctx.lineWidth = hr * 0.035;
      ctx.beginPath();
      ctx.moveTo(-hr * 0.35, hr * 0.18);
      ctx.lineTo(hr * 0.3, hr * 0.24);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = hr * 0.12;
      ctx.beginPath();
      const la = Math.atan2(ly, lx);
      ctx.arc(-hr * 0.22, 0, hr * 0.55, la - 0.5, la + 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = r * 0.04;
    ctx.beginPath();
    ctx.arc(-hr * 0.1, 0, hr * 1.03, Math.PI * 0.45, Math.PI * 1.55);
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(lx * hr * 0.35, ly * hr * 0.35, hr * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!o.faceless) {
    // 눈: 가끔 깜빡인다
    const blink = o.eyesClosed || (t + seed * 0.37) % 4.2 < 0.12;
    const ex = hr * 0.7;
    for (const side of [-1, 1]) {
      const ey = side * hr * 0.32;
      ctx.fillStyle = '#2e2a30';
      if (blink) {
        ctx.fillRect(ex - hr * 0.05, ey - hr * 0.14, hr * 0.08, hr * 0.28);
      } else {
        ctx.beginPath();
        ctx.ellipse(ex, ey, hr * 0.12, hr * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(ex + hr * 0.04, ey - hr * 0.03, hr * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 코 끝
    ctx.fillStyle = shade(look.skin, -0.12);
    ctx.beginPath();
    ctx.arc(hr * 0.93, 0, hr * 0.11, 0, Math.PI * 2);
    ctx.fill();
    if ((o.blush ?? 0) > 0.02) {
      ctx.fillStyle = `rgba(240, 90, 90, ${Math.min(0.75, (o.blush ?? 0) * 0.8)})`;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(hr * 0.55, side * hr * 0.6, hr * 0.18, hr * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (look.accessory === 'glasses') {
      ctx.strokeStyle = 'rgba(40,40,48,0.9)';
      ctx.lineWidth = hr * 0.08;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(ex, side * hr * 0.32, hr * 0.22, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(ex, -hr * 0.1);
      ctx.lineTo(ex, hr * 0.1);
      ctx.stroke();
      ctx.fillStyle = 'rgba(200, 225, 255, 0.25)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(ex, side * hr * 0.32, hr * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (o.mask) {
    ctx.fillStyle = '#e8edf0';
    ctx.beginPath();
    ctx.ellipse(hr * 0.62, 0, hr * 0.42, hr * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(150, 160, 170, 0.8)';
    ctx.lineWidth = hr * 0.05;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hr * 0.4, side * hr * 0.6);
      ctx.lineTo(-hr * 0.02, side * hr * 0.95);
      ctx.stroke();
    }
  }
  if (o.earphones) {
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#f5f5f5';
      ctx.beginPath();
      ctx.arc(-hr * 0.02, side * hr * 1.0, hr * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c8ccd2';
      ctx.beginPath();
      ctx.arc(-hr * 0.02, side * hr * 1.0, hr * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** 위에서 본 우산: 머리 위를 덮는 팔각 천 + 살 */
export function drawUmbrella(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, facing: number, color: string, alpha = 0.92): void {
  const rr = r * 1.55;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + facing;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = r * 0.05;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + facing;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    ctx.lineTo(x - Math.cos(a) * rr, y - Math.sin(a) * rr);
    ctx.stroke();
  }
  ctx.fillStyle = shade(color, -0.3);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

/** HSL(도, %, %) → #rrggbb */
export function hslHex(h: number, s: number, l: number): string {
  const sl = s / 100;
  const ll = l / 100;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = ll - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255);
  };
  return `#${((f(0) << 16) | (f(8) << 8) | f(4)).toString(16).padStart(6, '0')}`;
}

/** #rrggbb를 밝게(+)/어둡게(−) */
export function shade(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const f = (c: number) => Math.round(Math.max(0, Math.min(255, amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
