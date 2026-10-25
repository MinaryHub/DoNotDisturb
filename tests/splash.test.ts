import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splashSchema } from '../src/core/configSchemas';

// 스플래시: 언어를 고르기 전이라 두 언어 문구가 모두 있어야 한다

describe('스플래시', () => {
  it('한국어·영어 문구가 모두 비어 있지 않다', () => {
    const cfg = splashSchema.parse(JSON.parse(readFileSync(new URL('../data/splash.json', import.meta.url), 'utf8')));
    for (const l of [cfg.langs.ko, cfg.langs.en]) for (const v of Object.values(l)) expect(v.trim()).not.toBe('');
  });
});
