# TypeScript → GDScript 이식 규칙 (Godot 4.5)

웹 판(`src/`, TypeScript)을 Godot 판(`game/`, GDScript)으로 옮길 때 지키는 규칙. 이미 옮긴 `game/sim/*.gd`가 본보기다.

## 파일·이름
- `src/sim/EnergyModel.ts` → `game/sim/energy_model.gd` (snake_case 파일), 첫 줄 `class_name EnergyModel` + `extends RefCounted`
- Godot 내장 클래스와 이름이 겹치면 바꾼다: `TileMap` → `CityGrid`
- 메서드·변수는 snake_case (`drainPerSec` → `drain_per_sec`), 상수는 UPPER_CASE. 게터는 메서드(`ended()`)나 `var x: T: get:` 속성
- `_set`, `_get`, `_init`, `_ready` 같은 Object 예약 이름을 private 메서드로 쓰지 않는다 (`_set_level`처럼)
- 전역 함수 이름(`load`, `print`, `range`…)과 겹치는 속성 이름은 피한다

## 데이터
- 설정은 `DataLoader.load_config(lang)`이 주는 Dictionary. 키는 JSON 그대로(camelCase): `cfg["balance"]["psyche"]["drain"]`
- JSON 숫자는 모두 float. 정수가 필요하면 `int()`, 개수 비교는 `float()`로 맞춘다
- 선택 필드는 `d.get("key", 기본값)`. 스키마 기본값은 없다(zod `.default` 없음)
- 타입스크립트 객체 리터럴·인터페이스 → Dictionary (키 이름 그대로 camelCase). 예: hit = `{ stimulusId, kind, channel, amount, source }`
- 이벤트는 `{ "type": "...", ... }` Dictionary 배열, `drain_events()`로 꺼낸다
- `undefined`/`null` 대신 빈 문자열 `""`이나 `null`(Variant)을 쓴다. Variant 변수는 `var x: Variant = null`처럼 타입을 적는다 (`var x = null`은 null 타입으로 굳는다)
- 난수는 `Callable`(`func(): return randf()`)로 주입한다 (테스트에서 고정)

## 계층
- `game/sim`, `game/world`, `game/npc`, `game/gameplay`는 노드·씬 없이 RefCounted로 (headless 테스트가 돈다)
- 오류(throw)는 `assert(false, "메시지")`. 테스트는 오류를 잡지 못하니 오류 경로 테스트는 옮기지 않는다

## 테스트
- `game/tests/test_<이름>.gd`, `extends TestCase`, 메서드 `test_*`는 끝에서 `return true`
- 도우미: `ok(cond, msg)`, `eq(a, b, msg)`, `near(a, b, digits)` (vitest toBeCloseTo와 같은 기준), `gt`, `lt`
- 실행: 새 class_name 파일을 만들었으면 먼저 `godot --headless --import`, 그다음 `godot --headless --script res://game/tests/runner.gd [-- 이름 일부]`
- 웹 판 `tests/*.test.ts`의 시험을 같은 이름·같은 기대값으로 옮긴다

## 주석
- 주석은 한국어, 원본 주석을 살린다. 식별자는 영어

## GameSession API 약속 (연출·UI가 이 이름으로 읽는다)
`src/gameplay/GameSession.ts` → `game/gameplay/game_session.gd` (`class_name GameSession`, RefCounted). TS 이름을 snake_case로 바꾸는 것 말고는 그대로 둔다.
- 생성: `GameSession.new(cfg: Dictionary, save: Dictionary = {}, options: Dictionary = {})` (options: seed(int, 없으면 -1)·practiced·vacation·difficulty)
- 진행: `step(dt: float, c: Dictionary)`. Controls는 TS와 같은 camelCase 키의 Dictionary: `move: Vector2`, `aim: Variant`(float 또는 null), `reply: String`(없으면 ""), `menuNav: int`, `useItem`·`note`·`slot: int`(없으면 -1), 나머지 bool. `GameSession.NO_CONTROLS` 상수와 `GameSession.controls(over: Dictionary)` 도우미(NO_CONTROLS에 덮기)
- 플레이어: `player`는 `PlayerState`(game_session.gd 안 inner class 또는 game/gameplay/player_state.gd) — `pos: Vector2, facing, moving, running, move_dir: Variant, earphones, phone_pretend, cover, eyes_closed, mask, frozen, winded, hidden, locked_safe: Variant(Dictionary), safe_time, knock_timer, inventory: Dictionary{consumables, gear, clothes, items}, walk_phase, biking`
- 모드: `mode: Dictionary` — `{"kind": "free"}`, `{"kind": "dialogue", "battle": DialogueBattle, "npc": Npc, ...}` 처럼 TS 판 Mode의 필드를 그대로 키로. `qte: Variant`(Dictionary 또는 null)
- 속성: `world, sim, phone, monologue, reputation, bus_route, crowd, clock, day, happenings, hurry, crowd_level, day_index, objectives, npcs, home_locked, view_target: Variant(Vector2), area: Variant, phone_open, phone_cursor, prompt: Variant({labelKey, at: Vector2}), rehearsed, hobby_done, reports, fx: Array, story, leave_used, on_leave, buffs, item_break: Variant, vacation, vacation_day_count, perks, difficulty, week_condition, achieved, quiet_found, quiet_here`
- 집합(Set)은 `Dictionary`(키 → true), Map은 Dictionary
- TS 게터는 메서드로: `raining()`, `sanctuary()`, `at_home()`, `snapshot()`(SimSnapshot Dictionary), `can_take_leave()`
- 메서드: `active_npcs()`, `buses_on_road()`, `gaze_count()`, `bag_slots()`, `bag_count()`, `uses_left(id)`, `start_dialogue(npc, grabbed)`, `start_day(index)`, `end_day()`, `toast(key, vars)`, `life_why_text(change)`, `player_percept()` 등 TS의 public 메서드는 모두 같은 뜻의 snake_case로
- fx 이벤트·토스트는 TS와 같은 모양의 Dictionary (`{"type": "toast", "key": ..., "vars": {...}}`)

## headless 실행 주의
- 테스트·도구는 언제나 `< /dev/null`을 붙여 돌린다: 스크립트 오류가 나면 headless Godot가 디버거 입력을 기다리며 멈춘다
- `tools/world-fingerprint.ts`(웹 판)와 `game/tests/fixtures/world_fingerprint.json`: 두 판이 같은 도시를 만드는지 비교한다. 월드 데이터나 생성 규칙을 바꾸면 다시 만든다 (웹 판을 지우기 전까지)
