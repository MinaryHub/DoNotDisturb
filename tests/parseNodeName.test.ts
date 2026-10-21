import { describe, expect, it } from 'vitest';
import { coerceValue, parseNodeName, parsePathId, stripDuplicateSuffix } from '../src/world/parseNodeName';

describe('parseNodeName — 접두어', () => {
  it('접두어 없는 이름은 VIS', () => {
    const p = parseNodeName('Sofa');
    expect(p.prefix).toBe('VIS');
    expect(p.id).toBe('Sofa');
    expect(p.issues).toEqual([]);
  });

  it.each([
    ['COL_wall', 'COL', 'wall'],
    ['NAV_floor_1F', 'NAV', 'floor_1F'],
    ['SPAWN_player', 'SPAWN', 'player'],
    ['SPAWN_npc_neighbor', 'SPAWN', 'npc_neighbor'],
    ['VIS_door', 'VIS', 'door'],
  ])('%s → %s / %s', (name, prefix, id) => {
    const p = parseNodeName(name);
    expect(p.prefix).toBe(prefix);
    expect(p.id).toBe(id);
  });

  it('소문자 접두어는 경고와 함께 인식', () => {
    const p = parseNodeName('col_wall');
    expect(p.prefix).toBe('COL');
    expect(p.issues.map((i) => i.code)).toContain('prefix-case');
  });

  it('오타 접두어는 경고하고 VIS로 처리', () => {
    const p = parseNodeName('SPWAN_player');
    expect(p.prefix).toBe('VIS');
    expect(p.issues[0]?.code).toBe('prefix-typo');
    expect(p.issues[0]?.message).toContain('SPAWN_');
  });

  it('관계없는 대문자 단어는 오타로 보지 않음', () => {
    expect(parseNodeName('LAMP_01').issues).toEqual([]);
  });

  it('접두어 뒤 식별자가 없으면 오류', () => {
    expect(parseNodeName('COL_').issues.map((i) => i.code)).toContain('empty-id');
  });
});

describe('parseNodeName — 속성', () => {
  it('이름 속성 __key=value 를 해석', () => {
    const p = parseNodeName('TRG_phone__eventId=landlordCall__once=true');
    expect(p.prefix).toBe('TRG');
    expect(p.id).toBe('phone');
    expect(p.props).toEqual({ eventId: 'landlordCall', once: true });
    expect(p.issues).toEqual([]);
  });

  it('숫자 값 변환', () => {
    const p = parseNodeName('ZONE_lobby__stimulus=crowd__intensity=0.6');
    expect(p.props).toEqual({ stimulus: 'crowd', intensity: 0.6 });
  });

  it('extras.dnd 가 이름 속성보다 우선', () => {
    const p = parseNodeName('TRG_phone__eventId=a', { dnd: { eventId: 'b' } });
    expect(p.props).toMatchObject({ eventId: 'b' });
    expect(p.issues.map((i) => i.code)).toContain('property-conflict');
  });

  it('extras만으로도 속성 지정 가능', () => {
    const p = parseNodeName('TRG_phone', { dnd: { eventId: 'landlordCall', once: true } });
    expect(p.props).toEqual({ eventId: 'landlordCall', once: true });
  });

  it('필수 속성 누락은 스키마 오류, props는 null', () => {
    const p = parseNodeName('TRG_phone');
    expect(p.props).toBeNull();
    expect(p.issues.some((i) => i.level === 'error' && i.code === 'schema')).toBe(true);
  });

  it('범위를 벗어난 값은 스키마 오류', () => {
    const p = parseNodeName('ZONE_a__stimulus=crowd__intensity=3');
    expect(p.props).toBeNull();
  });

  it('알 수 없는 속성은 경고만', () => {
    const p = parseNodeName('COL_wall__shpae=box');
    expect(p.props).not.toBeNull();
    expect(p.issues.map((i) => i.code)).toEqual(['unknown-property']);
  });

  it('숫자로 변환된 eventId도 문자열로 받아들인다', () => {
    expect(parseNodeName('TRG_a__eventId=123').props).toEqual({ eventId: '123' });
  });

  it('= 없는 속성 조각은 경고', () => {
    expect(parseNodeName('COL_wall__box').issues.map((i) => i.code)).toContain('bad-property');
  });
});

describe('보조 함수', () => {
  it('중복 번호 접미어 제거', () => {
    expect(stripDuplicateSuffix('COL_wall.001')).toBe('COL_wall');
    expect(stripDuplicateSuffix('ZONE_a__intensity=0.6.002')).toBe('ZONE_a__intensity=0.6');
    // 숫자 값의 소수부로 볼 수 있으면 남긴다
    expect(stripDuplicateSuffix('ZONE_a__intensity=0.600')).toBe('ZONE_a__intensity=0.600');
  });

  it('PATH 번호 해석', () => {
    expect(parsePathId('neighbor_01')).toEqual({ npcId: 'neighbor', index: 1 });
    expect(parsePathId('boss_kim_12')).toEqual({ npcId: 'boss_kim', index: 12 });
    expect(parsePathId('neighbor')).toBeNull();
    expect(parseNodeName('PATH_neighbor').issues.map((i) => i.code)).toContain('path-index');
  });

  it('값 변환', () => {
    expect(coerceValue('true')).toBe(true);
    expect(coerceValue('-2.5')).toBe(-2.5);
    expect(coerceValue('crowd')).toBe('crowd');
    expect(coerceValue('1e3')).toBe('1e3');
  });
});
