import { z } from 'zod';

// /data JSON 설정의 스키마. 브라우저(게임)와 Node(도구) 양쪽에서 쓰므로 순수 TS로 유지한다.

const positive = z.number().positive();
const nonNegative = z.number().min(0);

export const worldConfigSchema = z.object({
  simulationHz: positive,
  defaultLevel: z.string().min(1),
  camera: z.object({ fov: positive, near: positive, far: positive, eyeHeight: positive }),
  noclip: z.object({ speed: positive, fastMultiplier: positive, mouseSensitivity: positive }),
  physics: z.object({ gravity: z.number(), probeRadius: positive }),
  navmesh: z.object({
    cellSize: positive,
    cellHeight: positive,
    agentHeight: positive,
    agentRadius: nonNegative,
    agentMaxClimb: nonNegative,
    agentMaxSlopeDeg: z.number().min(0).max(90),
  }),
  hotReloadDebounceMs: nonNegative,
});
export type WorldConfig = z.infer<typeof worldConfigSchema>;

export const inputActions = [
  'moveForward',
  'moveBackward',
  'moveLeft',
  'moveRight',
  'moveUp',
  'moveDown',
  'sprint',
  'toggleDebug',
  'reloadLevel',
] as const;
export type InputAction = (typeof inputActions)[number];

export const inputConfigSchema = z.object(
  Object.fromEntries(inputActions.map((a) => [a, z.array(z.string()).min(1)])) as Record<
    InputAction,
    z.ZodArray<z.ZodString>
  >,
);
export type InputConfig = z.infer<typeof inputConfigSchema>;

export const balanceConfigSchema = z.object({
  battery: z.object({
    max: positive,
    start: positive,
    outdoorDrainPerSec: nonNegative,
    tiers: z.object({ tired: positive, danger: positive, critical: positive }),
  }),
  stress: z.object({ max: positive, decayPerSec: nonNegative, somaticThreshold: nonNegative }),
});
export type BalanceConfig = z.infer<typeof balanceConfigSchema>;

export const assetCategories = ['level', 'prop', 'npc', 'crowdNpc', 'fpHands'] as const;
export type AssetCategory = (typeof assetCategories)[number];

export const assetBudgetSchema = z.object({
  triangles: z.object({
    prop: positive,
    npc: positive,
    crowdNpc: positive,
    fpHands: positive,
    environmentModule: positive,
  }),
  textures: z.object({ maxSize: positive, propMaxSize: positive }),
  units: z.object({
    minObjectSize: positive,
    maxObjectSize: positive,
    maxLevelExtent: positive,
    maxCharacterHeight: positive,
    minCharacterHeight: positive,
  }),
  categories: z.array(
    z.object({
      category: z.enum(assetCategories),
      pathPrefix: z.string(),
      nameSuffix: z.string().optional(),
    }),
  ),
});
export type AssetBudget = z.infer<typeof assetBudgetSchema>;

/** zod 오류를 "경로: 메시지" 목록 문자열로 변환 */
export function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

/** 스키마 검증 후 실패 시 어떤 파일이 왜 틀렸는지 명확한 예외를 던진다 */
export function parseConfig<T extends z.ZodType>(schema: T, data: unknown, source: string): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw new Error(`설정 파일 오류 (${source}): ${formatZodError(result.error)}`);
  return result.data;
}
