import { z } from 'zod';
import { lifeStatIds } from '../sim/LifeStats';

// /data JSON 설정의 스키마. 브라우저(게임)와 Node(도구·테스트) 양쪽에서 쓰므로 순수 TS로 유지한다.

const positive = z.number().positive();
const nonNegative = z.number().min(0);
const unit = z.number().min(0).max(1);
const vec2 = z.tuple([z.number(), z.number()]);
const rect = z.tuple([z.number(), z.number(), positive, positive]);
const hhmm = z.string().regex(/^\d{1,2}:\d{2}$/, 'HH:MM 형식이어야 합니다');
/** 이야기 조건: 지난 날들에 생긴 이야기 표지. "flag"는 있어야, "!flag"는 없어야, "count>=N"은 N 이상 (data/story.json) */
const storyIf = z.array(z.string().regex(/^(!?[\w.]+|[\w.]+>=\d+)$/, '이야기 표지는 영문·숫자·점, 없어야 하면 앞에 !, 셈은 이름>=N'));
const lifeDelta = z.object(Object.fromEntries(lifeStatIds.map((id) => [id, z.number().optional()])) as Record<
  (typeof lifeStatIds)[number],
  z.ZodOptional<z.ZodNumber>
>);

// ───── 입력 ─────
export const inputActions = [
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'sprint',
  'interact',
  'earphones',
  'phonePretend',
  'coverCheeks',
  'closeEyes',
  'phone',
  'map',
  'useItem1',
  'useItem2',
  'useItem3',
  'useItem4',
  'useItem5',
  'useItem6',
  'useItem7',
  'useItem8',
  'mask',
  'reply1',
  'reply2',
  'reply3',
  'reply4',
  'smile',
  'sos',
  'confirm',
  'accept',
  'decline',
  'textInstead',
  'pause',
  'options',
  'toggleHints',
  'toggleDebug',
  'leave',
] as const;
export type InputAction = (typeof inputActions)[number];

export const inputConfigSchema = z.object(
  Object.fromEntries(inputActions.map((a) => [a, z.array(z.string()).min(1)])) as Record<InputAction, z.ZodArray<z.ZodString>>,
);
export type InputConfig = z.infer<typeof inputConfigSchema>;

// ───── 밸런스 ─────
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
  /** 심리 상태 (src/sim/EnergyModel.ts): 자극 → 긴장·스트레스·당황·멘붕 → 에너지 소모 */
  psyche: z.object({
    max: positive,
    gain: z.object({ ambush: nonNegative, encounter: nonNegative, continuous: nonNegative, rumination: nonNegative }),
    hitEnergy: nonNegative,
    drain: z.object({ tension: nonNegative, stress: nonNegative, panic: nonNegative, meltdown: nonNegative }),
    decay: z.object({ tension: nonNegative, stress: nonNegative, panic: nonNegative }),
    decayDelaySec: z.object({ tension: nonNegative, stress: nonNegative, panic: nonNegative }),
    meltdown: z.object({ threshold: positive, risePerSec: nonNegative, decayPerSec: nonNegative }),
    symptomFrom: nonNegative,
  }),
  /** 에너지 0: 주저앉은 뒤 집에서 다시 일어난다 (시간이 흐르고 에너지 일부만) */
  respawn: z.object({ battery: positive, hours: nonNegative, latestTime: hhmm }),
  ambush: z.object({ freezeSec: nonNegative, shakeSec: nonNegative }),
  /** 업무 스트레스: 일하는 동안 긴장이 쌓이고(쌓이는 동안 가라앉지 않음), 답 못 한 메신저마다 더. 오후를 건너뛰면 그만큼 지쳐서 퇴근 */
  work: z.object({ pressureStressPerSec: nonNegative, pendingPingStressPerSec: nonNegative, bossPingMultiplier: positive, afternoonStress: nonNegative }),
  /** 조급함: 달리면 차오르고(fullAfterSec), 걸으면 천천히 가라앉는다(calmSec). 차 있는 만큼 스트레스가 오른다 */
  hurry: z.object({ fullAfterSec: positive, calmSec: positive, stressPerSec: nonNegative }),
  /**
   * 마을버스: intervalMin분마다 양 끝에서 출발, 1분에 tilesPerMin칸, 정류장마다 dwellMin분. 요금 fare.
   * 타고 있는 동안 군중 밀도 crowd(러시아워 crowdRush), acquaintanceChance 확률로 아는 사람이 같이 탄다(어색한 침묵)
   */
  bus: z.object({
    intervalMin: positive,
    tilesPerMin: positive,
    dwellMin: nonNegative,
    fare: nonNegative,
    crowd: nonNegative,
    crowdRush: nonNegative,
    acquaintanceChance: unit,
  }),
  /**
   * 공유 자전거: 대여소(bikeDock)에서 요금(fare)을 내고 탄다. 걷기의 speedMultiplier배.
   * 타는 동안 아무도 말을 걸 수 없지만 군중 속은 crowdScale배 더 긴장되고, 폰·먹기·우산은 못 쓴다. 건물에 들어서면 문 앞에 세운다
   */
  bike: z.object({ fare: nonNegative, speedMultiplier: positive, crowdScale: positive }),
  /** 연차: 한 주에 쓸 수 있는 날 수 (하루 시작 화면에서 [L]) */
  leave: z.object({ perWeek: z.number().int().min(0) }),
  /** 눈인사(nodOnly인 사람과 눈이 마주침): 이 거리 안에서 하루 한 번, 마음이 calm만큼 가라앉는다 */
  nod: z.object({ range: positive, calm: nonNegative }),
  recovery: z.object({
    homeLockedPerSec: nonNegative,
    allyNearPerSec: nonNegative,
    allyRange: positive,
    soloMeal: nonNegative,
    homeMeal: nonNegative,
    plansCancelled: nonNegative,
    benchPerSec: nonNegative,
    windowPerSec: nonNegative,
    /** 서점에서 책 구경 (배터리/초, 스트레스 감소/초) */
    booksPerSec: nonNegative,
    booksStressPerSec: nonNegative,
    petStressRelief: nonNegative,
    washStressRelief: nonNegative,
    hobbyStressRelief: nonNegative,
    /** 업무를 마치고 건너뛴 오후 (자리에서 혼자 보낸 시간) */
    workAfternoon: nonNegative,
  }),
  clock: z.object({
    minutesPerSecond: positive,
    rushHours: z.array(z.tuple([hhmm, hhmm])),
    rushCrowdMultiplier: positive,
  }),
  safe: z.object({ knockRepeatSec: positive, fittingAnswerSec: positive }),
  /** 코인세탁방: 기다리는 시간(실제 초), 게임 시계 진행(분), 생활 필수 보상 */
  laundry: z.object({ waitSec: positive, minutes: nonNegative, essentials: nonNegative }),
  rehearsal: z.object({ damageScale: unit, flushScale: unit }),
  personalSpace: z.object({ radius: positive, freezeSec: nonNegative, cooldownSec: nonNegative }),
  slipstream: z.object({ behindDist: positive, lateral: positive, crowdScale: unit }),
  /** 군중 밀도: 반경 안 행인 수 × perAgent (최대 max). 밀도만큼 긴장이 오르고, sustainFrom 이상이면 그동안 가라앉지 않는다 */
  crowdDensity: z.object({ radius: positive, perAgent: nonNegative, max: positive, stressPerSec: nonNegative, sustainFrom: nonNegative }),
  gaze: z.object({ range: positive }),
  sweat: z.object({ rumbleMs: nonNegative }),
  sos: z.object({ bondMin: nonNegative }),
  boss: z.object({ visitAfterIgnoredMessages: positive }),
});
export type BalanceConfig = z.infer<typeof balanceConfigSchema>;

/** 회복 효과 (소모품·생활 행동 공용) */
const recoveryEffects = z.object({
  /** 배터리 회복량 */
  battery: nonNegative.optional(),
  /** 스트레스 감소량 */
  stress: nonNegative.optional(),
  /** 증상 강도 감소 (0~1) */
  flush: unit.optional(),
  migraine: unit.optional(),
  /** 차분함: sec초 동안 마음(심리 상태)이 초당 perSec씩 더 가라앉는다 */
  soothe: z.object({ perSec: positive, sec: positive }).optional(),
  /** 스트레스 내성: sec초 동안 자극이 심리 상태를 올리는 양 × scale */
  resist: z.object({ scale: unit, sec: positive }).optional(),
  /** "모두 사라져 버려~": 그 자리에서 곧장 집(잠근 안전지대)으로. 시간은 흐르지 않는다 */
  warpHome: z.boolean().optional(),
});
export type RecoveryEffects = z.infer<typeof recoveryEffects>;

/** 생활 행동 (data/chores.json): 고양이 밥, 설거지, 분리수거… 하루 한 번씩 */
export const choresConfigSchema = z.record(
  z.string(),
  z.object({ toastKey: z.string(), minutes: nonNegative, effects: recoveryEffects, life: lifeDelta.optional() }),
);
export type ChoresConfig = z.infer<typeof choresConfigSchema>;

/** 소모품과 상점 (data/items.json). 단축키 1~8은 가방에 든 순서(칸) */
export const itemsConfigSchema = z.object({
  /** 가방: 소모품을 합쳐서 이만큼만 들고 다닌다 */
  bagMax: z.number().int().min(1),
  consumables: z
    .array(
      z.object({
        id: z.string(),
        nameKey: z.string(),
        useKey: z.string(),
        icon: z.enum(['cup', 'snack', 'tumbler', 'can', 'bottle', 'pill', 'tea', 'patch', 'rice', 'sandwich', 'bread', 'banana', 'box', 'book', 'fidget', 'cream', 'flower', 'can', 'candy', 'jelly', 'vitamin', 'star']).optional(),
        effects: recoveryEffects,
        /** 혼자만의 틈: 이만큼(초) 멈춰 서서 천천히 먹거나 쓰고, 효과도 그동안 나눠 찬다. 움직이거나 말을 걸려 오면 그만둔다 */
        breakSec: positive.optional(),
        /** 나를 보는 사람이 없고 군중 속이 아닐 때만 효과가 찬다 (보이면 손이 멈춘다) */
        quiet: z.boolean().optional(),
        /** 위안 물건: 쓰고도 없어지지 않고 하루에 이만큼 쓸 수 있다 */
        usesPerDay: z.number().int().min(1).optional(),
      }),
    ),
  /** 쓰면 없어지지 않는 물건 (우산 등). 상점 품목 item에 소모품 대신 이 id를 쓸 수 있다 */
  gear: z.array(z.object({ id: z.string(), nameKey: z.string(), icon: z.enum(['umbrella']).optional() })),
  /** 상점·찬장·탕비실. price 0이면 무료, life는 돈 대신 쓰는 생활 지표(집 찬장), perDay는 하루에 챙길 수 있는 개수(탕비실) */
  shops: z.record(
    z.string(),
    z.object({
      titleKey: z.string(),
      stock: z.array(z.object({ item: z.string(), price: nonNegative, life: lifeDelta.optional(), perDay: z.number().int().min(1).optional() })).min(1),
      /**
       * 단골: 이야기 셈(counter)이 minVisits 이상이면 주문 대화 없이 "늘 드시던 걸로요?" (greetKey, 그날 처음 한 번).
       * 그 전에는 살 때마다 주문 자극(orderStimulus). 들른 날은 story.json의 bought:<가게> 규칙이 센다
       */
      regular: z.object({ counter: z.string(), minVisits: z.number().int().min(1), orderStimulus: z.string(), greetKey: z.string() }).optional(),
    }),
  ),
});
export type ItemsConfig = z.infer<typeof itemsConfigSchema>;
export type ConsumableDef = ItemsConfig['consumables'][number];

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

export const somaticConfigSchema = z.object({
  flush: z.object({
    gazeCount: positive,
    gazeRisePerSec: nonNegative,
    decayPerSec: nonNegative,
    coverDecayPerSec: nonNegative,
    refusal: unit,
    slip: unit,
    remarkThreshold: unit,
  }),
  migraine: z.object({ onsetSec: nonNegative, risePerSec: nonNegative, decayPerSec: nonNegative, eyesClosedDecayPerSec: nonNegative }),
  stutter: z.object({ panic: nonNegative }),
  sweat: z.object({ stress: nonNegative, sustainSec: nonNegative, slipChance: unit }),
  remedies: z.object({ washFaceStressRelief: nonNegative }),
});
export type SomaticFileConfig = z.infer<typeof somaticConfigSchema>;

const contactSchema = z.object({
  nameKey: z.string(),
  answerStimulus: z.string(),
  answer: lifeDelta,
  avoid: lifeDelta,
  texted: lifeDelta,
  reply: lifeDelta,
  readIgnored: lifeDelta,
  unread: lifeDelta,
  escalation: z.string().optional(),
  ally: z.boolean().optional(),
  /** 알림을 꺼 둔 단톡방: 와도 울리지 않고 화면을 가리지 않으며, 안 읽어도 아무 일 없다. 폰을 열면 읽을 수 있다 */
  muted: z.boolean().optional(),
});

export const lifeConfigSchema = z.object({
  stats: z.object({
    max: positive,
    start: z.object(Object.fromEntries(lifeStatIds.map((id) => [id, nonNegative])) as Record<(typeof lifeStatIds)[number], typeof nonNegative>),
    startMoney: nonNegative,
    escalateAfter: positive,
    /** 생활 지표가 이 값보다 낮으면 메모에 '이렇게 하면 오른다' 안내 */
    lowTipBelow: nonNegative,
  }),
  contacts: z.record(z.string(), contactSchema),
  settlement: z.object({
    dailyDecay: lifeDelta,
    dailyCost: z.object({ money: nonNegative, unpaidEssentials: z.number() }),
    weekly: z.object({ goodIncome: nonNegative, goodBonusMoney: nonNegative, badIncomeDelta: z.number() }),
    monthEnd: z.object({ rent: nonNegative, salaryBase: nonNegative, salaryPerIncome: nonNegative, unpaidHousingDelta: z.number() }),
  }),
  night: z.object({
    baseMax: positive,
    minMax: positive,
    stressPenaltyPerPoint: nonNegative,
    ruminationPenalty: nonNegative,
    hobbyBonus: nonNegative,
    lateFrom: hhmm,
    latePenaltyPerHour: nonNegative,
    housingLow: nonNegative,
    housingLowPenalty: nonNegative,
    essentialsLow: nonNegative,
    essentialsLowPenalty: nonNegative,
  }),
  rewards: z.object({
    workDone: lifeDelta,
    workPerTask: nonNegative,
    workPingIgnored: lifeDelta,
    workPingReplied: lifeDelta,
    late: lifeDelta,
    groceries: lifeDelta,
    homeMealEssentials: z.number(),
    allyMeet: lifeDelta,
    mandatorySkipped: lifeDelta,
  }),
});
export type LifeConfig = z.infer<typeof lifeConfigSchema>;

export const skillsConfigSchema = z.object({
  earphones: z.object({ auditoryMultiplier: unit, lowpassHz: positive, ambushChanceMultiplier: positive, backApproachTapChance: unit }),
  phonePretend: z.object({ blocksEyeContact: z.boolean(), moveMultiplier: unit, viewNarrow: unit }),
  coverCheeks: z.object({ moveMultiplier: unit }),
  closeEyes: z.object({ moveMultiplier: unit }),
  hide: z.object({ noticeMultiplier: unit }),
  mask: z.object({ hidesFlush: z.boolean(), stuffyStressPerSec: nonNegative }),
});
export type SkillsConfig = z.infer<typeof skillsConfigSchema>;

export const playerConfigSchema = z.object({
  walkSpeed: positive,
  runSpeed: positive,
  radius: positive,
  interactRange: positive,
  runNoiseMultiplier: positive,
  stairsFatigue: nonNegative,
});
export type PlayerConfig = z.infer<typeof playerConfigSchema>;

export const presentationConfigSchema = z.object({
  camera: z.object({
    tilePx: positive,
    followLerp: positive,
    dangerZoomOut: unit,
    dangerStretch: unit,
    shakePx: nonNegative,
    heartbeatPulse: nonNegative,
  }),
  fx: z.object({
    stressVignette: unit,
    redTint: z.string(),
    tiredDesaturation: unit,
    criticalTunnel: unit,
    lightRadiusTiles: positive,
    lightRadiusCritical: positive,
    wallCloseIn: unit,
    burnoutFadeSec: positive,
    chromaticPx: nonNegative,
    migraineBlurPx: nonNegative,
    flushHeight: unit,
    homeAmber: unit,
    gazeLineAlpha: unit,
    soundRings: z.boolean(),
    /** NPC 시야 콘: 안쪽 채움, 테두리 불투명도 */
    viewConeAlpha: unit,
    viewConeEdgeAlpha: unit,
    /** 상호작용 지점·목표 표식이 보이는 거리 (칸) */
    markerRange: positive,
    /** 은신·세이프 지점이 보이는 거리 (칸) */
    zoneRange: positive,
  }),
  /** 해 질 녘: duskStart~duskEnd 사이에 어두워진다. 실내·가로등·창문은 밝게 남는다 */
  night: z.object({ duskStart: hhmm, duskEnd: hhmm, darkness: unit, lampRadius: positive, rainOvercast: unit }),
  /** 배경 연출: 지붕, 구름 그림자, 비둘기, 시간대 빛깔 (src/presentation/draw/ambient.ts) */
  ambient: z.object({
    roofFadeSec: positive,
    cloudAlpha: unit,
    cloudSpeed: nonNegative,
    pigeonFlocks: z.array(z.object({ at: vec2, count: z.number().int().min(1) })),
    pigeonScareRadius: positive,
    pigeonRunScareRadius: positive,
    pigeonReturnSec: positive,
    timeTint: z.array(z.object({ at: hhmm, color: z.string().regex(/^#[0-9a-fA-F]{6}$/), alpha: unit })),
  }),
  /** 사람 그리기 (src/presentation/draw/people.ts) */
  people: z.object({ visualScale: positive }),
  /** 작은 입자와 마무리 효과 (src/presentation/draw/particles.ts) */
  particles: z.object({
    /** 화면 칸 하나를 1초에 몇 번 들여다볼지. 아래 확률은 맞는 칸을 골랐을 때 생길 확률 */
    samplesPerTileSec: nonNegative,
    leaf: unit,
    steam: unit,
    smoke: unit,
    mote: unit,
    splash: unit,
    dustPerStep: z.number().int().min(0),
    embersPerSec: nonNegative,
    fireflies: z.number().int().min(0),
    /** 화면 가장자리 은은한 어둠 (늘 깔림) */
    vignette: unit,
    /** 필름 결 */
    grain: unit,
    /** 건물 정면 높이 (칸): 지붕 아래로 벽과 창이 보인다 */
    facadeHeight: nonNegative,
  }),
  audio: z.object({
    masterVolume: unit,
    murmurGain: nonNegative,
    murmurTiredBonus: nonNegative,
    rainGain: nonNegative,
    heartbeatMinBpm: positive,
    heartbeatMaxBpm: positive,
    heartbeatGain: nonNegative,
    tinnitusHz: positive,
    tinnitusGain: nonNegative,
    ringGain: nonNegative,
    footstepGain: nonNegative,
    bloodGain: nonNegative,
    migraineWhineGain: nonNegative,
    sanctuaryMusicGain: nonNegative,
    crossfadeSec: positive,
  }),
});
export type PresentationConfig = z.infer<typeof presentationConfigSchema>;

// ───── NPC ─────
export const npcTypes = ['passerby', 'acquaintance', 'hunter', 'stalker', 'boss', 'ally', 'pet'] as const;
export type NpcType = (typeof npcTypes)[number];

export const npcProfileSchema = z.object({
  type: z.enum(npcTypes),
  displayTagKey: z.string(),
  /** 윗옷 색 (#rrggbb) */
  color: z.string(),
  /** 외형 고정 (없으면 NPC id 해시로 정함) */
  look: z
    .object({
      skin: z.string().optional(),
      hair: z.string().optional(),
      hairStyle: z.enum(['short', 'long', 'bun', 'bald', 'cap', 'ponytail', 'curly']).optional(),
      accessory: z.enum(['none', 'bag', 'backpack', 'phone', 'apron', 'lanyard', 'glasses', 'tray', 'umbrella']).optional(),
      accent: z.string().optional(),
    })
    .optional(),
  walkSpeed: positive,
  approachSpeed: positive,
  viewDistance: positive,
  viewHalfAngleDeg: z.number().min(0).max(180),
  hearingRadius: nonNegative,
  noticeFillPerSec: positive,
  noticeDecayPerSec: nonNegative,
  eyeContactMultiplier: z.number().min(1),
  eyeContactAngleDeg: positive,
  talkRange: positive,
  stareSec: nonNegative,
  giveUpSec: positive,
  cooldownSec: nonNegative,
  waypointWaitSec: nonNegative,
  approaches: z.boolean(),
  /** 눈인사만 하는 사람: 말을 걸지 않고, 눈이 마주치면 서로 고개만 끄덕인다. 시선 자극이 없다 (balance.nod) */
  nodOnly: z.boolean().optional(),
  dialogue: z.string(),
  encounterStimulus: z.string(),
  baseDurationSec: positive,
  minDurationSec: nonNegative,
  /** 스폰 지점에서 이 거리 이상 따라오지 않는다 */
  leash: positive.optional(),
  stalkDistance: positive.optional(),
  stareTriggerSec: positive.optional(),
  graceAfterParrySec: nonNegative.optional(),
  radius: positive.optional(),
});
export const npcProfilesSchema = z.record(z.string(), npcProfileSchema);
export type NpcProfile = z.infer<typeof npcProfileSchema>;

const dialogueLineSchema = z.object({
  text: z.string(),
  kind: z.enum(['question', 'story', 'opening', 'remark']),
  durationSec: positive,
});
export const dialoguePoolSchema = z.object({
  greeting: dialogueLineSchema,
  lines: z.array(dialogueLineSchema).min(1),
  flushRemark: dialogueLineSchema,
  closers: z.object({ satisfied: z.string(), parried: z.string(), endured: z.string(), sos: z.string(), awkward: z.string() }),
});

export const dialogueConfigSchema = z.object({
  parryWindowSec: positive,
  gapSec: positive,
  satisfactionPerReply: positive,
  perfectMultiplier: positive,
  wrongExtraSec: nonNegative,
  wrongSatisfactionLoss: nonNegative,
  smileDropPerSec: nonNegative,
  ignoredLoss: nonNegative,
  sosDelaySec: positive,
  flushRemarkChance: unit,
  /** 어색한 대답 한 번에 오르는 당황 */
  wrongPanic: nonNegative,
  speech: z.object({ beatSec: positive, zoneCenter: unit, zoneWidth: unit }),
});
export type DialogueFileConfig = z.infer<typeof dialogueConfigSchema>;

export const speechesSchema = z.record(
  z.string(),
  z.object({
    chunks: z.array(z.string()).min(1),
    /** 영어 화면일 때 (없으면 chunks) */
    chunksEn: z.array(z.string()).min(1).optional(),
    stimulus: z.string(),
    audience: nonNegative,
    objectiveEvent: z.string(),
    introKey: z.string(),
    /** 그날 목표가 아니어도 할 수 있는 발화 (약국 등) */
    anytime: z.boolean().optional(),
    /** 끝나면 이 소모품을 값을 치르고 받는다 */
    grant: z.object({ item: z.string(), price: nonNegative }).optional(),
    /** 끝나면 이어서 시작하는 발화 (발표 → 질문 시간) */
    next: z.string().optional(),
    /** 잘 끝나도 이불킥이 온다 */
    rumination: z.boolean().optional(),
  }),
);
export type SpeechDefs = z.infer<typeof speechesSchema>;

// ───── 월드 ─────
export const tileDefsSchema = z
  .array(
    z.object({
      id: z.string(),
      color: z.string(),
      walk: z.boolean(),
      sight: z.boolean(),
      tall: z.boolean().optional(),
      push: vec2.optional(),
      pattern: z.enum(['none', 'stripe', 'dots', 'grid', 'plank']).optional(),
      accent: z.string().optional(),
      /** 장식 (src/presentation/draw/tiles.ts) */
      deco: z
        .enum(['wall', 'window', 'door', 'doorClosed', 'desk', 'shelf', 'rack', 'table', 'counter', 'bed', 'sofa', 'tree', 'plant', 'appliance', 'grill', 'partition', 'grass', 'bench', 'books', 'washer', 'vending', 'readingTable', 'water'])
        .optional(),
    }),
  )
  .min(1);

const worldOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('fill'), rect, tile: z.string() }),
  z.object({ op: z.literal('room'), rect, floor: z.string(), wall: z.string() }),
  z.object({ op: z.literal('tiles'), tile: z.string(), at: z.array(vec2) }),
]);

export const interactableKinds = [
  'bed',
  'piano',
  'window',
  'drip',
  'fridge',
  'sink',
  'mirror',
  'doorLock',
  'peephole',
  'elevator',
  'flavor',
  'desk',
  'speech',
  'coldDrink',
  'shop',
  'laundry',
  'browse',
  'chore',
  'soloMeal',
  'bench',
  'martItem',
  'checkout',
  'priceTag',
  'clothesPick',
  'seat',
  'busStop',
  'bikeDock',
] as const;
export type InteractableKind = (typeof interactableKinds)[number];

const crowdLaneSchema = z.object({ id: z.string(), from: vec2, to: vec2, width: positive, count: z.number().int().min(0), speed: positive, zone: z.string() });

export const worldDefSchema = z.object({
  size: z.tuple([positive, positive]),
  base: z.string(),
  /** 서로 보이지 않는 층 (지상 / 지하 통로 / 아파트 3층). 렌더러는 플레이어가 있는 층만 그린다 */
  layers: z.array(z.object({ id: z.string(), rect })).min(1),
  ops: z.array(worldOpSchema),
  areas: z.array(
    z.object({
      id: z.string(),
      rect,
      kind: z.enum(['outdoor', 'indoor', 'home']),
      labelKey: z.string(),
      stimulus: z.object({ id: z.string(), intensity: positive }).optional(),
      small: z.boolean().optional(),
    }),
  ),
  hides: z.array(z.object({ id: z.string(), rect })),
  safes: z.array(z.object({ id: z.string(), rect, kind: z.enum(['stall', 'fitting']), noiseAfterSec: positive })),
  interactables: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(interactableKinds),
      at: vec2,
      labelKey: z.string(),
      price: nonNegative.optional(),
      item: z.string().optional(),
      mode: z.enum(['normal', 'self']).optional(),
      speech: z.string().optional(),
      seat: z.string().optional(),
      target: z.string().optional(),
      monologue: z.string().optional(),
      shop: z.string().optional(),
      chore: z.string().optional(),
    }),
  ),
  portals: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['stairs', 'subway', 'door']),
      at: vec2,
      to: z.string(),
      arrive: vec2,
      travelSec: nonNegative,
      labelKey: z.string(),
    }),
  ),
  elevator: z.object({ car: vec2, carArea: z.string(), fronts: z.record(z.string(), vec2) }),
  /**
   * 마을버스 노선 (대로를 따라 동서로). 버스는 fromX ↔ toX를 달리고, 동쪽 방면은 laneEastY, 서쪽 방면은 laneWestY 차로.
   * 정류장(busStop 상호작용)의 target은 내릴 정류장 id. 내리는 자리는 방향에 맞는 보도(curbSouthY/curbNorthY)
   */
  bus: z
    .object({
      routeKey: z.string(),
      fromX: z.number(),
      toX: z.number(),
      laneEastY: z.number(),
      laneWestY: z.number(),
      curbSouthY: z.number(),
      curbNorthY: z.number(),
      stops: z.record(z.string(), z.object({ x: z.number(), nameKey: z.string() })),
    })
    .optional(),
  spawns: z.record(z.string(), vec2),
  paths: z.record(z.string(), z.object({ points: z.array(vec2).min(1), loop: z.boolean() })),
  crowdLanes: z.array(crowdLaneSchema),
  /** 충돌 없는 거리·생활 소품 (src/presentation/draw/props.ts) */
  props: z
    .array(
      z.object({
        kind: z.enum(['lamp', 'bin', 'bike', 'aircon', 'pot', 'hydrant', 'manhole', 'recycleGreen', 'recycleBlue', 'recycleYellow', 'catBowl', 'busStop']),
        at: vec2,
        rot: z.number().optional(),
      }),
    )
    .optional(),
  /** color가 있으면 가게 간판처럼 그 색 바탕으로 그린다 */
  labels: z.array(z.object({ at: vec2, textKey: z.string(), color: z.string().optional() })),
});
export type WorldDef = z.infer<typeof worldDefSchema>;
export type InteractableDef = WorldDef['interactables'][number];
export type PortalDef = WorldDef['portals'][number];
export type SafeDef = WorldDef['safes'][number];

// ───── 하루 ─────
const dayNpcSchema = z.object({
  id: z.string(),
  profile: z.string(),
  at: z.string(),
  path: z.string().optional(),
  from: hhmm.optional(),
  to: hhmm.optional(),
  seated: z.boolean().optional(),
  /** 그날만 다른 대사 풀 (옆집 아주머니의 후속 인사 등) */
  dialogue: z.string().optional(),
  /** 나타날 확률 (기본 1) */
  chance: unit.optional(),
  /** 위치·경로·시간 대안: 하루를 시작할 때 기본값 또는 이 중 하나를 고른다 */
  alt: z.array(z.object({ at: z.string(), path: z.string().optional(), from: hhmm.optional(), to: hhmm.optional() })).optional(),
  if: storyIf.optional(),
});
export type DayNpcDef = z.infer<typeof dayNpcSchema>;

export const daySchema = z.object({
  id: z.string(),
  weekdayKey: z.string(),
  titleKey: z.string(),
  introKey: z.string(),
  start: hhmm,
  spawn: z.string(),
  flags: z.object({ weeklyEval: z.boolean(), monthEnd: z.boolean() }),
  /** 비 오는 날: 바깥이 흐려지고, 우산 없이 실외에 있으면 rainSoaked 자극 */
  weather: z.enum(['clear', 'rain']).optional(),
  /** 그날만 생기는 군중 동선 (플리마켓 등) */
  crowdLanes: z.array(crowdLaneSchema).optional(),
  /** 그날만 영역 자극을 덮어쓴다 */
  areaStimuli: z.array(z.object({ area: z.string(), id: z.string(), intensity: nonNegative, if: storyIf.optional() })).optional(),
  /** 그날만 서는 노점 천막 (충돌 없음, 그림만) */
  stalls: z.array(z.object({ rect, color: z.string() })).optional(),
  /** 하루 시작 화면에 붙는 이야기 한 줄 (지난 날의 선택이 남긴 것) */
  notes: z.array(z.object({ textKey: z.string(), if: storyIf.optional(), /** 하루 시작에 가방에 넣어 주는 소모품 */ give: z.string().optional() })).optional(),
  /** 연차: allowed면 하루 시작 화면에서 [L]로 쉬는 날이 된다 (회사 일 목표가 빠지고 cost만큼 생활 지표). 아니면 noteKey가 이유 */
  leave: z.object({ allowed: z.boolean(), cost: lifeDelta.optional(), noteKey: z.string() }).optional(),
  /** 그날만 상호작용의 안내·독백·발화를 바꾼다 (목요일 회의 자리 = 발표) */
  interactAt: z.record(z.string(), z.object({ labelKey: z.string().optional(), monologue: z.string().optional(), speech: z.string().optional() })).optional(),
  objectives: z.array(
    z.object({
      id: z.string(),
      textKey: z.string(),
      on: z.string(),
      count: positive.optional(),
      requires: z.array(z.string()).optional(),
      mandatory: z.boolean().optional(),
      optional: z.boolean().optional(),
      skip: lifeDelta.optional(),
      deadline: hhmm.optional(),
      late: lifeDelta.optional(),
      lateStimulus: z.string().optional(),
      /** 이 시각이 지나면 못 하고 넘어간다 (퇴근 시간이 지난 업무 등). 뒤따르는 목표는 더 막지 않는다 */
      closes: hhmm.optional(),
      /** 놓쳤을 때 생활 지표 (없으면 필수 목표만 mandatorySkipped) */
      missed: lifeDelta.optional(),
      endsDay: z.boolean().optional(),
      /** 지도·화면 가장자리 화살표가 가리킬 곳: 상호작용 id 또는 영역 id */
      marker: z.string().optional(),
      if: storyIf.optional(),
      /** 회사 일 (출근·업무·회의·회식). 연차를 내면 빠진다 */
      workday: z.boolean().optional(),
    }),
  ),
  phone: z.array(
    z
      .object({
        at: hhmm.optional(),
        on: z.string().optional(),
        kind: z.enum(['call', 'message']),
        contact: z.string(),
        textKey: z.string(),
        mandatory: z.boolean().optional(),
        /** 특별 효과: 상대가 먼저 약속을 취소 (배터리 +50) */
        effect: z.enum(['plansCancelled']).optional(),
        /** 발생 확률 (기본 1) */
        chance: unit.optional(),
        /** 문구 후보: 있으면 textKey 대신 이 중 하나 (같은 날도 매번 조금 다르게) */
        textKeys: z.array(z.string()).optional(),
        /** at 시각을 ±분 만큼 흔든다 */
        jitterMin: nonNegative.optional(),
        if: storyIf.optional(),
      })
      .refine((p) => (p.at === undefined) !== (p.on === undefined), 'at(시각) 또는 on(이벤트) 중 하나만 지정'),
  ),
  npcs: z.array(dayNpcSchema),
  /** 그날 쓸 수 없는 상호작용 (엘리베이터 점검 등). 시도하면 toastKey */
  blocked: z.array(z.object({ interactable: z.string(), toastKey: z.string() })).optional(),
  work: z
    .object({ endTime: hhmm, tasks: positive, focusPerSec: positive, pingEverySec: z.tuple([positive, positive]), pingTimeoutSec: positive })
    .optional(),
  dinner: z
    .object({
      area: z.string(),
      seatChoiceSec: positive,
      toastAfterSec: positive,
      laughEverySec: z.tuple([positive, positive]),
      laughWindowSec: positive,
      grillCookSec: positive,
      grillBurnSec: positive,
      seatEffects: z.record(z.string(), z.object({ gazeExtra: nonNegative, bossAttention: nonNegative })),
      minutesPerSecond: positive,
    })
    .optional(),
});
export type DayDef = z.infer<typeof daySchema>;
export type BusRouteDef = NonNullable<WorldDef['bus']>;
export type ObjectiveDef = DayDef['objectives'][number];

export const campaignSchema = z.object({ days: z.array(z.string()).min(1) });

/**
 * 작은 사건 (data/happenings.json). 같은 요일이어도 하루를 시작할 때마다 몇 개를 골라 그날에 섞는다.
 * 사람·전화·군중·소음·노점·날씨·막힌 시설을 더하고, 하루 시작 화면에 한 줄로 알린다.
 */
export const happeningsConfigSchema = z.object({
  maxPerDay: z.number().int().min(0),
  list: z.array(
    z.object({
      id: z.string(),
      /** 하루 시작 화면에 붙는 한 줄 (없으면 조용히 일어난다) */
      introKey: z.string().optional(),
      chance: unit,
      /** 이 하루(id)들에만. 없으면 모든 날 */
      days: z.array(z.string()).optional(),
      /** 이 날씨일 때만 */
      weather: z.enum(['clear', 'rain']).optional(),
      /** 같은 group은 하루에 하나만 */
      group: z.string().optional(),
      setWeather: z.enum(['clear', 'rain']).optional(),
      npcs: z.array(dayNpcSchema).optional(),
      phone: z.array(daySchema.shape.phone.element).optional(),
      crowdLanes: z.array(crowdLaneSchema).optional(),
      areaStimuli: z.array(z.object({ area: z.string(), id: z.string(), intensity: nonNegative })).optional(),
      stalls: z.array(z.object({ rect, color: z.string() })).optional(),
      blocked: z.array(z.object({ interactable: z.string(), toastKey: z.string() })).optional(),
      /** 그날 쉬는 사람 (옆집 아주머니 여행 등) */
      removeNpcs: z.array(z.string()).optional(),
    }),
  ),
});
export type HappeningsConfig = z.infer<typeof happeningsConfigSchema>;
export type HappeningDef = HappeningsConfig['list'][number];

/**
 * 한 주를 꿰는 이야기 줄기 (data/story.json).
 * 게임 이벤트가 이야기 표지를 남기고(marks), 다음 날들의 전화·목표·사람·독백이 표지(if)를 보고 달라진다.
 * 주간 리포트 끝에 줄기마다 결말 한 줄(epilogue, 조건이 맞는 첫 줄)과 맺음말.
 */
export const storyConfigSchema = z.object({
  threads: z.array(z.object({ id: z.string(), nameKey: z.string() })),
  marks: z.array(
    z
      .object({
        on: z.string(),
        day: z.string().optional(),
        /** 남길 표지 */
        flags: z.array(z.string()).optional(),
        /** 하나씩 셀 이름 (카페에 들른 날 수 등) */
        add: z.array(z.string()).optional(),
        /** 하루에 한 번만 (같은 날 여러 번 들러도 하루로 센다) */
        oncePerDay: z.boolean().optional(),
        /** 그 자리에서 받는 소모품 (옆집 반찬). 가방이 가득이면 못 받는다 */
        give: z.string().optional(),
        toastKey: z.string().optional(),
      })
      .refine((m) => m.flags?.length || m.add?.length || m.give, 'flags·add·give 중 하나는 있어야 합니다'),
  ),
  epilogue: z.array(z.object({ thread: z.string(), textKey: z.string(), if: storyIf.optional() })),
  closingKey: z.string(),
});
export type StoryConfig = z.infer<typeof storyConfigSchema>;

/** 사람들의 인상과 사회적 평판 (data/reputation.json, src/sim/Reputation.ts) */
const outcomeTable = <K extends string>(keys: readonly K[]) => z.object(Object.fromEntries(keys.map((k) => [k, z.number()])) as Record<K, z.ZodNumber>);
export const reputationConfigSchema = z.object({
  start: z.number().min(0).max(100),
  people: z.record(z.string(), z.object({ nameKey: z.string(), npcs: z.array(z.string()).optional(), contacts: z.array(z.string()).optional(), start: z.number().min(0).max(100).optional() })),
  dialogue: outcomeTable(['satisfied', 'parried', 'endured', 'awkward', 'sos', 'avoided'] as const),
  phone: outcomeTable(['answered', 'replied', 'texted', 'declined', 'missed', 'readIgnored', 'unread'] as const),
  events: z.record(z.string(), z.record(z.string(), z.number())),
  warmth: z.object({ min: positive, max: positive }),
  tiers: z.array(z.object({ min: z.number(), key: z.string() })).min(1),
});

export const monologueTriggersSchema = z.array(
  z.object({
    key: z.string(),
    when: z.object({
      event: z.string().optional(),
      area: z.string().optional(),
      npcProfile: z.string().optional(),
      npcType: z.enum(npcTypes).optional(),
      distMin: nonNegative.optional(),
      distMax: positive.optional(),
      visible: z.boolean().optional(),
      noticed: z.boolean().optional(),
      returning: z.boolean().optional(),
      /** 이 하루(id)에만 */
      day: z.string().optional(),
    }),
    if: storyIf.optional(),
    once: z.boolean().optional(),
    cooldownSec: nonNegative.optional(),
  }),
);
export type MonologueTrigger = z.infer<typeof monologueTriggersSchema>[number];

export const textTableSchema = z.record(z.string(), z.string());
export type TextTable = z.infer<typeof textTableSchema>;

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
export type ParticlesConfig = PresentationConfig['particles'];
