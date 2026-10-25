import { parseKeyTextCsv } from './csv';
import {
  balanceConfigSchema,
  campaignSchema,
  daySchema,
  dialogueConfigSchema,
  dialoguePoolSchema,
  inputConfigSchema,
  itemsConfigSchema,
  choresConfigSchema,
  happeningsConfigSchema,
  lifeConfigSchema,
  monologueTriggersSchema,
  npcProfilesSchema,
  parseConfig,
  playerConfigSchema,
  presentationConfigSchema,
  skillsConfigSchema,
  somaticConfigSchema,
  speechesSchema,
  stimulusTableSchema,
  textTableSchema,
  tileDefsSchema,
  worldDefSchema,
  type BalanceConfig,
  type DayDef,
  type DialogueFileConfig,
  type InputConfig,
  type ItemsConfig,
  type ChoresConfig,
  type HappeningsConfig,
  type LifeConfig,
  type MonologueTrigger,
  type NpcProfile,
  type PlayerConfig,
  type PresentationConfig,
  type SkillsConfig,
  type SomaticFileConfig,
  type SpeechDefs,
  type StimulusTableConfig,
  type TextTable,
  type WorldDef,
} from './configSchemas';
import type { TileDef } from '../world/TileMap';
import type { DialoguePool } from '../sim/DialogueBattle';
import type { SimConfig } from '../sim/Simulation';

export interface GameConfig {
  input: InputConfig;
  balance: BalanceConfig;
  items: ItemsConfig;
  chores: ChoresConfig;
  happenings: HappeningsConfig;
  stimuli: StimulusTableConfig;
  somatic: SomaticFileConfig;
  life: LifeConfig;
  skills: SkillsConfig;
  player: PlayerConfig;
  presentation: PresentationConfig;
  npcProfiles: Record<string, NpcProfile>;
  dialogueRules: DialogueFileConfig;
  dialoguePools: Record<string, DialoguePool>;
  speeches: SpeechDefs;
  tiles: TileDef[];
  world: WorldDef;
  days: DayDef[];
  monologueTriggers: MonologueTrigger[];
  monologue: Record<string, string>;
  text: TextTable;
  /** 화면 언어. 영어 표에 없는 키는 한국어로 보인다 */
  lang: Lang;
}

export type Lang = 'ko' | 'en';
export const LANGS: readonly Lang[] = ['ko', 'en'];

/** 파일 경로(data/ 기준) → 파싱 전 원본. 브라우저는 Vite import, 도구는 fs로 채운다 */
export interface RawConfig {
  json: Record<string, unknown>;
  /** data/dialogue/<id>.json */
  dialogue: Record<string, unknown>;
  /** data/days/<id>.json */
  days: Record<string, unknown>;
  monologueCsv: string;
  /** data/monologue/en.csv (없으면 한국어 독백만) */
  monologueCsvEn?: string;
}

/** 원본을 zod로 검증해 GameConfig로 만든다. 값이 틀리면 어떤 파일의 어디가 틀렸는지 바로 실패한다. */
export function parseGameConfig(raw: RawConfig, lang: Lang = 'ko'): GameConfig {
  const j = (name: string) => {
    if (!(name in raw.json)) throw new Error(`설정 파일이 없습니다: data/${name}`);
    return raw.json[name];
  };
  const campaign = parseConfig(campaignSchema, j('campaign.json'), 'data/campaign.json');
  const days = campaign.days.map((id) => {
    if (!(id in raw.days)) throw new Error(`하루 설정이 없습니다: data/days/${id}.json`);
    return parseConfig(daySchema, raw.days[id], `data/days/${id}.json`);
  });
  const dialoguePools = Object.fromEntries(
    Object.entries(raw.dialogue).map(([id, data]) => [id, parseConfig(dialoguePoolSchema, data, `data/dialogue/${id}.json`)]),
  );
  return {
    input: parseConfig(inputConfigSchema, j('input.json'), 'data/input.json'),
    balance: parseConfig(balanceConfigSchema, j('balance.json'), 'data/balance.json'),
    items: parseConfig(itemsConfigSchema, j('items.json'), 'data/items.json'),
    chores: parseConfig(choresConfigSchema, j('chores.json'), 'data/chores.json'),
    happenings: parseConfig(happeningsConfigSchema, j('happenings.json'), 'data/happenings.json'),
    stimuli: parseConfig(stimulusTableSchema, j('stimuli.json'), 'data/stimuli.json'),
    somatic: parseConfig(somaticConfigSchema, j('somatic.json'), 'data/somatic.json'),
    life: parseConfig(lifeConfigSchema, j('life.json'), 'data/life.json'),
    skills: parseConfig(skillsConfigSchema, j('skills.json'), 'data/skills.json'),
    player: parseConfig(playerConfigSchema, j('player.json'), 'data/player.json'),
    presentation: parseConfig(presentationConfigSchema, j('presentation.json'), 'data/presentation.json'),
    npcProfiles: parseConfig(npcProfilesSchema, j('npcProfiles.json'), 'data/npcProfiles.json'),
    dialogueRules: parseConfig(dialogueConfigSchema, j('dialogueRules.json'), 'data/dialogueRules.json'),
    dialoguePools,
    speeches: parseConfig(speechesSchema, j('speeches.json'), 'data/speeches.json'),
    tiles: parseConfig(tileDefsSchema, j('world/tiles.json'), 'data/world/tiles.json'),
    world: parseConfig(worldDefSchema, j('world/city.json'), 'data/world/city.json'),
    days,
    monologueTriggers: parseConfig(monologueTriggersSchema, j('monologue/triggers.json'), 'data/monologue/triggers.json'),
    monologue: { ...parseKeyTextCsv(raw.monologueCsv), ...(lang === 'en' && raw.monologueCsvEn ? parseKeyTextCsv(raw.monologueCsvEn) : {}) },
    text: {
      ...parseConfig(textTableSchema, j('text/ko.json'), 'data/text/ko.json'),
      ...(lang === 'en' ? parseConfig(textTableSchema, j('text/en.json'), 'data/text/en.json') : {}),
    },
    lang,
  };
}

/** sim 계층 설정 묶음 */
export function simConfigOf(cfg: GameConfig): SimConfig {
  return {
    energy: cfg.balance,
    somatic: { symptomFrom: cfg.balance.psyche.symptomFrom, ...cfg.somatic },
    life: cfg.life.stats,
  };
}

/** 로컬라이제이션 키 조회. 없으면 키를 그대로 보여 누락을 드러낸다. {name} 치환 지원 */
export function t(text: TextTable, key: string, vars?: Record<string, string | number>): string {
  let s = text[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** 데이터 사이의 참조(자극 id, 텍스트 키, 프로필, 스폰 등)가 모두 존재하는지 검사. 문제 목록을 돌려준다 */
export function crossCheck(cfg: GameConfig): string[] {
  const errors: string[] = [];
  const has = (table: object, key: string) => Object.prototype.hasOwnProperty.call(table, key);
  const needText = (key: string, where: string) => {
    if (!has(cfg.text, key)) errors.push(`${where}: 텍스트 키 없음 "${key}" (data/text/ko.json)`);
  };
  const needStim = (id: string, where: string) => {
    if (!has(cfg.stimuli, id)) errors.push(`${where}: 자극 없음 "${id}" (data/stimuli.json)`);
  };
  const tileIds = new Set(cfg.tiles.map((d) => d.id));
  const w = cfg.world;
  if (!tileIds.has(w.base)) errors.push(`world.base: 타일 없음 "${w.base}"`);
  w.ops.forEach((op, i) => {
    for (const id of op.op === 'room' ? [op.floor, op.wall] : [op.tile]) {
      if (!tileIds.has(id)) errors.push(`world.ops[${i}]: 타일 없음 "${id}"`);
    }
  });
  for (const a of w.areas) {
    needText(a.labelKey, `area ${a.id}`);
    if (a.stimulus) needStim(a.stimulus.id, `area ${a.id}`);
  }
  for (const it of w.interactables) {
    needText(it.labelKey, `interactable ${it.id}`);
    if (it.speech && !has(cfg.speeches, it.speech)) errors.push(`interactable ${it.id}: 발화 없음 "${it.speech}"`);
    if (it.monologue && !has(cfg.monologue, it.monologue)) errors.push(`interactable ${it.id}: 독백 없음 "${it.monologue}"`);
    if (it.kind === 'shop' && !(it.shop && has(cfg.items.shops, it.shop))) errors.push(`interactable ${it.id}: 상점 없음 "${it.shop ?? ''}" (data/items.json)`);
    if (it.kind === 'chore' && !(it.chore && has(cfg.chores, it.chore))) errors.push(`interactable ${it.id}: 생활 행동 없음 "${it.chore ?? ''}" (data/chores.json)`);
  }
  const itemIds = new Set(cfg.items.consumables.map((c) => c.id));
  for (const c of cfg.items.consumables) {
    needText(c.nameKey, `item ${c.id}`);
    needText(c.useKey, `item ${c.id}`);
  }
  for (const [id, ch] of Object.entries(cfg.chores)) needText(ch.toastKey, `chore ${id}`);
  for (const g of cfg.items.gear) {
    needText(g.nameKey, `gear ${g.id}`);
    needText(`${g.nameKey}.desc`, `gear ${g.id}`);
  }
  for (const [id, shop] of Object.entries(cfg.items.shops)) {
    needText(shop.titleKey, `shop ${id}`);
    for (const s of shop.stock) if (!itemIds.has(s.item) && !cfg.items.gear.some((g) => g.id === s.item)) errors.push(`shop ${id}: 아이템 없음 "${s.item}"`);
  }
  const portalIds = new Set(w.portals.map((p) => p.id));
  for (const p of w.portals) {
    needText(p.labelKey, `portal ${p.id}`);
    if (!portalIds.has(p.to)) errors.push(`portal ${p.id}: 연결 대상 없음 "${p.to}"`);
  }
  for (const l of w.labels) needText(l.textKey, 'label');
  for (const [id, p] of Object.entries(cfg.npcProfiles)) {
    needText(p.displayTagKey, `npcProfile ${id}`);
    needStim(p.encounterStimulus, `npcProfile ${id}`);
    if (!has(cfg.dialoguePools, p.dialogue)) errors.push(`npcProfile ${id}: 대사 풀 없음 "${p.dialogue}" (data/dialogue/)`);
  }
  for (const [id, s] of Object.entries(cfg.speeches)) {
    needStim(s.stimulus, `speech ${id}`);
    needText(s.introKey, `speech ${id}`);
    if (s.grant && !cfg.items.consumables.some((c) => c.id === s.grant!.item)) errors.push(`speech ${id}: 아이템 없음 "${s.grant.item}"`);
  }
  for (const [id, c] of Object.entries(cfg.life.contacts)) {
    needText(c.nameKey, `contact ${id}`);
    needStim(c.answerStimulus, `contact ${id}`);
    if (c.escalation) needStim(c.escalation, `contact ${id} escalation`);
  }
  for (const d of cfg.days) {
    const where = `day ${d.id}`;
    for (const k of [d.weekdayKey, d.titleKey, d.introKey]) needText(k, where);
    if (!has(w.spawns, d.spawn)) errors.push(`${where}: 스폰 없음 "${d.spawn}"`);
    const objIds = new Set(d.objectives.map((o) => o.id));
    for (const o of d.objectives) {
      needText(o.textKey, `${where} objective ${o.id}`);
      for (const r of o.requires ?? []) if (!objIds.has(r)) errors.push(`${where} objective ${o.id}: requires 대상 없음 "${r}"`);
      if (o.lateStimulus) needStim(o.lateStimulus, `${where} objective ${o.id}`);
      if (o.marker && !w.interactables.some((i) => i.id === o.marker) && !w.areas.some((a) => a.id === o.marker)) {
        errors.push(`${where} objective ${o.id}: marker 대상 없음 "${o.marker}"`);
      }
    }
    if (!d.objectives.some((o) => o.endsDay)) errors.push(`${where}: endsDay 목표가 없습니다`);
    for (const a of d.areaStimuli ?? []) {
      if (!w.areas.some((x) => x.id === a.area)) errors.push(`${where} areaStimuli: 영역 없음 "${a.area}"`);
      needStim(a.id, `${where} areaStimuli`);
    }
    checkPhone(d.phone, where);
    checkNpcs(d.npcs, where);
    checkBlocked(d.blocked ?? [], where);
  }
  const dayIds = new Set(cfg.days.map((d) => d.id));
  const happeningIds = new Set<string>();
  for (const h of cfg.happenings.list) {
    const where = `happening ${h.id}`;
    if (happeningIds.has(h.id)) errors.push(`${where}: id 중복`);
    happeningIds.add(h.id);
    if (h.introKey) needText(h.introKey, where);
    for (const id of h.days ?? []) if (!dayIds.has(id)) errors.push(`${where}: 하루 없음 "${id}" (data/campaign.json)`);
    for (const a of h.areaStimuli ?? []) {
      if (!w.areas.some((x) => x.id === a.area)) errors.push(`${where} areaStimuli: 영역 없음 "${a.area}"`);
      needStim(a.id, `${where} areaStimuli`);
    }
    for (const l of h.crowdLanes ?? []) if (!w.areas.some((x) => x.id === l.zone)) errors.push(`${where} crowdLane ${l.id}: 영역 없음 "${l.zone}"`);
    checkPhone(h.phone ?? [], where);
    checkNpcs(h.npcs ?? [], where);
    checkBlocked(h.blocked ?? [], where);
    for (const id of h.removeNpcs ?? []) {
      if (!cfg.days.some((d) => (!h.days || h.days.includes(d.id)) && d.npcs.some((n) => n.id === id))) errors.push(`${where} removeNpcs: 어느 날에도 없는 NPC "${id}"`);
    }
    // 사건 NPC id가 그 사건이 일어날 수 있는 날의 NPC와 겹치면 조용히 빠지므로 알려 준다
    for (const d of cfg.days) {
      if (h.days && !h.days.includes(d.id)) continue;
      for (const n of h.npcs ?? []) if (d.npcs.some((x) => x.id === n.id)) errors.push(`${where} npc ${n.id}: ${d.id}의 NPC id와 겹침`);
    }
  }
  function checkPhone(list: DayDef['phone'], where: string): void {
    for (const p of list) {
      if (!has(cfg.life.contacts, p.contact)) errors.push(`${where} phone: 연락처 없음 "${p.contact}"`);
      needText(p.textKey, `${where} phone`);
      for (const k of p.textKeys ?? []) needText(k, `${where} phone`);
    }
  }
  function checkNpcs(list: DayDef['npcs'], where: string): void {
    for (const n of list) {
      if (!has(cfg.npcProfiles, n.profile)) errors.push(`${where} npc ${n.id}: 프로필 없음 "${n.profile}"`);
      for (const o of [n, ...(n.alt ?? [])]) {
        if (!has(w.spawns, o.at)) errors.push(`${where} npc ${n.id}: 스폰 없음 "${o.at}"`);
        if (o.path && !has(w.paths, o.path)) errors.push(`${where} npc ${n.id}: 경로 없음 "${o.path}"`);
      }
    }
  }
  function checkBlocked(list: NonNullable<DayDef['blocked']>, where: string): void {
    for (const b of list) {
      if (!w.interactables.some((i) => i.id === b.interactable)) errors.push(`${where} blocked: 상호작용 없음 "${b.interactable}"`);
      needText(b.toastKey, `${where} blocked`);
    }
  }
  for (const tr of cfg.monologueTriggers) {
    if (!has(cfg.monologue, tr.key)) errors.push(`monologue trigger: 문구 없음 "${tr.key}" (data/monologue/ko.csv)`);
    if (tr.when.npcProfile && !has(cfg.npcProfiles, tr.when.npcProfile)) errors.push(`monologue trigger ${tr.key}: 프로필 없음 "${tr.when.npcProfile}"`);
    if (tr.when.area && !w.areas.some((a) => a.id === tr.when.area)) errors.push(`monologue trigger ${tr.key}: 영역 없음 "${tr.when.area}"`);
  }
  return errors;
}
