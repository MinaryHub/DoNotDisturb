// 사람 그리기 (탑다운). 원·타원 조합만 쓴다: 어깨 → 팔 → 머리 → 머리카락 → 소지품.
// 외형은 id 해시로 정해져서 같은 사람은 매번 같은 모습이다. 프로필의 look으로 덮어쓸 수 있다.

export type HairStyle = 'short' | 'long' | 'bun' | 'bald' | 'cap';
export type Accessory = 'none' | 'bag' | 'backpack' | 'phone' | 'apron' | 'lanyard' | 'glasses' | 'tray' | 'umbrella';
export type Pattern = 'plain' | 'stripe' | 'collar';

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
const STYLES: HairStyle[] = ['short', 'short', 'long', 'long', 'bun', 'cap', 'bald'];
const CROWD_ACCESSORIES: Accessory[] = ['none', 'none', 'bag', 'backpack', 'phone', 'phone', 'glasses'];
const ACCENTS = ['#4b5563', '#7c5c3e', '#2f4858', '#8b3a3a', '#355e3b', '#d9cbb4'];
const PATTERNS: Pattern[] = ['plain', 'plain', 'plain', 'stripe', 'collar'];
const SHOES = ['#2b2523', '#f4f1ea', '#5b4636', '#3d5a80', '#2b2523'];

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
  };
}

export interface PoseOptions {
  /** 몸 반지름 (어깨 폭의 절반 정도) */
  r: number;
  facing: number;
  /** 걷기 위상 (라디안). walking=false면 팔이 멈춘다 */
  walkPhase: number;
  walking: boolean;
  /** 위아래 흔들림 (이미 계산된 값) */
  bob?: number;
  /** 얼굴을 그리지 않는다 (지친 눈에 비친 군중) */
  faceless?: boolean;
  /** 손에 무언가를 들고 앞으로 내민다 (전단지·시식) */
  reach?: number;
  /** 머리는 호출한 쪽이 따로 그린다 (플레이어) */
  noHead?: boolean;
}

/** (x, y)에 사람 하나. ctx는 월드 좌표(1 = 1m) */
export function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, look: Look, o: PoseOptions): void {
  const { r, facing } = o;
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  // 옆 방향 (오른손 쪽)
  const sx = -fy;
  const sy = fx;
  const bob = o.bob ?? 0;
  const swing = o.walking ? Math.sin(o.walkPhase) : 0;
  ctx.save();
  ctx.translate(x, y + bob);

  // 발: 걸을 때 앞뒤로 번갈아 나온다
  ctx.fillStyle = look.shoes;
  for (const side of [-1, 1]) {
    const k = o.walking ? swing * side * r * 0.55 : 0;
    ctx.beginPath();
    ctx.ellipse(sx * side * r * 0.32 + fx * k, sy * side * r * 0.32 + fy * k, r * 0.26, r * 0.16, facing, 0, Math.PI * 2);
    ctx.fill();
  }

  // 백팩: 등 뒤
  if (look.accessory === 'backpack') {
    ctx.fillStyle = look.accent;
    ctx.save();
    ctx.rotate(facing);
    roundRectPath(ctx, -r * 1.05, -r * 0.55, r * 0.55, r * 1.1, r * 0.2);
    ctx.fill();
    ctx.restore();
  }

  // 팔: 어깨 옆에서 앞뒤로 흔들림
  for (const side of [-1, 1]) {
    const reach = side === 1 && o.reach ? o.reach : 0;
    const k = swing * side * 0.28 * r + reach;
    ctx.fillStyle = shade(look.top, -0.12);
    ctx.beginPath();
    ctx.arc(sx * side * r * 0.95 + fx * k, sy * side * r * 0.95 + fy * k, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    ctx.arc(sx * side * r * 0.98 + fx * (k + r * 0.28), sy * side * r * 0.98 + fy * (k + r * 0.28), r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  // 몸통: 어깨가 넓은 타원
  ctx.fillStyle = look.top;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.72, r * 1.0, facing, 0, Math.PI * 2);
  ctx.fill();
  // 윗옷 무늬
  if (look.pattern === 'stripe') {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.72, r * 1.0, facing, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = shade(look.top, 0.35);
    ctx.lineWidth = r * 0.1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(fx * i * r * 0.3 - sx * r, fy * i * r * 0.3 - sy * r);
      ctx.lineTo(fx * i * r * 0.3 + sx * r, fy * i * r * 0.3 + sy * r);
      ctx.stroke();
    }
    ctx.restore();
  } else if (look.pattern === 'collar') {
    ctx.fillStyle = '#f7f4ec';
    ctx.beginPath();
    ctx.moveTo(fx * r * 0.62 + sx * r * 0.3, fy * r * 0.62 + sy * r * 0.3);
    ctx.lineTo(fx * r * 0.85, fy * r * 0.85);
    ctx.lineTo(fx * r * 0.62 - sx * r * 0.3, fy * r * 0.62 - sy * r * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  // 어깨 윗면 하이라이트
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.ellipse(-fx * r * 0.1, -fy * r * 0.1, r * 0.5, r * 0.8, facing, 0, Math.PI * 2);
  ctx.fill();

  if (look.accessory === 'apron') {
    ctx.fillStyle = look.accent;
    ctx.beginPath();
    ctx.ellipse(fx * r * 0.32, fy * r * 0.32, r * 0.36, r * 0.7, facing, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.accessory === 'lanyard') {
    ctx.strokeStyle = '#3b6fb6';
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    ctx.arc(fx * r * 0.2, fy * r * 0.2, r * 0.42, facing - 1.1, facing + 1.1);
    ctx.stroke();
    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(fx * r * 0.62 - r * 0.09, fy * r * 0.62 - r * 0.09, r * 0.18, r * 0.18);
  } else if (look.accessory === 'bag') {
    // 크로스백: 끈 + 옆구리 가방
    ctx.strokeStyle = shade(look.accent, -0.2);
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    ctx.moveTo(sx * r * 0.6 - fx * r * 0.3, sy * r * 0.6 - fy * r * 0.3);
    ctx.lineTo(-sx * r * 0.6 + fx * r * 0.3, -sy * r * 0.6 + fy * r * 0.3);
    ctx.stroke();
    ctx.fillStyle = look.accent;
    ctx.beginPath();
    ctx.arc(-sx * r * 0.95, -sy * r * 0.95, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  if (o.noHead) {
    ctx.restore();
    return;
  }
  // 머리
  const hx = fx * r * 0.18;
  const hy = fy * r * 0.18;
  const hr = r * 0.55;
  if (look.hairStyle === 'long') {
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.ellipse(hx - fx * hr * 0.35, hy - fy * hr * 0.35, hr * 1.05, hr * 1.2, facing, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fill();
  // 머리카락: 뒤통수 쪽 반원 (탑다운에서 보이는 정수리)
  if (look.hairStyle !== 'bald') {
    ctx.fillStyle = look.hairStyle === 'cap' ? look.accent : look.hair;
    ctx.beginPath();
    ctx.arc(hx - fx * hr * 0.12, hy - fy * hr * 0.12, hr * 1.02, facing + Math.PI * 0.42, facing + Math.PI * 1.58);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hx - fx * hr * 0.25, hy - fy * hr * 0.25, hr * 0.82, 0, Math.PI * 2);
    ctx.fill();
    if (look.hairStyle === 'bun') {
      ctx.beginPath();
      ctx.arc(hx - fx * hr * 0.95, hy - fy * hr * 0.95, hr * 0.42, 0, Math.PI * 2);
      ctx.fill();
    } else if (look.hairStyle === 'cap') {
      // 챙
      ctx.fillStyle = shade(look.accent, -0.15);
      ctx.beginPath();
      ctx.ellipse(hx + fx * hr * 0.75, hy + fy * hr * 0.75, hr * 0.42, hr * 0.75, facing, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(hx - fx * hr * 0.2, hy - fy * hr * 0.2, hr * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!o.faceless) {
    // 눈 (바라보는 쪽)
    ctx.fillStyle = '#2e2a30';
    const ex = hx + fx * hr * 0.62;
    const ey = hy + fy * hr * 0.62;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(ex + sx * side * hr * 0.32, ey + sy * side * hr * 0.32, hr * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
    if (look.accessory === 'glasses') {
      ctx.strokeStyle = 'rgba(40,40,48,0.9)';
      ctx.lineWidth = hr * 0.08;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(ex + sx * side * hr * 0.32, ey + sy * side * hr * 0.32, hr * 0.24, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // 머리카락 결 (하이라이트 한 줄)
  if (look.hairStyle !== 'bald' && look.hairStyle !== 'cap') {
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = hr * 0.12;
    ctx.beginPath();
    ctx.arc(hx - fx * hr * 0.25, hy - fy * hr * 0.25, hr * 0.55, facing + Math.PI * 0.75, facing + Math.PI * 1.25);
    ctx.stroke();
  }

  // 손에 든 것
  const hand = (k: number) => ({ x: sx * r * 0.98 + fx * (k + r * 0.28), y: sy * r * 0.98 + fy * (k + r * 0.28) });
  if (look.accessory === 'phone' && !o.reach) {
    const p = hand(swing * 0.28 * r);
    ctx.fillStyle = '#1f2229';
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(facing);
    ctx.fillRect(-r * 0.12, -r * 0.08, r * 0.24, r * 0.16);
    ctx.fillStyle = 'rgba(150, 200, 255, 0.85)';
    ctx.fillRect(-r * 0.09, -r * 0.05, r * 0.18, r * 0.1);
    ctx.restore();
  } else if (look.accessory === 'tray') {
    const p = hand(r * 0.25);
    ctx.fillStyle = '#e8e2d6';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d98c5f';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(i * 2.1) * r * 0.18, p.y + Math.sin(i * 2.1) * r * 0.18, r * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (look.accessory === 'umbrella') {
    drawUmbrella(ctx, 0, 0, r, facing, look.accent);
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
