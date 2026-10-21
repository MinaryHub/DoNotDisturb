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
  lighting: z.object({
    ambient: z.object({ color: z.string(), intensity: nonNegative }),
    hemisphere: z.object({ sky: z.string(), ground: z.string(), intensity: nonNegative }),
    key: z.object({ color: z.string(), intensity: nonNegative, position: z.tuple([z.number(), z.number(), z.number()]) }),
    background: z.string(),
  }),
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
  'interact',
  'earphones',
  'phonePretend',
  'restart',
  'toggleDebug',
  'toggleNoclip',
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
    safeRecoverPerSec: nonNegative,
    tiers: z
      .object({ tired: positive, danger: positive, critical: positive })
      .refine((t) => t.tired > t.danger && t.danger > t.critical, '구간은 tired > danger > critical 이어야 합니다'),
  }),
  stress: z.object({
    max: positive,
    decayPerSec: nonNegative,
    somaticThreshold: nonNegative,
    gainPerDamage: nonNegative,
    decayDelaySec: nonNegative,
  }),
  ambush: z.object({ freezeSec: nonNegative, shakeSec: nonNegative }),
});
export type BalanceConfig = z.infer<typeof balanceConfigSchema>;

export const stimulusTableSchema = z.record(
  z.string(),
  z
    .object({
      kind: z.enum(['ambush', 'continuous', 'encounter', 'rumination']),
      channel: z.enum(['auditory', 'visual', 'social']),
      damage: nonNegative.optional(),
      ratePerSec: nonNegative.optional(),
      durationSec: positive.optional(),
    })
    .refine(
      (s) =>
        s.kind === 'ambush' || s.kind === 'encounter'
          ? s.damage !== undefined
          : s.ratePerSec !== undefined && (s.kind !== 'rumination' || s.durationSec !== undefined),
      '기습·대면형은 damage, 지속형은 ratePerSec, 내면형은 ratePerSec+durationSec가 필요합니다',
    ),
);
export type StimulusTableConfig = z.infer<typeof stimulusTableSchema>;

export const skillsConfigSchema = z.object({
  earphones: z.object({ auditoryMultiplier: z.number().min(0).max(1), lowpassHz: positive, npcFootstepGain: nonNegative }),
  phonePretend: z.object({
    blocksEyeContact: z.boolean(),
    pitchDeg: z.number().min(-89).max(0),
    moveMultiplier: z.number().min(0).max(1),
    pitchLerpPerSec: positive,
  }),
});
export type SkillsConfig = z.infer<typeof skillsConfigSchema>;

export const playerConfigSchema = z.object({
  walkSpeed: positive,
  runSpeed: positive,
  height: positive,
  radius: positive,
  eyeHeight: positive,
  stepHeight: nonNegative,
  maxSlopeDeg: z.number().min(0).max(89),
  gravity: z.number().negative(),
  interactRange: positive,
  mouseSensitivity: positive,
});
export type PlayerConfig = z.infer<typeof playerConfigSchema>;

const unit = z.number().min(0).max(1);
export const presentationConfigSchema = z.object({
  postfx: z.object({
    stressVignette: unit,
    redTint: z.tuple([unit, unit, unit]),
    tiredDesaturation: unit,
    dangerDistortion: nonNegative,
    criticalTunnel: unit,
    burnoutFadeSec: positive,
    /** 접근성: 왜곡 강도 배율 (0이면 끔) */
    distortionScale: nonNegative,
  }),
  camera: z.object({
    dangerFovExtraDeg: nonNegative,
    shakeAmplitude: nonNegative,
    shakeRollDeg: nonNegative,
    shakeFrequency: positive,
    burnoutSinkSec: positive,
    burnoutSinkHeight: nonNegative,
    burnoutRollDeg: nonNegative,
    headBobAmplitude: nonNegative,
    headBobFrequency: positive,
  }),
  audio: z.object({
    masterVolume: unit,
    murmurZoneGain: nonNegative,
    murmurTiredBonus: nonNegative,
    heartbeatMinBpm: positive,
    heartbeatMaxBpm: positive,
    heartbeatGain: nonNegative,
    tinnitusHz: positive,
    tinnitusGain: nonNegative,
    ringGain: nonNegative,
    footstepGain: nonNegative,
  }),
});
export type PresentationConfig = z.infer<typeof presentationConfigSchema>;

export const npcProfileSchema = z.object({
  type: z.enum(['passerby', 'hunter', 'stalker', 'boss', 'ally']),
  displayTagKey: z.string(),
  walkSpeed: positive,
  approachSpeed: positive,
  viewDistance: positive,
  viewHalfAngleDeg: z.number().min(0).max(180),
  hearingRadius: nonNegative,
  noticeFillPerSec: positive,
  noticeDecayPerSec: nonNegative,
  eyeContactMultiplier: z.number().min(1),
  eyeContactAngleDeg: positive,
  noticePauseSec: nonNegative,
  talkRange: positive,
  stareSec: nonNegative,
  lingerRange: positive,
  talkDurationSec: positive,
  loseSightGiveUpSec: positive,
  cooldownSec: nonNegative,
  waypointWaitSec: nonNegative,
  encounterStimulus: z.string(),
  lingerStimulus: z.string(),
  gazeStimulus: z.string(),
});
export const npcProfilesSchema = z.record(z.string(), npcProfileSchema);
export type NpcProfile = z.infer<typeof npcProfileSchema>;

export const stageConfigSchema = z.object({
  id: z.string(),
  level: z.string(),
  titleKey: z.string(),
  homeVolume: z.string(),
  objectives: z.array(
    z.object({
      id: z.string(),
      textKey: z.string(),
      completeOnEvent: z.string().optional(),
      requires: z.array(z.string()).optional(),
    }),
  ),
  winEvent: z.string(),
  winRequires: z.array(z.string()),
  events: z.record(z.string(), z.object({ stimulus: z.string() })),
  interactions: z.record(z.string(), z.string()),
  npcs: z.array(z.object({ id: z.string(), profile: z.string() })),
  elevator: z
    .object({
      car: z.string(),
      stops: z
        .array(z.object({ floor: z.string(), offsetY: z.number(), door: z.string(), callEvent: z.string() }))
        .min(2),
      startStop: z.string(),
      panelEvent: z.string(),
      speed: positive,
      doorOpenSec: positive,
      doorMoveSec: positive,
      doorSlide: positive,
      closePressCutSec: nonNegative,
    })
    .optional(),
});
export type StageConfig = z.infer<typeof stageConfigSchema>;

export const textTableSchema = z.record(z.string(), z.string());
export type TextTable = z.infer<typeof textTableSchema>;

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
