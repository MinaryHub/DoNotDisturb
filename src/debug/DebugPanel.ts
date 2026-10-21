import GUI from 'lil-gui';
import Stats from 'stats.js';
import type * as THREE from 'three';
import { OVERLAY_LAYERS, type DebugOverlay, type OverlayLayer } from './DebugOverlay';
import type { Level } from '../world/LevelLoader';

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

  toggle(): void {
    const hidden = this.gui._hidden;
    this.gui.show(hidden);
    this.stats.dom.style.display = hidden ? '' : 'none';
    this.logEl.style.display = hidden ? '' : 'none';
  }
}
