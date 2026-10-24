import { describe, expect, it } from 'vitest';
import { crossCheck, parseGameConfig } from '../src/core/config';
import { readConfig, readRawConfig } from '../tools/lib/readData';

describe('/data 설정 파일', () => {
  it('모든 파일이 스키마를 통과한다', () => {
    expect(() => readConfig()).not.toThrow();
  });

  it('데이터 간 참조가 모두 존재한다 (자극 id, 텍스트 키, 프로필, 스폰, 경로, 연락처)', () => {
    expect(crossCheck(readConfig())).toEqual([]);
  });

  it('잘못된 값은 파일명과 경로를 포함한 오류', () => {
    const raw = readRawConfig();
    const balance = raw.json['balance.json'] as Record<string, unknown>;
    raw.json['balance.json'] = { ...balance, battery: { ...(balance['battery'] as object), max: -1 } };
    expect(() => parseGameConfig(raw)).toThrow(/balance\.json.*battery\.max/);
  });
});
