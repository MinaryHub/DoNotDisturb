// 접근성 설정 (CLAUDE.md 7 접근성). 시청자 브라우저에만 저장한다.

export interface Settings {
  /** 왜곡 강도 배율 0~1 */
  distortion: number;
  shake: boolean;
  chromatic: boolean;
  flash: boolean;
  master: number;
  heartbeat: number;
  tinnitus: number;
  /** 소리 큐의 시각 대체 표시 (파동·자막) */
  visualCues: boolean;
  /** 숫자 없는 스트레스 게이지 */
  stressGauge: boolean;
  /** 증상별(홍조·편두통·말더듬·진땀) 게이지 */
  symptomGauge: boolean;
  /** 화면 아래 단축키 안내 */
  controlsHint: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  distortion: 1,
  shake: true,
  chromatic: true,
  flash: true,
  master: 0.8,
  heartbeat: 1,
  tinnitus: 1,
  visualCues: true,
  stressGauge: true,
  symptomGauge: true,
  controlsHint: true,
};

const KEY = 'dnd.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // 저장소를 쓸 수 없으면 기본값
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 무시
  }
}
