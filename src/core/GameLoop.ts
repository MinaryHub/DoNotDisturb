import { FixedStepper } from './FixedStepper';

export interface GameLoopCallbacks {
  /** 고정 스텝마다 호출 (시뮬레이션·물리) */
  fixedUpdate(dt: number): void;
  /** 렌더 프레임마다 호출. alpha는 고정 스텝 사이 보간 계수 */
  render(frameDt: number, alpha: number): void;
}

/** 고정 시간 스텝 시뮬레이션 + 가변 프레임 렌더링 루프 */
export class GameLoop {
  private readonly stepper: FixedStepper;
  private rafId = 0;
  private lastTime = 0;
  private running = false;

  constructor(hz: number, private readonly callbacks: GameLoopCallbacks) {
    this.stepper = new FixedStepper(hz);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.stepper.reset();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    const frameDt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    const { steps, alpha } = this.stepper.advance(frameDt);
    for (let i = 0; i < steps; i++) this.callbacks.fixedUpdate(this.stepper.stepSec);
    this.callbacks.render(frameDt, alpha);

    this.rafId = requestAnimationFrame(this.tick);
  };
}
