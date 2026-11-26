class_name GameInput
extends RefCounted

## 키보드·마우스·터치·게임패드 입력 (웹 판 src/core/Input.ts + main.ts의 buildControls).
## data/input.json(키보드 기본값) + PAD_DEFAULTS(게임패드 기본값) 위에 user://input.json(바꾼 키, 누르는 방식)을 덮어
## Godot InputMap 액션을 만들고, 매 렌더 프레임 read_controls()로 GameSession의 Controls 사전(PORTING.md, camelCase 키)을 만든다.
##
## 키 코드는 웹 KeyboardEvent.code 이름("KeyW", "Digit1", "Space")과 게임패드 이름("pad:a", "pad:rt", "pad:up")을 함께 쓴다.
## 누르는 방식: 누르고 있어야 하는 동작(폰 보는 척·미소 유지·볼 감싸기·눈 감기·달리기)은 '한 번 눌러 켜고 끄기'로 바꿀 수 있다
## (접근성). 켜고 끄기는 여기서 '누르고 있음'으로 바꿔 넘기므로 GameSession은 같은 Controls를 받는다.
##
## 쓰는 법 (main):
##   var gi := GameInput.new(cfg["input"])
##   func _unhandled_input(e): gi.handle_event(e)      # GUI(포커스 받은 버튼)가 먹은 키는 오지 않는다
##   func _process(dt):
##       ui.route(gi, session)                        # Esc·지도·메모·설정·일시정지 (UI가 먼저)
##       var c := gi.read_controls(session, player_screen_px)
##       pending = GameInput.merge_pressed(pending, c) ... 첫 고정 스텝 뒤에는 GameInput.held_only(pending)
##       gi.end_frame(dt)

const USER_PATH := "user://input.json"
const REPLIES := ["nod", "agree", "answer", "exit"]
const ITEM_ACTIONS := ["useItem1", "useItem2", "useItem3", "useItem4", "useItem5", "useItem6", "useItem7", "useItem8"]
const PIANO_CODES := ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ"]
## 누르고 있어야 하는 동작 (누르는 방식을 고를 수 있다)
const HOLD_ACTIONS := ["phonePretend", "smile", "coverCheeks", "closeEyes", "sprint"]
## 게임패드 기본값 (Steam PC). 대화 중에는 네 얼굴 버튼이 반응 1~4, 전화가 울리면 A 받기·B 거절·X 문자로 대신
const PAD_DEFAULTS := {
	"sprint": ["pad:rb"], "interact": ["pad:a"], "confirm": ["pad:a"], "pause": ["pad:b"],
	"earphones": ["pad:x"], "phone": ["pad:y"], "phonePretend": ["pad:lb"], "smile": ["pad:rt"],
	"coverCheeks": ["pad:lt"], "closeEyes": ["pad:r3"], "mask": ["pad:down"],
	"accept": ["pad:a"], "decline": ["pad:b"], "textInstead": ["pad:x"],
	"reply1": ["pad:x"], "reply2": ["pad:y"], "reply3": ["pad:b"], "reply4": ["pad:a"], "sos": ["pad:lb"],
	"map": ["pad:back"], "menu": ["pad:start"], "toggleHints": ["pad:l3"], "leave": ["pad:x"],
	"slotPrev": ["pad:left"], "slotNext": ["pad:right"], "slotUse": ["pad:up"],
}
## data/input.json에 없는 동작 (키보드 기본값 없음)
const EXTRA_ACTIONS := {"menu": [], "slotPrev": [], "slotNext": [], "slotUse": []}
## 설정 창의 키 바꾸기 목록 (이 순서로)
const REMAP_ORDER := [
	"moveUp", "moveDown", "moveLeft", "moveRight", "sprint", "interact", "earphones", "phonePretend", "coverCheeks", "closeEyes",
	"mask", "phone", "map", "toggleHints", "useItem1", "useItem2", "useItem3", "useItem4", "slotPrev", "slotNext", "slotUse",
	"reply1", "reply2", "reply3", "reply4", "smile", "sos", "accept", "decline", "textInstead", "confirm", "pause", "menu", "options", "leave",
]
## 상황마다 게임패드 버튼이 맡는 동작 (같은 버튼을 상황에 따라 다르게 쓴다)
const PAD_CONTEXT := {
	"ring": ["accept", "decline", "textInstead", "sprint", "phonePretend", "smile", "coverCheeks", "closeEyes", "sos", "menu", "map"],
	"dialogue": ["reply1", "reply2", "reply3", "reply4", "smile", "sos", "menu"],
	"menu": ["confirm", "phone", "menu"],
	"play": ["sprint", "interact", "confirm", "pause", "earphones", "phone", "phonePretend", "smile", "coverCheeks", "closeEyes", "mask",
		"map", "menu", "toggleHints", "leave", "slotPrev", "slotNext", "slotUse"],
}
## 웹 키 코드 → Godot 물리 키
const NAMED := {
	"Space": KEY_SPACE, "Enter": KEY_ENTER, "NumpadEnter": KEY_KP_ENTER, "Tab": KEY_TAB, "Escape": KEY_ESCAPE,
	"Backspace": KEY_BACKSPACE, "ShiftLeft": KEY_SHIFT, "ShiftRight": KEY_SHIFT, "ControlLeft": KEY_CTRL,
	"ArrowUp": KEY_UP, "ArrowDown": KEY_DOWN, "ArrowLeft": KEY_LEFT, "ArrowRight": KEY_RIGHT,
	"Semicolon": KEY_SEMICOLON, "Comma": KEY_COMMA, "Period": KEY_PERIOD, "Slash": KEY_SLASH, "Minus": KEY_MINUS,
	"Numpad1": KEY_KP_1, "Numpad2": KEY_KP_2,
}
const PAD_BUTTONS := {
	JOY_BUTTON_A: "pad:a", JOY_BUTTON_B: "pad:b", JOY_BUTTON_X: "pad:x", JOY_BUTTON_Y: "pad:y",
	JOY_BUTTON_LEFT_SHOULDER: "pad:lb", JOY_BUTTON_RIGHT_SHOULDER: "pad:rb", JOY_BUTTON_BACK: "pad:back", JOY_BUTTON_START: "pad:start",
	JOY_BUTTON_LEFT_STICK: "pad:l3", JOY_BUTTON_RIGHT_STICK: "pad:r3",
	JOY_BUTTON_DPAD_UP: "pad:up", JOY_BUTTON_DPAD_DOWN: "pad:down", JOY_BUTTON_DPAD_LEFT: "pad:left", JOY_BUTTON_DPAD_RIGHT: "pad:right",
}
const XBOX_GLYPHS := {"pad:a": "A", "pad:b": "B", "pad:x": "X", "pad:y": "Y", "pad:lb": "LB", "pad:rb": "RB", "pad:lt": "LT", "pad:rt": "RT",
	"pad:back": "View", "pad:start": "Menu", "pad:l3": "L3", "pad:r3": "R3", "pad:up": "D↑", "pad:down": "D↓", "pad:left": "D←", "pad:right": "D→"}
const PS_GLYPHS := {"pad:a": "×", "pad:b": "○", "pad:x": "□", "pad:y": "△", "pad:lb": "L1", "pad:rb": "R1", "pad:lt": "L2", "pad:rt": "R2",
	"pad:back": "Share", "pad:start": "Options", "pad:l3": "L3", "pad:r3": "R3", "pad:up": "↑", "pad:down": "↓", "pad:left": "←", "pad:right": "→"}
const KEY_GLYPHS := {"ShiftLeft": "Shift", "ShiftRight": "Shift", "Space": "Space", "Enter": "Enter", "Escape": "Esc", "Tab": "Tab",
	"Backspace": "Bksp", "ArrowUp": "↑", "ArrowDown": "↓", "ArrowLeft": "←", "ArrowRight": "→", "Semicolon": ";", "ControlLeft": "Ctrl"}

## 기본값 (data/input.json + 게임패드)
var defaults := {}
## 지금 쓰는 키 (기본값 위에 바꾼 키)
var bindings := {}
## 누르는 방식: 동작 → "hold" | "toggle"
var hold_mode := {}
## 마지막으로 쓴 장치: "keyboard" | "mouse" | "pad" | "touch" (화면의 키 표시가 따라 바뀐다)
var last_device := "keyboard"
## 패드 종류 (표시용): "xbox" | "ps"
var pad_style := "xbox"
## 게임패드 D-pad로 고른 가방 칸 (0부터)
var selected_slot := 0
## 화면 좌표 마우스 위치 (없으면 null)
var mouse: Variant = null
## 터치 가상 조이스틱 (-1~1, 없으면 null)
var stick: Variant = null
## 키 바꾸기: 다음 입력을 기다리는 중 {action, device} (없으면 null)
var capture: Variant = null
## 키 바꾸기가 끝나면 (action, device, code)
var on_captured: Callable = Callable()

var _down := {}
var _pressed := {}
var _touch := {}
var _taps := {}
## 켜고 끄기 방식이거나 화면 버튼으로 켠 동작
var _latched := {}
## 한 프레임에 하나씩 누르는 키 (목록 칸을 눌렀을 때: 커서를 옮기고 고르기)
var _queue: Array = []
var _mouse_idle := 99.0
var _stick_was := Vector2.ZERO


func _init(input_cfg: Dictionary, register_actions: bool = true, load_user: bool = true) -> void:
	for a in input_cfg:
		defaults[a] = (input_cfg[a] as Array).duplicate()
	for a in EXTRA_ACTIONS:
		if not defaults.has(a):
			defaults[a] = []
	for a in PAD_DEFAULTS:
		if not defaults.has(a):
			defaults[a] = []
		defaults[a] = defaults[a] + PAD_DEFAULTS[a]
	for a in HOLD_ACTIONS:
		hold_mode[a] = "hold"
	bindings = defaults.duplicate(true)
	if load_user:
		load_user_bindings()
	if register_actions:
		build_input_map()


# ───────────────────────── 바꾼 키 저장 ─────────────────────────

## user://input.json: { bindings: {동작: [코드…]}, holdMode: {동작: "toggle"} } — 기본값 위에 덮는다
func load_user_bindings() -> void:
	bindings = defaults.duplicate(true)
	if not FileAccess.file_exists(USER_PATH):
		return
	var f := FileAccess.open(USER_PATH, FileAccess.READ)
	var data = JSON.parse_string(f.get_as_text()) if f else null
	if not data is Dictionary:
		return
	for a in data.get("bindings", {}):
		if bindings.has(a) and data["bindings"][a] is Array:
			bindings[a] = (data["bindings"][a] as Array).duplicate()
	for a in data.get("holdMode", {}):
		if HOLD_ACTIONS.has(a):
			hold_mode[a] = "toggle" if data["holdMode"][a] == "toggle" else "hold"


func save_user_bindings() -> void:
	var changed := {}
	for a in bindings:
		if bindings[a] != defaults.get(a, []):
			changed[a] = bindings[a]
	var modes := {}
	for a in hold_mode:
		if hold_mode[a] == "toggle":
			modes[a] = "toggle"
	var f := FileAccess.open(USER_PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify({"bindings": changed, "holdMode": modes}, "  "))
	build_input_map()


## 기본값으로 (바꾼 키·누르는 방식을 모두 지운다)
func reset_to_defaults() -> void:
	bindings = defaults.duplicate(true)
	for a in HOLD_ACTIONS:
		hold_mode[a] = "hold"
	_latched.clear()
	if FileAccess.file_exists(USER_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(USER_PATH))
	build_input_map()


## 한 동작의 한 장치(keyboard|pad) 키를 바꾼다 (그 장치의 첫 키를 새 키로)
func rebind(action: String, device: String, code: String) -> void:
	var list: Array = bindings.get(action, [])
	var keep := list.filter(func(c): return is_pad_code(c) != (device == "pad"))
	var same := list.filter(func(c): return is_pad_code(c) == (device == "pad"))
	same = same.filter(func(c): return c != code)
	same.push_front(code)
	bindings[action] = keep + [same[0]]
	save_user_bindings()


func set_hold_mode(action: String, mode: String) -> void:
	hold_mode[action] = mode
	_latched.erase(action)
	save_user_bindings()


static func is_pad_code(code: String) -> bool:
	return code.begins_with("pad:")


## 키 바꾸기를 시작: 다음에 누른 키(또는 패드 버튼)를 그 동작에 넣는다. Esc는 그만두기
func begin_capture(action: String, device: String) -> void:
	capture = {"action": action, "device": device}


# ───────────────────────── InputMap ─────────────────────────

## 동작 이름 그대로 InputMap 액션을 만든다 (키보드 + 게임패드). ui_* 액션에 WASD·Backspace도 더한다 (메뉴 문법)
func build_input_map() -> void:
	for action in bindings:
		if not InputMap.has_action(action):
			InputMap.add_action(action, 0.2)
		else:
			InputMap.action_erase_events(action)
		for code in bindings[action]:
			var ev := event_for(code)
			if ev != null:
				InputMap.action_add_event(action, ev)
	# 하나의 메뉴 문법: 방향키/WASD/D-pad 이동, Enter/Space/A 고르기, Esc/Backspace/B 뒤로
	var extra := {"ui_up": ["KeyW", "pad:up"], "ui_down": ["KeyS", "pad:down"], "ui_left": ["KeyA", "pad:left"], "ui_right": ["KeyD", "pad:right"],
		"ui_accept": ["pad:a"], "ui_cancel": ["Backspace", "pad:b"]}
	for a in extra:
		if not InputMap.has_action(a):
			continue
		for code in extra[a]:
			var ev := event_for(code)
			var dup := false
			for e in InputMap.action_get_events(a):
				if e.is_match(ev):
					dup = true
			if not dup:
				InputMap.action_add_event(a, ev)


static func event_for(code: String) -> InputEvent:
	if is_pad_code(code):
		if code == "pad:lt" or code == "pad:rt":
			var m := InputEventJoypadMotion.new()
			m.axis = JOY_AXIS_TRIGGER_LEFT if code == "pad:lt" else JOY_AXIS_TRIGGER_RIGHT
			m.axis_value = 1.0
			return m
		for b in PAD_BUTTONS:
			if PAD_BUTTONS[b] == code:
				var e := InputEventJoypadButton.new()
				e.button_index = b
				return e
		return null
	var key := code_to_key(code)
	if key == KEY_NONE:
		return null
	var ev := InputEventKey.new()
	ev.physical_keycode = key
	return ev


## 웹 키 코드("KeyW", "Digit1", "ArrowUp", "F1"…) → Godot 키
static func code_to_key(code: String) -> Key:
	if NAMED.has(code):
		return NAMED[code]
	if code.begins_with("Key") and code.length() == 4:
		return OS.find_keycode_from_string(code.substr(3)) as Key
	if code.begins_with("Digit") and code.length() == 6:
		return (KEY_0 + int(code.substr(5))) as Key
	if code.begins_with("F") and code.substr(1).is_valid_int():
		return (KEY_F1 + int(code.substr(1)) - 1) as Key
	return KEY_NONE


## Godot 물리 키 → 웹 키 코드
static func key_to_code(key: Key) -> String:
	if key >= KEY_A and key <= KEY_Z:
		return "Key" + OS.get_keycode_string(key).to_upper()
	if key >= KEY_0 and key <= KEY_9:
		return "Digit%d" % (key - KEY_0)
	if key >= KEY_F1 and key <= KEY_F12:
		return "F%d" % (key - KEY_F1 + 1)
	if key == KEY_SHIFT:
		return "ShiftLeft"
	for name in NAMED:
		if NAMED[name] == key and name != "ShiftRight":
			return name
	return ""


# ───────────────────────── 이벤트 ─────────────────────────

func handle_event(e: InputEvent) -> void:
	var code := ""
	var pressed := false
	var is_press_event := false
	if e is InputEventKey:
		var k := e as InputEventKey
		code = key_to_code(k.physical_keycode if k.physical_keycode != KEY_NONE else k.keycode)
		pressed = k.pressed
		is_press_event = k.pressed and not k.echo
		if code != "":
			last_device = "keyboard"
	elif e is InputEventJoypadButton:
		var b := e as InputEventJoypadButton
		code = PAD_BUTTONS.get(b.button_index, "")
		pressed = b.pressed
		is_press_event = b.pressed
		_note_pad(b.device)
	elif e is InputEventJoypadMotion:
		var m := e as InputEventJoypadMotion
		if m.axis == JOY_AXIS_TRIGGER_LEFT or m.axis == JOY_AXIS_TRIGGER_RIGHT:
			code = "pad:lt" if m.axis == JOY_AXIS_TRIGGER_LEFT else "pad:rt"
			var was := _down.has(code)
			pressed = m.axis_value > 0.5 if not was else m.axis_value > 0.3
			is_press_event = pressed and not was
			if pressed:
				_note_pad(m.device)
		elif absf(m.axis_value) > 0.5:
			_note_pad(m.device)
	elif e is InputEventMouseMotion:
		mouse = (e as InputEventMouseMotion).position
		_mouse_idle = 0.0
		if (e as InputEventMouseMotion).relative.length() > 2 and e.device != InputEvent.DEVICE_ID_EMULATION:
			last_device = "mouse"
		return
	elif e is InputEventScreenTouch:
		last_device = "touch"
		return
	if code == "":
		return
	# 키 바꾸기: 다음에 누른 키를 그 동작에
	if capture != null and is_press_event:
		var dev: String = capture["device"]
		if code == "Escape":
			capture = null
		elif is_pad_code(code) == (dev == "pad"):
			var act: String = capture["action"]
			capture = null
			rebind(act, dev, code)
			if on_captured.is_valid():
				on_captured.call(act, dev, code)
		return
	if pressed:
		if is_press_event:
			_pressed[code] = true
		_down[code] = true
	else:
		_down.erase(code)


func _note_pad(device: int) -> void:
	last_device = "pad"
	var name := Input.get_joy_name(device).to_lower()
	pad_style = "ps" if (name.contains("ps") or name.contains("sony") or name.contains("dualsense") or name.contains("dualshock")) else "xbox"


## 창이 포커스를 잃으면 눌림을 모두 놓는다
func release_all() -> void:
	_down.clear()
	_touch.clear()


## 터치 버튼: 키를 누른 것처럼 (TouchControls, 화면의 칸)
func touch_down(code: String) -> void:
	if not _touch.has(code) and not _down.has(code):
		_pressed[code] = true
	_touch[code] = true


func touch_up(code: String) -> void:
	_touch.erase(code)


## 한 번 톡 (아이템 칸·대화 반응 칸·기술 카드). 0.08초 뒤 뗀다
func tap(code: String) -> void:
	touch_down(code)
	_taps[code] = 0.08


## 한 프레임에 하나씩 누른다 (폰·상점 목록의 칸을 누르면: 커서를 옮기고 고르기)
func queue_codes(codes: Array) -> void:
	_queue.append_array(codes)


## 화면 버튼으로 누르고 있어야 하는 동작을 켜고 끈다 (폰 보는 척·볼 감싸기·눈 감기 칸을 누름)
func toggle_latch(action: String) -> void:
	if _latched.has(action):
		_latched.erase(action)
	else:
		_latched[action] = true


func latched(action: String) -> bool:
	return _latched.has(action)


## 이번 프레임 눌림을 지운다 (UI가 먼저 썼을 때: Esc로 창을 닫았으면 게임에는 넘기지 않는다)
func consume(action: String) -> void:
	for code in bindings.get(action, []):
		_pressed.erase(code)


func consume_code(code: String) -> void:
	_pressed.erase(code)


func code_down(code: String) -> bool:
	return _down.has(code) or _touch.has(code)


func code_pressed(code: String) -> bool:
	return _pressed.has(code)


## 키보드·터치 (pad=false) 또는 게임패드까지 (pad=true)
func raw_down(action: String, pad: bool = true) -> bool:
	for code in bindings.get(action, []):
		if (pad or not is_pad_code(code)) and code_down(code):
			return true
	return false


func was_pressed(action: String, pad: bool = true) -> bool:
	for code in bindings.get(action, []):
		if (pad or not is_pad_code(code)) and _pressed.has(code):
			return true
	return false


## 누르고 있음: 켜고 끄기 방식이면 켜져 있는지
func is_down(action: String, pad: bool = true) -> bool:
	if _latched.has(action):
		return true
	return raw_down(action, pad)


func mouse_active() -> bool:
	return mouse != null and _mouse_idle < 2.5


func end_frame(dt: float) -> void:
	_pressed.clear()
	_mouse_idle += dt
	for code in _taps.keys():
		_taps[code] -= dt
		if _taps[code] <= 0:
			_taps.erase(code)
			touch_up(code)
	if not _queue.is_empty():
		_pressed[_queue.pop_front()] = true


# ───────────────────────── 화면 표시 ─────────────────────────

## 화면에 보일 키 이름: 마지막으로 쓴 장치에 맞춰 (게임패드면 버튼 그림 이름). 없으면 ""
func glyph(action: String) -> String:
	var list: Array = bindings.get(action, [])
	var want_pad := last_device == "pad"
	for code in list:
		if is_pad_code(code) == want_pad:
			return code_glyph(code)
	return ""


func code_glyph(code: String) -> String:
	if is_pad_code(code):
		return (PS_GLYPHS if pad_style == "ps" else XBOX_GLYPHS).get(code, code.substr(4).to_upper())
	if KEY_GLYPHS.has(code):
		return KEY_GLYPHS[code]
	if code.begins_with("Key"):
		return code.substr(3)
	if code.begins_with("Digit"):
		return code.substr(5)
	return code


## 키보드 / 게임패드 한쪽의 키 이름 (설정 창 목록)
func device_glyph(action: String, device: String) -> String:
	for code in bindings.get(action, []):
		if is_pad_code(code) == (device == "pad"):
			return code_glyph(code)
	return "—"


# ───────────────────────── Controls ─────────────────────────

## 이번 렌더 프레임의 Controls (GameSession.step에 넘기는 사전, TS Controls와 같은 camelCase 키).
## player_screen: 화면에서 내 위치 (마우스 조준용, 없으면 null)
func read_controls(s, player_screen: Variant = null) -> Dictionary:
	var mode: String = s.mode["kind"] if s != null else ""
	var phone_open: bool = s.phone_open if s != null else false
	var ringing: bool = s != null and s.phone.call != null
	var menu_open := phone_open or mode == "shop" or mode == "metroMenu"
	# 게임패드 버튼은 상황마다 맡는 동작이 다르다
	var ctx := "ring" if ringing else "dialogue" if (mode == "dialogue" or mode == "work") else "menu" if menu_open else "play"
	var allowed: Array = PAD_CONTEXT[ctx]
	var wp := func(a: String) -> bool: return was_pressed(a, allowed.has(a))
	var dn := func(a: String) -> bool: return raw_down(a, allowed.has(a))
	# 켜고 끄기 방식: 누를 때마다 켜짐 ↔ 꺼짐
	for a in HOLD_ACTIONS:
		if hold_mode.get(a, "hold") == "toggle" and wp.call(a):
			toggle_latch(a)
	var held := func(a: String) -> bool:
		if _latched.has(a):
			return true
		return hold_mode.get(a, "hold") == "hold" and dn.call(a)
	var move := Vector2.ZERO
	if dn.call("moveLeft"):
		move.x -= 1
	if dn.call("moveRight"):
		move.x += 1
	if dn.call("moveUp"):
		move.y -= 1
	if dn.call("moveDown"):
		move.y += 1
	# 왼쪽 스틱: 기울인 만큼 걷는다
	var axis := Vector2(Input.get_joy_axis(0, JOY_AXIS_LEFT_X), Input.get_joy_axis(0, JOY_AXIS_LEFT_Y))
	if axis.length() > 0.2:
		move = axis.limit_length(1.0)
		last_device = "pad"
	# 터치 조이스틱: 기울인 만큼 걷고, 끝까지 밀면 달린다
	var stick_run := false
	if stick != null and (stick as Vector2) != Vector2.ZERO:
		move = stick
		stick_run = (stick as Vector2).length() > 0.95
	var aim: Variant = null
	if mouse_active() and player_screen != null and last_device == "mouse":
		var d: Vector2 = (mouse as Vector2) - (player_screen as Vector2)
		aim = atan2(d.y, d.x)
	var keyed := mode == "dialogue" or mode == "work"
	var reply := ""
	if keyed:
		for i in 4:
			if wp.call("reply%d" % (i + 1)):
				reply = REPLIES[i]
	var note := -1
	if mode == "piano":
		for i in PIANO_CODES.size():
			if code_pressed(PIANO_CODES[i]):
				note = i
	var slot := -1
	if mode == "seated":
		for i in 3:
			if code_pressed("Digit%d" % (i + 1)) or code_pressed(["pad:x", "pad:y", "pad:b"][i]):
				slot = i
	# 가방: 숫자 키, 또는 D-pad ←→로 고르고 ↑로 쓰기
	var use_item := -1
	var bag: int = s.bag_slots().size() if s != null and s.has_method("bag_slots") else 0
	if bag > 0:
		selected_slot = clampi(selected_slot, 0, bag - 1)
		if wp.call("slotPrev"):
			selected_slot = (selected_slot - 1 + bag) % bag
		if wp.call("slotNext"):
			selected_slot = (selected_slot + 1) % bag
	if not keyed:
		for i in ITEM_ACTIONS.size():
			if was_pressed(ITEM_ACTIONS[i], false):
				use_item = i
		if bag > 0 and wp.call("slotUse") and not menu_open:
			use_item = selected_slot
	var nav := 0
	var pad_menu := ctx == "menu" or (ctx == "ring" and menu_open)
	if menu_open:
		if code_pressed("ArrowUp") or code_pressed("KeyW") or (pad_menu and code_pressed("pad:up")):
			nav = -1
		elif code_pressed("ArrowDown") or code_pressed("KeyS") or (pad_menu and code_pressed("pad:down")):
			nav = 1
	var pad_a := code_pressed("pad:a") and ctx != "ring" and ctx != "dialogue"
	return {
		"move": Vector2.ZERO if phone_open else move,
		"sprint": held.call("sprint") or stick_run,
		"aim": aim,
		"interactPressed": wp.call("interact"),
		"interactHeld": dn.call("interact"),
		"earphonesPressed": wp.call("earphones"),
		"phonePretend": held.call("phonePretend"),
		"cover": held.call("coverCheeks"),
		"eyesClosed": held.call("closeEyes"),
		"maskPressed": wp.call("mask"),
		"useItem": use_item,
		"reply": reply,
		"smile": held.call("smile"),
		"spacePressed": code_pressed("Space") or pad_a,
		"sos": wp.call("sos"),
		"confirm": wp.call("confirm"),
		"accept": wp.call("accept"),
		"decline": wp.call("decline"),
		"textInstead": wp.call("textInstead"),
		"phoneToggle": wp.call("phone"),
		"menuNav": nav,
		"phoneReply": menu_open and (code_pressed("Enter") or (pad_menu and code_pressed("pad:a"))),
		"phoneIgnore": menu_open and (code_pressed("Backspace") or (pad_menu and code_pressed("pad:x"))),
		"note": note,
		"slot": slot,
		"retry": code_pressed("KeyR") or (mode == "collapse" and code_pressed("pad:a")),
		"leave": wp.call("leave"),
		"cancel": wp.call("pause"),
	}


## 아직 소비되지 않은 눌림(prev)과 새 입력(next)을 합친다 (고정 스텝이 한 번도 돌지 않은 프레임의 눌림을 잃지 않게)
static func merge_pressed(prev: Dictionary, next: Dictionary) -> Dictionary:
	var out := next.duplicate()
	for key in prev:
		var a = prev[key]
		if a is bool and a and not next.get(key, false):
			out[key] = true
	if next.get("reply", "") == "":
		out["reply"] = prev.get("reply", "")
	for k in ["note", "slot", "useItem"]:
		if int(next.get(k, -1)) < 0:
			out[k] = prev.get(k, -1)
	if int(next.get("menuNav", 0)) == 0:
		out["menuNav"] = prev.get("menuNav", 0)
	return out


## '눌림'은 첫 고정 스텝에만, 이후 스텝에는 '누르고 있음'만 남긴다
static func held_only(c: Dictionary) -> Dictionary:
	return {
		"move": c.get("move", Vector2.ZERO), "sprint": c.get("sprint", false), "aim": c.get("aim", null),
		"interactPressed": false, "interactHeld": c.get("interactHeld", false), "earphonesPressed": false,
		"phonePretend": c.get("phonePretend", false), "cover": c.get("cover", false), "eyesClosed": c.get("eyesClosed", false),
		"maskPressed": false, "useItem": -1, "reply": "", "smile": c.get("smile", false), "spacePressed": false,
		"sos": false, "confirm": false, "accept": false, "decline": false, "textInstead": false, "phoneToggle": false,
		"menuNav": 0, "phoneReply": false, "phoneIgnore": false, "note": -1, "slot": -1, "retry": false, "leave": false, "cancel": false,
	}
