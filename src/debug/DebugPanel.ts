import GUI from 'lil-gui';
import Stats from 'stats.js';
import type * as THREE from 'three';
import { OVERLAY_LAYERS, type DebugOverlay, type OverlayLayer } from './DebugOverlay';
import type { Level } from '../world/LevelLoader';
import type { StageSession } from '../gameplay/StageSession';

const LAYER_LABELS: Record<OverlayLayer, string> = {
  colliders: 'COL_ 충돌체',
  los: 'LOS_ 시선 차단',
  volumes: 'TRG/SAFE/HIDE/ZONE 볼륨',
  spawns: 'SPAWN_ 시작 위치',
  paths: 'PATH_ 순찰 경로',
  navmesh: '내비메시',
  labels: '이름표',
};

export interface DebugPanelActions {
  reloadLevel(): void;
  loadLevel(path: string): void;
  respawn(): void;
  toggleNoclip(): void;
}

/** lil-gui 디버그 패널 + stats.js + 화면 이벤트 로그 */
export class DebugPanel {
  readonly gui = new GUI({ title: '디버그 (F1)' });
  private readonly stats = new Stats();
  private readonly logEl: HTMLDivElement;
  private readonly perf = { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };
  private readonly levelInfo = { path: '', errors: 0, warnings: 0, volumes: 0, colliders: 0, navmesh: '없음' };
  private readonly cameraInfo = { position: '' };

  constructor(overlay: DebugOverlay, actions: DebugPanelActions, initialLevel: string) {
    this.stats.showPanel(0);
    this.stats.dom.style.cssText = 'position:fixed;left:0;top:0;z-index:20;';
    document.body.appendChild(this.stats.dom);

    this.logEl = document.createElement('div');
    this.logEl.className = 'debug-log';
    document.body.appendChild(this.logEl);

    const overlayFolder = this.gui.addFolder('오버레이');
    const layerState = Object.fromEntries(OVERLAY_LAYERS.map((l) => [l, true])) as Record<OverlayLayer, boolean>;
    for (const layer of OVERLAY_LAYERS) {
      overlayFolder
        .add(layerState, layer)
        .name(LAYER_LABELS[layer])
        .onChange((v: boolean) => overlay.setLayerVisible(layer, v));
    }

    const levelFolder = this.gui.addFolder('레벨');
    this.levelInfo.path = initialLevel;
    levelFolder
      .add(this.levelInfo, 'path')
      .name('경로 (assets/kreate/)')
      .onFinishChange((v: string) => actions.loadLevel(v));
    levelFolder.add(actions, 'reloadLevel').name('다시 불러오기 (F5)');
    levelFolder.add(actions, 'respawn').name('SPAWN_player로 이동');
    levelFolder.add(actions, 'toggleNoclip').name('자유 비행 카메라 (F2)');
    levelFolder.add(this.levelInfo, 'errors').name('오류').disable().listen();
    levelFolder.add(this.levelInfo, 'warnings').name('경고').disable().listen();
    levelFolder.add(this.levelInfo, 'volumes').name('볼륨 수').disable().listen();
    levelFolder.add(this.levelInfo, 'colliders').name('콜라이더 수').disable().listen();
    levelFolder.add(this.levelInfo, 'navmesh').name('내비메시').disable().listen();

    const perfFolder = this.gui.addFolder('성능');
    perfFolder.add(this.perf, 'drawCalls').name('드로우콜').disable().listen();
    perfFolder.add(this.perf, 'triangles').name('삼각형').disable().listen();
    perfFolder.add(this.perf, 'geometries').name('지오메트리').disable().listen();
    perfFolder.add(this.perf, 'textures').name('텍스처').disable().listen();

    this.gui.addFolder('카메라').add(this.cameraInfo, 'position').name('위치').disable().listen();
  }

  private simFolder: GUI | null = null;
  private readonly simInfo = {
    battery: 0,
    stress: 0,
    tier: '',
    inHome: false,
    earphones: false,
    npc: '',
    notice: 0,
    elevator: '',
    outcome: '',
  };

  /** 시뮬레이션 수치 (디버그 전용 HUD) 와 테스트용 조작 */
  bindSession(session: StageSession, actions: { emit(stimulusId: string): void; setBattery(v: number): void }): void {
    this.simFolder?.destroy();
    const f = this.gui.addFolder('시뮬레이션');
    this.simFolder = f;
    f.add(this.simInfo, 'battery', 0, 100).name('배터리').disable().listen();
    f.add(this.simInfo, 'stress', 0, 100).name('스트레스').disable().listen();
    f.add(this.simInfo, 'tier').name('구간').disable().listen();
    f.add(this.simInfo, 'inHome').name('집 안').disable().listen();
    f.add(this.simInfo, 'earphones').name('이어폰').disable().listen();
    f.add(this.simInfo, 'npc').name('이웃 상태').disable().listen();
    f.add(this.simInfo, 'notice', 0, 1).name('알아챔').disable().listen();
    f.add(this.simInfo, 'elevator').name('엘리베이터').disable().listen();
    f.add(this.simInfo, 'outcome').name('결과').disable().listen();
    const tools = {
      battery50: () => actions.setBattery(50),
      battery30: () => actions.setBattery(30),
      battery10: () => actions.setBattery(10),
      voiceCall: () => actions.emit('voiceCall'),
      textMessage: () => actions.emit('textMessage'),
    };
    f.add(tools, 'battery50').name('배터리 50 (Tired)');
    f.add(tools, 'battery30').name('배터리 30 (Danger)');
    f.add(tools, 'battery10').name('배터리 10 (Critical)');
    f.add(tools, 'voiceCall').name('자극: 음성 통화');
    f.add(tools, 'textMessage').name('자극: 문자');
    this.updateSim(session);
  }

  updateSim(session: StageSession): void {
    const snap = session.sim.snapshot();
    const npc = session.npcs[0];
    Object.assign(this.simInfo, {
      battery: +snap.battery.toFixed(1),
      stress: +snap.stress.toFixed(1),
      tier: snap.tier,
      inHome: session.inHome,
      earphones: session.skills.earphones,
      npc: npc?.state ?? '-',
      notice: npc ? +npc.notice.toFixed(2) : 0,
      elevator: session.elevator ? `${session.elevator.floor} / ${session.elevator.phase}` : '-',
      outcome: session.outcome,
    });
  }

  setLevel(level: Level): void {
    this.levelInfo.errors = level.warnings.filter((w) => w.level === 'error').length;
    this.levelInfo.warnings = level.warnings.filter((w) => w.level === 'warning').length;
    this.levelInfo.volumes = level.volumes.length;
    this.levelInfo.colliders = level.colliders.length;
    this.levelInfo.navmesh = level.navigation ? '생성됨' : '없음';
  }

  log(message: string, kind: 'info' | 'event' | 'error' = 'info'): void {
    const line = document.createElement('div');
    line.className = `debug-log__line debug-log__line--${kind}`;
    line.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
    this.logEl.prepend(line);
    while (this.logEl.childElementCount > 8) this.logEl.lastElementChild!.remove();
  }

  beginFrame(): void {
    this.stats.begin();
  }

  endFrame(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    this.stats.end();
    this.perf.drawCalls = renderer.info.render.calls;
    this.perf.triangles = renderer.info.render.triangles;
    this.perf.geometries = renderer.info.memory.geometries;
    this.perf.textures = renderer.info.memory.textures;
    const p = camera.position;
    this.cameraInfo.position = `${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;
  }

  get visible(): boolean {
    return !this.gui._hidden;
  }

  toggle(): void {
    const hidden = this.gui._hidden;
    this.gui.show(hidden);
    this.stats.dom.style.display = hidden ? '' : 'none';
    this.logEl.style.display = hidden ? '' : 'none';
  }
}
