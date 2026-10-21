import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../src/core/FixedStepper';

describe('FixedStepper', () => {
  it('60Hz에서 1초를 넣으면 60스텝', () => {
    const s = new FixedStepper(60, 2);
    expect(s.advance(1).steps).toBe(60);
  });

  it('스텝보다 짧은 프레임은 누적된다', () => {
    const s = new FixedStepper(60);
    expect(s.advance(0.01).steps).toBe(0);
    const r = s.advance(0.01);
    expect(r.steps).toBe(1);
    expect(r.alpha).toBeGreaterThan(0);
    expect(r.alpha).toBeLessThan(1);
  });

  it('긴 공백은 maxFrameSec로 잘라 스텝 폭주를 막는다', () => {
    const s = new FixedStepper(60, 0.25);
    expect(s.advance(10).steps).toBe(15);
  });

  it('음수 시간은 무시', () => {
    const s = new FixedStepper(60);
    expect(s.advance(-1).steps).toBe(0);
  });
});
