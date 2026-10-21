import { describe, expect, it } from 'vitest';
import worldJson from '../data/world.json';
import inputJson from '../data/input.json';
import balanceJson from '../data/balance.json';
import budgetJson from '../data/assetBudget.json';
import stimuliJson from '../data/stimuli.json';
import skillsJson from '../data/skills.json';
import playerJson from '../data/player.json';
import npcProfilesJson from '../data/npcProfiles.json';
import stage01Json from '../data/stages/stage01.json';
import textKoJson from '../data/text/ko.json';
import {
  assetBudgetSchema,
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
} from '../src/core/configSchemas';

describe('/data 설정 파일', () => {
  it.each([
    ['world.json', worldConfigSchema, worldJson],
    ['input.json', inputConfigSchema, inputJson],
    ['balance.json', balanceConfigSchema, balanceJson],
    ['assetBudget.json', assetBudgetSchema, budgetJson],
    ['stimuli.json', stimulusTableSchema, stimuliJson],
    ['skills.json', skillsConfigSchema, skillsJson],
    ['player.json', playerConfigSchema, playerJson],
    ['npcProfiles.json', npcProfilesSchema, npcProfilesJson],
    ['stages/stage01.json', stageConfigSchema, stage01Json],
    ['text/ko.json', textTableSchema, textKoJson],
  ] as const)('%s 가 스키마를 통과', (name, schema, data) => {
    expect(() => parseConfig(schema, data, name)).not.toThrow();
  });

  it('데이터 간 참조가 모두 존재한다 (자극 id, 텍스트 키, NPC 프로필)', () => {
    const stimuli = stimulusTableSchema.parse(stimuliJson);
    const profiles = npcProfilesSchema.parse(npcProfilesJson);
    const stage = stageConfigSchema.parse(stage01Json);
    const text = textTableSchema.parse(textKoJson);
    for (const p of Object.values(profiles)) {
      for (const id of [p.encounterStimulus, p.lingerStimulus, p.gazeStimulus]) expect(stimuli).toHaveProperty(id);
      expect(text).toHaveProperty(p.displayTagKey);
    }
    for (const e of Object.values(stage.events)) expect(stimuli).toHaveProperty(e.stimulus);
    for (const key of [stage.titleKey, ...stage.objectives.map((o) => o.textKey), ...Object.values(stage.interactions)]) {
      expect(text).toHaveProperty(key);
    }
    for (const n of stage.npcs) expect(profiles).toHaveProperty(n.profile);
  });

  it('잘못된 값은 파일명과 경로를 포함한 오류', () => {
    expect(() => parseConfig(worldConfigSchema, { ...worldJson, simulationHz: -1 }, 'world.json')).toThrow(
      /world\.json.*simulationHz/,
    );
  });
});
