import worldJson from '../../data/world.json';
import inputJson from '../../data/input.json';
import balanceJson from '../../data/balance.json';
import stimuliJson from '../../data/stimuli.json';
import skillsJson from '../../data/skills.json';
import playerJson from '../../data/player.json';
import npcProfilesJson from '../../data/npcProfiles.json';
import textKoJson from '../../data/text/ko.json';
import {
  balanceConfigSchema,
  inputConfigSchema,
  npcProfilesSchema,
  parseConfig,
  playerConfigSchema,
  skillsConfigSchema,
  stageConfigSchema,
  stimulusTableSchema,
  textTableSchema,
  worldConfigSchema,
  type BalanceConfig,
  type InputConfig,
  type NpcProfile,
  type PlayerConfig,
  type SkillsConfig,
  type StageConfig,
  type StimulusTableConfig,
  type TextTable,
  type WorldConfig,
} from './configSchemas';

export interface GameConfig {
  world: WorldConfig;
  input: InputConfig;
  balance: BalanceConfig;
  stimuli: StimulusTableConfig;
  skills: SkillsConfig;
  player: PlayerConfig;
  npcProfiles: Record<string, NpcProfile>;
  text: TextTable;
}

/** /data의 JSON을 zod로 검증해 불러온다. 값이 틀리면 시작 시점에 바로 실패한다. */
export function loadConfig(): GameConfig {
  return {
    world: parseConfig(worldConfigSchema, worldJson, 'data/world.json'),
    input: parseConfig(inputConfigSchema, inputJson, 'data/input.json'),
    balance: parseConfig(balanceConfigSchema, balanceJson, 'data/balance.json'),
    stimuli: parseConfig(stimulusTableSchema, stimuliJson, 'data/stimuli.json'),
    skills: parseConfig(skillsConfigSchema, skillsJson, 'data/skills.json'),
    player: parseConfig(playerConfigSchema, playerJson, 'data/player.json'),
    npcProfiles: parseConfig(npcProfilesSchema, npcProfilesJson, 'data/npcProfiles.json'),
    text: parseConfig(textTableSchema, textKoJson, 'data/text/ko.json'),
  };
}

const stageFiles = import.meta.glob('../../data/stages/*.json', { eager: true, import: 'default' });

export function loadStage(id: string): StageConfig {
  const entry = Object.entries(stageFiles).find(([path]) => path.endsWith(`/${id}.json`));
  if (!entry) throw new Error(`스테이지 설정이 없습니다: data/stages/${id}.json`);
  return parseConfig(stageConfigSchema, entry[1], `data/stages/${id}.json`);
}

/** 로컬라이제이션 키 조회. 없으면 키를 그대로 보여 누락을 드러낸다 */
export function t(text: TextTable, key: string): string {
  return text[key] ?? key;
}
