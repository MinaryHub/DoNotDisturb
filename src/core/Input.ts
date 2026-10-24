import type { InputAction, InputConfig } from './configSchemas';

/** 키보드·마우스 입력 상태. 액션 이름으로 조회하며 키 매핑은 data/input.json에서 온다. */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressedThisFrame = new Set<string>();
  /** 화면 좌표 마우스 위치 (CSS px) */
  mouse: { x: number; y: number } | null = null;
  private mouseIdle = 0;

  constructor(private readonly bindings: InputConfig) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mousemove', this.onMouseMove);
  }

  isDown(action: InputAction): boolean {
    return this.bindings[action].some((code) => this.down.has(code));
  }

  /** 이번 프레임에 새로 눌렸는지 (endFrame 호출 전까지 유지) */
  wasPressed(action: InputAction): boolean {
    return this.bindings[action].some((code) => this.pressedThisFrame.has(code));
  }

  codePressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  /** 마우스를 최근에 움직였는지 (가만히 두면 이동 방향을 바라본다) */
  get mouseActive(): boolean {
    return this.mouse !== null && this.mouseIdle < 2.5;
  }

  endFrame(dt: number): void {
    this.pressedThisFrame.clear();
    this.mouseIdle += dt;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mousemove', this.onMouseMove);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (!e.repeat) this.pressedThisFrame.add(e.code);
    this.down.add(e.code);
    // Tab·Space·F1 등 브라우저 기본 동작과 겹치는 키는 막는다
    if (e.code === 'Tab' || e.code === 'Space' || e.code === 'Backspace' || e.code.startsWith('Arrow') || /^F\d+$/.test(e.code)) e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.down.clear();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    this.mouse = { x: e.clientX, y: e.clientY };
    this.mouseIdle = 0;
  };
}
