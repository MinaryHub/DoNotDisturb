import { describe, expect, it } from 'vitest';
import budgetJson from '../data/assetBudget.json';
import { assetBudgetSchema } from '../src/core/configSchemas';
import { createGreyboxLevel } from '../tools/lib/greybox';
import { GltfBuilder } from '../tools/lib/gltfBuilder';
import { categorize, validateAsset } from '../tools/lib/validateAsset';

const budget = assetBudgetSchema.parse(budgetJson);

function messages(report: ReturnType<typeof validateAsset>, level: 'error' | 'warning') {
  return report.items.filter((i) => i.level === level).map((i) => `${i.node}: ${i.message}`);
}

describe('categorize', () => {
  it.each([
    ['levels/stage01.glb', 'level'],
    ['props/cup.glb', 'prop'],
    ['characters/neighbor.glb', 'npc'],
    ['characters/passerby_crowd.glb', 'crowdNpc'],
    ['fp/hands.glb', 'fpHands'],
    ['misc.glb', 'level'],
  ])('%s → %s', (path, category) => {
    expect(categorize(path, budget)).toBe(category);
  });
});

describe('validateAsset', () => {
  it('그레이박스 테스트 레벨은 오류·경고 없음', () => {
    const report = validateAsset(createGreyboxLevel(), 'levels/test_greybox.glb', budget);
    expect(messages(report, 'error')).toEqual([]);
    expect(messages(report, 'warning')).toEqual([]);
    expect(report.stats.prefixCounts.SPAWN).toBe(2);
  });

  it('SPAWN_player 누락, 접두어 오타, TRG 속성 누락, 메시 없는 볼륨을 잡아낸다', () => {
    const b = new GltfBuilder();
    b.box({ name: 'NAV_floor', size: [4, 0.2, 4], position: [0, -0.1, 0] });
    b.box({ name: 'COL_floor', size: [4, 0.2, 4], position: [0, -0.1, 0] });
    b.box({ name: 'TRIG_phone', size: [1, 1, 1], position: [0, 0.5, 0] });
    b.box({ name: 'TRG_door', size: [1, 1, 1], position: [0, 0.5, 0] });
    b.empty('SAFE_toilet__capacity=1', [0, 0, 0]);
    const report = validateAsset(b.doc, 'levels/bad.glb', budget);
    const errors = messages(report, 'error').join('\n');
    expect(errors).toContain('SPAWN_player');
    expect(errors).toContain('TRG_door');
    expect(errors).toMatch(/SAFE_toilet.*메시/);
    expect(messages(report, 'warning').join('\n')).toMatch(/TRIG_phone.*TRG_/);
  });

  it('SPAWN 중복, PATH 번호 건너뜀을 보고', () => {
    const b = new GltfBuilder();
    b.empty('SPAWN_player', [0, 0, 0]);
    b.empty('SPAWN_player', [1, 0, 0]);
    b.empty('PATH_a_01', [0, 0, 0]);
    b.empty('PATH_a_03', [1, 0, 0]);
    const report = validateAsset(b.doc, 'levels/x.glb', budget);
    expect(messages(report, 'error').join()).toContain('SPAWN_player가 2개');
    expect(messages(report, 'warning').join()).toContain('1 다음에 3');
  });

  it('Z-up으로 누운 NAV 바닥을 감지', () => {
    const b = new GltfBuilder();
    b.empty('SPAWN_player', [0, 0, 0]);
    b.box({ name: 'NAV_floor', size: [10, 10, 0.2], position: [0, 0, 0] });
    b.box({ name: 'COL_floor', size: [10, 10, 0.2], position: [0, 0, 0] });
    const report = validateAsset(b.doc, 'levels/zup.glb', budget);
    expect(messages(report, 'error').join()).toContain('Y-up');
  });

  it('cm 단위로 내보낸 것 같은 레벨 크기를 감지', () => {
    const b = new GltfBuilder();
    b.empty('SPAWN_player', [0, 0, 0]);
    b.box({ name: 'NAV_floor', size: [2000, 20, 2000], position: [0, -10, 0] });
    const report = validateAsset(b.doc, 'levels/cm.glb', budget);
    expect(messages(report, 'error').join()).toContain('단위');
  });

  it('소품 폴리곤 예산 초과', () => {
    const b = new GltfBuilder();
    // 박스 1개 = 12 삼각형 → 200개면 2400 > 2000
    for (let i = 0; i < 200; i++) b.box({ name: `cup_${i}`, size: [0.1, 0.1, 0.1], position: [0, 0.05, 0] });
    const report = validateAsset(b.doc, 'props/cup.glb', budget);
    expect(messages(report, 'warning').join()).toContain('prop 예산');
  });

  it('캐릭터 키와 원점 검사', () => {
    const b = new GltfBuilder();
    b.box({ name: 'BODY', size: [0.5, 170, 0.3], position: [0, 85, 0] });
    const report = validateAsset(b.doc, 'characters/giant.glb', budget);
    expect(messages(report, 'warning').join()).toContain('캐릭터 키');
  });
});
