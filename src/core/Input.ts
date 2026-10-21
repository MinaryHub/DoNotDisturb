import type { InputAction, InputConfig } from './configSchemas';

/** 키보드·마우스 입력 상태. 액션 이름으로 조회하며 키 매핑은 data/input.json에서 온다. */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();
  private mouseDx = 0;
  private mouseDy = 0;

  constructor(
    private readonly bindings: InputConfig,
    private readonly target: HTMLElement,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('click', this.onClick);
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.target;
  }

  isDown(action: InputAction): boolean {
    return this.bindings[action].some((code) => this.down.has(code));
  }

  /** 이번 프레임에 새로 눌렸는지 (endFrame 호출 전까지 유지) */
  wasPressed(action: InputAction): boolean {
    return this.bindings[action].some((code) => this.pressedThisFrame.has(code));
  }

  /** 누적된 마우스 이동량을 꺼내고 0으로 초기화 */
  consumeMouseDelta(): { dx: number; dy: number } {
    const delta = { dx: this.mouseDx, dy: this.mouseDy };
    this.mouseDx = 0;
    this.mouseDy = 0;
    return delta;
  }

  endFrame(): void {
    this.pressedThisFrame.clear();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.target.removeEventListener('click', this.onClick);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (!e.repeat) this.pressedThisFrame.add(e.code);
    this.down.add(e.code);
    // F1·F5 등 브라우저 기본 동작과 겹치는 바인딩은 막는다
    if (e.code.startsWith('F') && e.code.length <= 3) e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.down.clear();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.mouseDx += e.movementX;
    this.mouseDy += e.movementY;
  };

  private readonly onClick = (): void => {
    if (!this.pointerLocked) void this.target.requestPointerLock();
  };
}
