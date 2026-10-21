import * as THREE from 'three';
import './style.css';
import { loadConfig } from './core/config';
import { GameLoop } from './core/GameLoop';
import { Input } from './core/Input';
import { NoclipCamera } from './gameplay/NoclipCamera';
import { initPhysics, PhysicsWorld } from './world/physics';
import { initNavigation } from './world/navigation';
import { loadLevel, type Level } from './world/LevelLoader';
import { LevelSensors } from './world/LevelSensors';
import { DebugOverlay } from './debug/DebugOverlay';
import { DebugPanel } from './debug/DebugPanel';
import { watchKreateAssets } from './debug/hotReload';

const ASSET_BASE = '/kreate/';

async function main(): Promise<void> {
  const config = loadConfig();
  await Promise.all([initPhysics(), initNavigation()]);

  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d1f24);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3328, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(5, 10, 4);
  scene.add(sun);

  const input = new Input(config.input, canvas);
  const fp = new NoclipCamera(config.world, window.innerWidth / window.innerHeight);
  const physics = new PhysicsWorld(config.world.physics.gravity);
  const probe = physics.addKinematicProbe(config.world.physics.probeRadius);
  const sensors = new LevelSensors(probe.collider);

  const overlay = new DebugOverlay();
  scene.add(overlay.root);

  const params = new URLSearchParams(location.search);
  let levelPath = params.get('level') ?? config.world.defaultLevel;
  let level: Level | null = null;
  let loading = false;

  const respawn = () => {
    const spawn = level?.spawns.get('player');
    if (spawn) fp.placeAt(spawn.position, spawn.yaw);
  };

  const panel = new DebugPanel(
    overlay,
    {
      reloadLevel: () => void openLevel(levelPath, { keepCamera: true }),
      loadLevel: (path) => void openLevel(path, { keepCamera: false }),
      respawn,
    },
    levelPath,
  );

  sensors.on('trigger', ({ eventId, volume }) => panel.log(`TRG_${volume.id} 발동 → eventId="${eventId}"`, 'event'));
  sensors.on('volumeEnter', ({ volume }) => {
    if (volume.kind !== 'TRG') panel.log(`${volume.kind}_${volume.id} 진입`);
  });
  sensors.on('volumeExit', ({ volume }) => panel.log(`${volume.kind}_${volume.id} 이탈`));

  async function openLevel(path: string, opts: { keepCamera: boolean }): Promise<void> {
    if (loading) return;
    loading = true;
    try {
      // 캐시를 피해서 항상 최신 GLB를 받는다
      const next = await loadLevel(`${ASSET_BASE}${path}?t=${Date.now()}`, { physics, navmesh: config.world.navmesh });
      level?.dispose();
      sensors.reset();
      level = next;
      levelPath = path;
      scene.add(level.root);
      overlay.build(level);
      panel.setLevel(level);
      if (!opts.keepCamera) respawn();

      panel.log(`레벨 로드: ${path} (볼륨 ${level.volumes.length}, 콜라이더 ${level.colliders.length})`);
      for (const w of level.warnings) {
        const text = `[${w.node}] ${w.message}`;
        if (w.level === 'error') console.error(text);
        else console.warn(text);
        panel.log(text, w.level === 'error' ? 'error' : 'info');
      }
    } catch (err) {
      console.error(err);
      panel.log(`레벨 로드 실패: ${path} — ${(err as Error).message}`, 'error');
    } finally {
      loading = false;
    }
  }

  watchKreateAssets(config.world.hotReloadDebounceMs, (path) => {
    if (path === levelPath) {
      panel.log(`Kreate 에셋 변경 감지 → ${path} 핫 리로드`, 'event');
      void openLevel(path, { keepCamera: true });
    } else {
      panel.log(`Kreate 에셋 변경: ${path}`);
    }
  });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    fp.setAspect(window.innerWidth / window.innerHeight);
  });

  const loop = new GameLoop(config.world.simulationHz, {
    fixedUpdate(dt) {
      fp.update(dt, input);
      // 프로브는 카메라 아래 몸통 높이에 둔다
      const p = fp.camera.position;
      probe.body.setNextKinematicTranslation({ x: p.x, y: p.y - config.world.camera.eyeHeight / 2, z: p.z });
      physics.step(dt, sensors.handleContact);
    },
    render() {
      panel.beginFrame();
      if (input.wasPressed('toggleDebug')) panel.toggle();
      if (input.wasPressed('reloadLevel')) void openLevel(levelPath, { keepCamera: true });
      overlay.highlight(sensors.activeVolumes);
      renderer.render(scene, fp.camera);
      panel.endFrame(renderer, fp.camera);
      input.endFrame();
    },
  });

  await openLevel(levelPath, { keepCamera: false });
  loop.start();
}

main().catch((err: unknown) => {
  console.error(err);
  const pre = document.createElement('pre');
  pre.className = 'fatal';
  pre.textContent = String(err);
  document.body.appendChild(pre);
});
