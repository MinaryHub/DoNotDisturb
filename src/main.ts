import './style.css';
import { GameLoop } from './core/GameLoop';
import { Input } from './core/Input';
import { loadConfig } from './core/loadConfig';
import { t, type GameConfig } from './core/config';
import { DebugPanel } from './debug/DebugPanel';
import { GameSession, NO_CONTROLS, type Controls, type SaveState } from './gameplay/GameSession';
import { replies } from './sim/DialogueBattle';
import { AudioDirector } from './presentation/AudioDirector';
import { PresentationState } from './presentation/PresentationState';
import { Renderer } from './presentation/Renderer';
import { loadSettings, saveSettings } from './presentation/Settings';
import { GameUI } from './presentation/ui/GameUI';
import { TouchControls, isTouchDevice } from './presentation/ui/TouchControls';

// 진입점: 설정 로드 → 타이틀 → 고정 스텝(60Hz) 게임 루프 + 가변 프레임 렌더링

// 캠페인 구성(하루 목록)이 바뀌면 버전을 올려 이전 세이브를 버린다
const SAVE_KEY = 'dnd.save.v3';
/** 고정 시간 스텝 시뮬레이션 주파수 (CLAUDE.md 8) */
const SIM_HZ = 60;

function readSave(): SaveState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as SaveState) : null;
  } catch {
    return null;
  }
}

function writeSave(s: SaveState | null): void {
  try {
    if (s) localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    // 저장소를 쓸 수 없으면 이어하기만 안 된다
  }
}

/** 아직 소비되지 않은 눌림(prev)과 새 입력(next)을 합친다 */
function mergePressed(prev: Controls, next: Controls): Controls {
  const out: Controls = { ...next };
  for (const key of Object.keys(prev) as (keyof Controls)[]) {
    const a = prev[key];
    if (typeof a === 'boolean' && a && !next[key]) (out as unknown as Record<string, unknown>)[key] = true;
  }
  out.reply = next.reply ?? prev.reply;
  out.note = next.note ?? prev.note;
  out.slot = next.slot ?? prev.slot;
  out.useItem = next.useItem ?? prev.useItem;
  out.menuNav = next.menuNav || prev.menuNav;
  return out;
}

function boot(): void {
  let cfg: GameConfig;
  try {
    cfg = loadConfig();
  } catch (e) {
    const pre = document.createElement('pre');
    pre.className = 'fatal';
    pre.textContent = String(e instanceof Error ? e.message : e);
    document.body.appendChild(pre);
    throw e;
  }

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const params = new URLSearchParams(location.search);
  const settings = loadSettings();
  const input = new Input(cfg.input);
  const touch = isTouchDevice() ? new TouchControls(cfg, input) : null;
  // 터치 기기는 키보드 단축키 안내를 처음부터 끈다 (설정에서 다시 켤 수 있음)
  if (touch && !localStorage.getItem('dnd.touchInit')) {
    settings.controlsHint = false;
    saveSettings(settings);
    try {
      localStorage.setItem('dnd.touchInit', '1');
    } catch {
      // 무시
    }
  }
  const ui = new GameUI(cfg, settings, saveSettings);
  const audio = new AudioDirector(cfg.presentation.audio, cfg.skills.earphones);
  const ps = new PresentationState(cfg.balance);
  audio.onBeat = () => ps.pulse();
  // 모바일 브라우저는 사용자 터치 안에서만 소리를 켤 수 있다
  window.addEventListener('pointerdown', () => audio.resume());

  let session: GameSession | null = null;
  let renderer: Renderer | null = null;
  let debug: DebugPanel | null = null;
  let screen: 'title' | 'game' = 'title';
  let savedDay = -1;
  const save = readSave();
  ui.showTitle(save ? t(cfg.text, cfg.days[save.dayIndex]?.titleKey ?? '') : null);

  const start = (fresh: boolean) => {
    audio.resume();
    // 씨앗: 같은 요일도 할 때마다 마주치는 사람·사건이 조금씩 다르다 (?seed=N으로 고정 가능)
    const seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : Math.floor(Math.random() * 2 ** 32);
    session = new GameSession(cfg, fresh ? undefined : (readSave() ?? undefined), { seed });
    if (params.has('day')) session.startDay(Math.min(cfg.days.length - 1, Number(params.get('day')) || 0));
    renderer = new Renderer(canvas, cfg, session.world.map);
    renderer.resize();
    ui.setMinimap(renderer.buildMinimap(4));
    debug = new DebugPanel(
      {
        getSession: () => session!,
        jumpToDay: (i) => session!.startDay(i),
        teleportToMarker: () => {
          const tgt = ui.markerTarget(session!);
          if (tgt) {
            const near = session!.world.map.nearestWalkable(Math.floor(tgt.x), Math.floor(tgt.y + 1), 3);
            if (near) Object.assign(session!.player.pos, { x: near.x + 0.5, y: near.y + 0.5 });
          }
        },
      },
      cfg.days.length,
    );
    screen = 'game';
  };

  window.addEventListener('resize', () => renderer?.resize());

  // 한 렌더 프레임 동안 모은 입력 → 첫 고정 스텝에만 '눌림'을 전달
  let pending: Controls | null = null;
  let pendingFresh = false;

  const buildControls = (s: GameSession): Controls => {
    const mode = s.mode.kind;
    const move = { x: 0, y: 0 };
    if (input.isDown('moveLeft')) move.x -= 1;
    if (input.isDown('moveRight')) move.x += 1;
    if (input.isDown('moveUp')) move.y -= 1;
    if (input.isDown('moveDown')) move.y += 1;
    // 터치 조이스틱: 기울인 만큼 걷고, 끝까지 밀면 달린다
    const stick = input.stick;
    let stickRun = false;
    if (stick && (stick.x !== 0 || stick.y !== 0)) {
      move.x = stick.x;
      move.y = stick.y;
      stickRun = Math.hypot(stick.x, stick.y) > 0.95;
    }
    let aim: number | null = null;
    if (input.mouse && input.mouseActive && renderer) {
      const pp = renderer.camera.toScreen(s.player.pos);
      aim = Math.atan2(input.mouse.y - pp.y, input.mouse.x - pp.x);
    }
    const keyed = mode === 'dialogue' || mode === 'work';
    let reply: Controls['reply'] = null;
    if (keyed) {
      (['reply1', 'reply2', 'reply3', 'reply4'] as const).forEach((a, i) => {
        if (input.wasPressed(a)) reply = replies[i]!;
      });
    }
    let note: number | null = null;
    if (mode === 'piano') ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ'].forEach((code, i) => input.codePressed(code) && (note = i));
    let slot: number | null = null;
    if (mode === 'seated') ['Digit1', 'Digit2', 'Digit3'].forEach((code, i) => input.codePressed(code) && (slot = i));
    let useItem: number | null = null;
    if (!keyed) (['useItem1', 'useItem2', 'useItem3', 'useItem4', 'useItem5', 'useItem6', 'useItem7', 'useItem8'] as const).forEach((a, i) => input.wasPressed(a) && (useItem = i));
    const phoneOpen = s.phoneOpen;
    const menuOpen = phoneOpen || mode === 'shop';
    return {
      move: phoneOpen ? { x: 0, y: 0 } : move,
      sprint: input.isDown('sprint') || stickRun,
      aim,
      interactPressed: input.wasPressed('interact'),
      interactHeld: input.isDown('interact'),
      earphonesPressed: input.wasPressed('earphones'),
      phonePretend: input.isDown('phonePretend'),
      cover: input.isDown('coverCheeks'),
      eyesClosed: input.isDown('closeEyes'),
      maskPressed: input.wasPressed('mask'),
      useItem,
      reply,
      smile: input.isDown('smile'),
      spacePressed: input.codePressed('Space'),
      sos: input.wasPressed('sos'),
      confirm: input.wasPressed('confirm'),
      accept: input.wasPressed('accept'),
      decline: input.wasPressed('decline'),
      textInstead: input.wasPressed('textInstead'),
      phoneToggle: input.wasPressed('phone'),
      menuNav: menuOpen ? (input.codePressed('ArrowUp') || input.codePressed('KeyW') ? -1 : input.codePressed('ArrowDown') || input.codePressed('KeyS') ? 1 : 0) : 0,
      phoneReply: menuOpen && input.codePressed('Enter'),
      phoneIgnore: menuOpen && input.codePressed('Backspace'),
      note,
      slot,
      retry: input.codePressed('KeyR'),
      cancel: input.wasPressed('pause'),
    };
  };

  let paused = false;
  const loop = new GameLoop(SIM_HZ, {
    fixedUpdate(dt) {
      if (screen !== 'game' || !session || paused || ui.optionsOpen) return;
      session.step(dt, pending ?? NO_CONTROLS);
      // '눌림'은 첫 스텝에만 전달하고, 이후 스텝에는 '누르고 있음'만 남긴다
      if (pending && pendingFresh) {
        pending = { ...NO_CONTROLS, move: pending.move, sprint: pending.sprint, aim: pending.aim, interactHeld: pending.interactHeld, phonePretend: pending.phonePretend, cover: pending.cover, eyesClosed: pending.eyesClosed, smile: pending.smile };
        pendingFresh = false;
      }
    },
    render(frameDt) {
      touch?.update({ screen, session, optionsOpen: ui.optionsOpen, mapOpen: ui.isMapOpen });
      if (screen === 'title') {
        if (input.wasPressed('confirm')) start(false);
        else if (input.codePressed('KeyN')) {
          writeSave(null);
          start(true);
        }
        if (input.wasPressed('options')) ui.toggleOptions();
        input.endFrame(frameDt);
        return;
      }
      const s = session!;
      debug?.beginFrame();
      if (input.wasPressed('toggleDebug')) debug?.toggle();
      if (input.wasPressed('options')) ui.toggleOptions();
      if (input.wasPressed('toggleHints')) ui.toggleHints();
      if (input.wasPressed('map') && !s.isModal()) ui.toggleMap();
      if (input.wasPressed('pause') && s.mode.kind === 'free') {
        paused = !paused;
        ui.toast(paused ? 'screen.paused' : 'screen.resume');
      }
      // 고정 스텝이 한 번도 돌지 않은 프레임의 눌림은 잃지 않도록 합친다
      const fresh = buildControls(s);
      pending = pending && pendingFresh ? mergePressed(pending, fresh) : fresh;
      pendingFresh = true;
      input.endFrame(frameDt);

      // 진행 저장: 하루가 바뀌면
      if (s.dayIndex !== savedDay && s.mode.kind === 'dayIntro') {
        savedDay = s.dayIndex;
        writeSave(s.saveState());
      }
      const fx = s.drainFx();
      for (const e of fx) {
        if (e.type === 'toast') ui.toast(e.key, e.vars);
        if (e.type === 'rumble') navigator.getGamepads?.()[0]?.vibrationActuator?.playEffect('dual-rumble', { duration: cfg.balance.sweat.rumbleMs, strongMagnitude: 0.6, weakMagnitude: 0.9 }).catch(() => undefined);
      }
      ps.update(frameDt, s, fx);
      audio.update(s, ps, settings);
      renderer!.render(frameDt, s, ps, settings);
      ui.update(frameDt, s, ps, renderer!.camera);
      debug?.update(s);
      debug?.endFrame();
    },
  });
  loop.start();

  // 자동화 테스트·디버그용
  (window as unknown as { dnd: unknown }).dnd = { get session() { return session; }, cfg };
}

boot();
