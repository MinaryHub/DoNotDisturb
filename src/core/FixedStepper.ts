/**
 * 고정 시간 스텝 누산기. 렌더 프레임 간격(가변)을 받아
 * 이번 프레임에 몇 번의 시뮬레이션 스텝을 돌릴지와 보간 계수를 계산한다.
 * DOM에 의존하지 않으므로 단위 테스트 대상.
 */
export class FixedStepper {
  readonly stepSec: number;
  private readonly maxFrameSec: number;
  private accumulator = 0;

  /**
   * @param hz 시뮬레이션 주파수 (예: 60)
   * @param maxFrameSec 한 프레임에 소화할 최대 시간. 탭 전환 등으로 긴 공백이 생겨도 스텝 폭주를 막는다.
   */
  constructor(hz: number, maxFrameSec = 0.25) {
    if (!(hz > 0)) throw new Error(`FixedStepper: hz는 양수여야 합니다 (${hz})`);
    this.stepSec = 1 / hz;
    this.maxFrameSec = maxFrameSec;
  }

  /** 경과 시간을 넣고, 실행할 스텝 수와 렌더 보간 계수(0~1)를 돌려준다. */
  advance(frameSec: number): { steps: number; alpha: number } {
    this.accumulator += Math.min(Math.max(frameSec, 0), this.maxFrameSec);
    let steps = 0;
    // 부동소수 오차로 마지막 스텝이 누락되지 않도록 작은 여유를 둔다
    while (this.accumulator + 1e-9 >= this.stepSec) {
      this.accumulator -= this.stepSec;
      steps++;
    }
    if (this.accumulator < 0) this.accumulator = 0;
    return { steps, alpha: this.accumulator / this.stepSec };
  }

  reset(): void {
    this.accumulator = 0;
  }
}
