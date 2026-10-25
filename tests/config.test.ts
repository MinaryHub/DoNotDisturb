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

  it('영어 텍스트 표는 한국어 표와 키가 같다 (빠진 번역 없음)', () => {
    const raw = readRawConfig();
    const ko = Object.keys(raw.json['text/ko.json'] as object).sort();
    const en = Object.keys(raw.json['text/en.json'] as object).sort();
    expect(en.filter((k) => !ko.includes(k))).toEqual([]);
    expect(ko.filter((k) => !en.includes(k))).toEqual([]);
  });

  it('영어로 불러오면 화면 문구와 발화가 영어', () => {
    const cfg = parseGameConfig(readRawConfig(), 'en');
    expect(cfg.lang).toBe('en');
    expect(cfg.text['hud.energy']).toBe('Energy');
    expect(crossCheck(cfg)).toEqual([]);
    for (const sp of Object.values(cfg.speeches)) expect(sp.chunksEn?.length).toBeGreaterThan(0);
  });

  it('잘못된 값은 파일명과 경로를 포함한 오류', () => {
    const raw = readRawConfig();
    const balance = raw.json['balance.json'] as Record<string, unknown>;
    raw.json['balance.json'] = { ...balance, battery: { ...(balance['battery'] as object), max: -1 } };
    expect(() => parseGameConfig(raw)).toThrow(/balance\.json.*battery\.max/);
  });
});
