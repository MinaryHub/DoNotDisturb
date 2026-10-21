import * as THREE from 'three';
import './style.css';
import { loadConfig, loadStage } from './core/config';
import { GameLoop } from './core/GameLoop';
import { Input } from './core/Input';
import { NoclipCamera } from './gameplay/NoclipCamera';
import { StageSession, type SessionInput } from './gameplay/StageSession';
import { initPhysics } from './world/physics';
import { initNavigation } from './world/navigation';
import type { VolumeDef } from './world/LevelLoader';
import { DebugOverlay } from './debug/DebugOverlay';
import { DebugPanel } from './debug/DebugPanel';
import { watchKreateAssets } from './debug/hotReload';
import { PresentationState } from './presentation/PresentationState';
import { PostFX } from './presentation/PostFX';
import { CameraRig } from './presentation/CameraRig';
import { AudioDirector } from './presentation/AudioDirector';
import { Hud } from './presentation/ui/Hud';
import { NpcTags } from './presentation/ui/NpcTags';

const ASSET_BASE = '/kreate/';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const params = new URLSearchParams(location.search);
  const stage = loadStage(params.get('stage') ?? 'stage01');
  let levelPath = params.get('level') ?? stage.level;
  // 개발용: ?nolock 이면 마우스 고정 없이도 플레이 (자동화 테스트)
  const noLock = import.meta.env.DEV && params.has('nolock');
  await Promise.all([initPhysics(), initNavigation()]);

  // ───── 렌더링 ─────
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // 톤 매핑은 후처리(ToneMappingEffect)에서 한다

  // 임시 조명 (Kreate 레벨에 조명이 들어오면 그쪽을 사용)
  const light = cfg.world.lighting;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(light.background);
  scene.add(new THREE.AmbientLight(light.ambient.color, light.ambient.intensity));
  scene.add(new THREE.HemisphereLight(light.hemisphere.sky, light.hemisphere.ground, light.hemisphere.intensity));
  const keyLight = new THREE.DirectionalLight(light.key.color, light.key.intensity);
  keyLight.position.fromArray(light.key.position);
  scene.add(keyLight);

  const camera = new THREE.PerspectiveCamera(
    cfg.world.camera.fov,
    window.innerWidth / window.innerHeight,
    cfg.world.camera.near,
    cfg.world.camera.far,
  );
  camera.rotation.order = 'YXZ';
  const noclip = new NoclipCamera(cfg.world, window.innerWidth / window.innerHeight);
  let noclipOn = false;

  // ───── 연출 ─────
  const postfx = new PostFX(renderer, scene, camera, cfg.presentation.postfx);
  const rig = new CameraRig(cfg.presentation.camera, cfg.world.camera.fov);
  const audio = new AudioDirector(cfg.presentation.audio, cfg.skills.earphones);
  const pstate = new PresentationState(cfg.balance);
  const hud = new Hud(cfg.text);
  const tags = new NpcTags(cfg.text);
  const input = new Input(cfg.input, canvas);
  const overlay = new DebugOverlay();
  scene.add(overlay.root);

  let session: StageSession | null = null;
  let loading = false;
  let started = false;

  const panel = new DebugPanel(
    overlay,
    {
      reloadLevel: () => void openSession(levelPath),
      loadLevel: (path) => void openSession(path),
      respawn: () => {
        const spawn = session?.level.spawns.get('player');
        if (spawn) session!.player.placeAt(spawn.position, spawn.yaw);
      },
      toggleNoclip: () => toggleNoclip(),
    },
    levelPath,
  );
  panel.toggle(); // 기본은 숨김, F1로 표시

  function toggleNoclip(): void {
    noclipOn = !noclipOn;
    if (noclipOn) noclip.camera.position.copy(camera.position);
    postfx.setCamera(noclipOn ? noclip.camera : camera);
    panel.log(noclipOn ? '자유 비행 카메라 켜짐 (플레이어 정지)' : '자유 비행 카메라 꺼짐');
  }

  async function openSession(path: string): Promise<void> {
    if (loading) return;
    loading = true;
    try {
      const next = await StageSession.load(cfg, stage, `${ASSET_BASE}${path}?t=${Date.now()}`);
      session?.dispose();
      tags.clear();
      pstate.reset();
      session = next;
      levelPath = path;
      scene.add(session.level.root);
      overlay.build(session.level);
      panel.setLevel(session.level);
      panel.bindSession(session, {
        emit: (id) => session?.sim.bus.emit(id, 'debug'),
        setBattery: (v) => session?.sim.energy.debugSet({ battery: v }),
      });
      session.on('message', ({ key }) => hud.showToast(key));
      session.on('trigger', ({ eventId }) => panel.log(`이벤트: ${eventId}`, 'event'));
      session.on('objective', ({ id }) => panel.log(`목표 완료: ${id}`, 'event'));
      session.on('outcome', ({ outcome }) => {
        panel.log(`결과: ${outcome}`, 'event');
        if (outcome === 'clear') hud.showScreen('clear');
      });
      panel.log(`레벨 로드: ${path}`);
      for (const w of session.level.warnings) {
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

  watchKreateAssets(cfg.world.hotReloadDebounceMs, (path) => {
    if (path !== levelPath) return;
    panel.log(`Kreate 에셋 변경 감지 → ${path} 다시 불러오기`, 'event');
    void openSession(path);
  });

  // 시작·일시정지: 클릭으로 마우스 고정 + 오디오 시작 (브라우저 정책)
  canvas.addEventListener('click', () => audio.resume());
  document.querySelector('.screen')?.addEventListener('click', () => {
    audio.resume();
    started = true;
    void canvas.requestPointerLock();
  });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    postfx.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    noclip.setAspect(camera.aspect);
  });

  // ───── 루프 ─────
  // 눌린 키는 다음 고정 스텝이 처리할 때까지 보관한다.
  // (주사율이 60Hz보다 높으면 고정 스텝이 0번인 렌더 프레임이 있어서, 프레임 단위로 지우면 입력이 사라진다)
  const pending = { interact: false, earphones: false };
  const move = new THREE.Vector2();
  const isLocked = () => input.pointerLocked || noLock;

  const loop = new GameLoop(cfg.world.simulationHz, {
    fixedUpdate(dt) {
      if (!session) return;
      const playing = started && isLocked() && !noclipOn;
      let sessionInput: SessionInput = {
        move: move.set(0, 0),
        run: false,
        interact: false,
        toggleEarphones: false,
        phonePretend: false,
      };
      if (playing) {
        move.set(
          Number(input.isDown('moveRight')) - Number(input.isDown('moveLeft')),
          Number(input.isDown('moveBackward')) - Number(input.isDown('moveForward')),
        );
        sessionInput = {
          move,
          run: input.isDown('sprint'),
          interact: pending.interact,
          toggleEarphones: pending.earphones,
          phonePretend: input.isDown('phonePretend'),
        };
      }
      pending.interact = pending.earphones = false;
      if (noclipOn) noclip.update(dt, input);
      // 시작 전·일시정지 중에는 시간이 흐르지 않는다
      if (started && (isLocked() || session.outcome !== 'playing' || noclipOn)) session.fixedUpdate(dt, sessionInput);
    },

    render(frameDt, alpha) {
      panel.beginFrame();
      if (input.wasPressed('toggleDebug')) panel.toggle();
      if (input.wasPressed('toggleNoclip')) toggleNoclip();
      if (input.wasPressed('reloadLevel')) void openSession(levelPath);

      if (session) {
        const look = noclipOn || !input.pointerLocked ? { dx: 0, dy: 0 } : input.consumeMouseDelta();
        session.frameUpdate(frameDt, alpha, look);
        if (session.outcome !== 'playing' && input.wasPressed('restart')) void openSession(levelPath);

        const snap = session.sim.snapshot();
        pstate.update(frameDt, snap, session.drainSimEvents(), cfg.balance.ambush.shakeSec);
        rig.apply(
          camera,
          {
            eye: session.player.eyePosition(alpha),
            yaw: session.player.yaw,
            pitch: session.player.pitch,
            speed: session.player.horizontalSpeed,
          },
          pstate,
          frameDt,
        );

        // 플레이어가 있는 소음 구역 강도
        let zoneMurmur = 0;
        for (const v of session.sensors.activeVolumes) {
          if (v.kind === 'ZONE') zoneMurmur += (v as VolumeDef<'ZONE'>).props.intensity ?? 1;
        }
        audio.update(frameDt, {
          state: pstate,
          earphones: session.skills.earphones,
          zoneMurmur,
          listener: { position: camera.position, forward: new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion) },
          npcs: session.npcs.map((n) => ({ id: n.id, position: n.model.position, speed: n.moveSpeed })),
          worldMuted: session.outcome !== 'playing',
        });

        // HUD
        const focused = session.interaction.focused;
        hud.setPrompt(focused ? (stage.interactions[focused.props.eventId] ?? null) : null);
        hud.setObjective(session.currentObjective?.textKey ?? null);
        hud.setSkills(session.skills.earphones, session.skills.phonePretend);
        hud.update(frameDt);
        if (session.outcome === 'burnout' && pstate.burnoutTime > cfg.presentation.camera.burnoutSinkSec) hud.showScreen('burnout');
        else if (session.outcome === 'playing') hud.showScreen(!started ? 'start' : isLocked() || noclipOn ? null : 'paused', stage.titleKey);
        tags.update(session.npcs, camera, window.innerWidth, window.innerHeight);

        overlay.root.visible = panel.visible;
        overlay.update(session.sensors.activeVolumes);
        panel.updateSim(session);
      }

      if (noclipOn) noclip.camera.updateMatrixWorld();
      postfx.render(frameDt, pstate, audio.heartbeatBpm);
      panel.endFrame(renderer, noclipOn ? noclip.camera : camera);
      if (input.wasPressed('interact')) pending.interact = true;
      if (input.wasPressed('earphones')) pending.earphones = true;
      input.endFrame();
    },
  });

  hud.showScreen('start', stage.titleKey);
  await openSession(levelPath);
  if (import.meta.env.DEV) {
    // 개발용 디버그 핸들 (자동화 테스트·콘솔 확인)
    Object.assign(window, {
      __dnd: {
        get session() {
          return session;
        },
        start: () => {
          started = true;
        },
      },
    });
  }
  loop.start();
}

main().catch((err: unknown) => {
  console.error(err);
  const pre = document.createElement('pre');
  pre.className = 'fatal';
  pre.textContent = String(err);
  document.body.appendChild(pre);
});
