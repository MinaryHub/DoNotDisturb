import { z } from 'zod';

// Kreate 레벨 노드 이름 규칙(CLAUDE.md 4.3, 4.4)의 단일 정의.
// 게임 런타임(LevelLoader)과 검증 도구(validate-assets)가 함께 사용하므로 Three.js에 의존하지 않는다.

export const PREFIXES = ['VIS', 'COL', 'NAV', 'LOS', 'HIDE', 'SAFE', 'TRG', 'SPAWN', 'PATH', 'ZONE'] as const;
export type Prefix = (typeof PREFIXES)[number];

/** 이름 속성은 문자열로 들어오므로 숫자로 변환된 값도 문자열로 받아들인다 (예: eventId=123) */
const idString = z.union([z.string(), z.number().transform(String)]).pipe(z.string().min(1));

/**
 * mover: 같은 mover id를 가진 노드들은 하나의 키네마틱 바디로 묶여 함께 움직인다 (엘리베이터 칸, 문 등).
 * 어떻게 움직일지는 스테이지 설정(data/stages)이 정한다.
 */
const mover = { mover: idString.optional() };

// 밸런스 수치의 기본값은 여기서 정하지 않는다. 생략 시 게임플레이 계층이 /data 설정에서 채운다.
export const propSchemas = {
  VIS: z.object({ ...mover }),
  COL: z.object({ shape: z.enum(['mesh', 'box']).optional(), ...mover }),
  NAV: z.object({}),
  LOS: z.object({ ...mover }),
  HIDE: z.object({ detectScale: z.number().min(0).max(1).optional() }),
  SAFE: z.object({
    capacity: z.number().int().min(1).optional(),
    noiseAfterSec: z.number().positive().optional(),
  }),
  /** interact=true면 진입이 아니라 바라보고 상호작용 키를 눌렀을 때 발동 */
  TRG: z.object({ eventId: idString, once: z.boolean().optional(), interact: z.boolean().optional(), ...mover }),
  SPAWN: z.object({}),
  PATH: z.object({ waitSec: z.number().min(0).optional() }),
  ZONE: z.object({ stimulus: idString, intensity: z.number().min(0).max(1).optional() }),
} satisfies Record<Prefix, z.ZodObject>;

export type PropsOf<P extends Prefix> = z.output<(typeof propSchemas)[P]>;

/** 접두어 노드는 렌더링하지 않는다 (VIS_ 제외) */
export function isRenderedPrefix(prefix: Prefix): boolean {
  return prefix === 'VIS';
}

/** 볼륨(센서)으로 처리되는 접두어 */
export const VOLUME_PREFIXES = ['TRG', 'SAFE', 'HIDE', 'ZONE'] as const satisfies readonly Prefix[];
export type VolumePrefix = (typeof VOLUME_PREFIXES)[number];

export function isVolumePrefix(prefix: Prefix): prefix is VolumePrefix {
  return (VOLUME_PREFIXES as readonly Prefix[]).includes(prefix);
}
