import { describe, expect, it } from 'vitest';
import worldJson from '../data/world.json';
import inputJson from '../data/input.json';
import balanceJson from '../data/balance.json';
import budgetJson from '../data/assetBudget.json';
import {
  assetBudgetSchema,
  balanceConfigSchema,
  inputConfigSchema,
  parseConfig,
  worldConfigSchema,
} from '../src/core/configSchemas';

describe('/data 설정 파일', () => {
  it.each([
    ['world.json', worldConfigSchema, worldJson],
    ['input.json', inputConfigSchema, inputJson],
    ['balance.json', balanceConfigSchema, balanceJson],
    ['assetBudget.json', assetBudgetSchema, budgetJson],
  ] as const)('%s 가 스키마를 통과', (name, schema, data) => {
    expect(() => parseConfig(schema, data, name)).not.toThrow();
  });

  it('잘못된 값은 파일명과 경로를 포함한 오류', () => {
    expect(() => parseConfig(worldConfigSchema, { ...worldJson, simulationHz: -1 }, 'world.json')).toThrow(
      /world\.json.*simulationHz/,
    );
  });
});
