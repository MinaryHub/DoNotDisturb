import worldJson from '../../data/world.json';
import inputJson from '../../data/input.json';
import balanceJson from '../../data/balance.json';
import {
  balanceConfigSchema,
  inputConfigSchema,
  parseConfig,
  worldConfigSchema,
  type BalanceConfig,
  type InputConfig,
  type WorldConfig,
} from './configSchemas';

export interface GameConfig {
  world: WorldConfig;
  input: InputConfig;
  balance: BalanceConfig;
}

/** /data의 JSON을 zod로 검증해 불러온다. 값이 틀리면 시작 시점에 바로 실패한다. */
export function loadConfig(): GameConfig {
  return {
    world: parseConfig(worldConfigSchema, worldJson, 'data/world.json'),
    input: parseConfig(inputConfigSchema, inputJson, 'data/input.json'),
    balance: parseConfig(balanceConfigSchema, balanceJson, 'data/balance.json'),
  };
}
