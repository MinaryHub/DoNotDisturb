class_name GameInput
extends RefCounted

## 키보드·마우스·터치 입력 상태 (웹 판 src/core/Input.ts + main.ts의 buildControls).
## data/input.json의 액션 이름 → 키 코드(웹 KeyboardEvent.code 이름)를 Godot InputMap 액션으로 만들고,
## 매 렌더 프레임 read_controls()로 GameSession의 Controls 사전(camelCase 키)을 만든다.
##
## 쓰는 법 (main):
##   var gi := GameInput.new(cfg["input"])        # InputMap 액션을 만든다
##   func _input(e): gi.handle_event(e)             # 키·마우스를 받는다 (터치 버튼은 touch_down/touch_up/tap)
##   func _process(dt):
##       var c := gi.read_controls(session, player_screen_px)  # 눌림은 이번 프레임 것
##       ... (고정 스텝에는 merge_pressed / held_only로 나눠 준다)
##       gi.end_frame(dt)

const REPLIES := ["nod", "agree", "answer", "exit"]
const ITEM_ACTIONS := ["useItem1", "useItem2", "useItem3", "useItem4", "useItem5", "useItem6", "useItem7", "useItem8"]
const PIANO_CODES := ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ"]
## 웹 키 코드 → Godot 물리 키
const NAMED := {
	"Space": KEY_SPACE, "Enter": KEY_ENTER, "NumpadEnter": KEY_KP_ENTER, "Tab": KEY_TAB, "Escape": KEY_ESCAPE,
	"Backspace": KEY_BACKSPACE, "ShiftLeft": KEY_SHIFT, "ShiftRight": KEY_SHIFT, "ControlLeft": KEY_CTRL,
	"ArrowUp": KEY_UP, "ArrowDown": KEY_DOWN, "ArrowLeft": KEY_LEFT, "ArrowRight": KEY_RIGHT,
	"Semicolon": KEY_SEMICOLON, "Comma": KEY_COMMA, "Period": KEY_PERIOD, "Slash": KEY_SLASH, "Minus": KEY_MINUS,
	"Numpad1": KEY_KP_1, "Numpad2": KEY_KP_2,
}

var bindings: Dictionary
## 지금 눌려 있는 키 코드 (키보드 + 터치 버튼)
var _down := {}
## 이번 프레임에 새로 눌린 키 코드
var _pressed := {}
## 이번 프레임에 새로 눌린 액션 (InputMap 이벤트: 키보드·게임패드)
var _pressed_actions := {}
## 터치·클릭으로 누른 키 코드 (키보드와 따로: 키를 떼도 터치는 남는다)
var _touch := {}
## 톡 누름: 남은 초 뒤 뗀다
var _taps := {}
## 화면 좌표 마우스 위치 (없으면 null)
var mouse: Variant = null
var _mouse_idle := 99.0
## 터치 가상 조이스틱 (-1~1, 없으면 null)
var stick: Variant = null


func _init(input_cfg: Dictionary, register_actions: bool = true) -> void:
	bindings = input_cfg
	if register_actions:
		build_input_map(input_cfg)


## data/input.json → InputMap 액션 (액션 이름 그대로). 이미 있으면 키 이벤트만 다시 넣는다
static func build_input_map(input_cfg: Dictionary) -> void:
	for action in input_cfg:
		if not InputMap.has_action(action):
			InputMap.add_action(action, 0.2)
		else:
			InputMap.action_erase_events(action)
		for code in input_cfg[action]:
			var key := code_to_key(code)
			if key == KEY_NONE:
				continue
			var ev := InputEventKey.new()
			ev.physical_keycode = key
			InputMap.action_add_event(action, ev)


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


## main의 _input/_unhandled_input에서 넘긴다
func handle_event(e: InputEvent) -> void:
	if e is InputEventKey:
		var k := e as InputEventKey
		var code := key_to_code(k.physical_keycode if k.physical_keycode != KEY_NONE else k.keycode)
		if code != "":
			if k.pressed:
				if not k.echo:
					_pressed[code] = true
				_down[code] = true
			else:
				_down.erase(code)
	elif e is InputEventMouseMotion:
		mouse = (e as InputEventMouseMotion).position
		_mouse_idle = 0.0
	if e.is_pressed() and not e.is_echo():
		for action in bindings:
			if InputMap.has_action(action) and e.is_action_pressed(action):
				_pressed_actions[action] = true


## 창이 포커스를 잃으면 눌림을 모두 놓는다
func release_all() -> void:
	_down.clear()
	_touch.clear()


## 터치 버튼: 키를 누른 것처럼 (TouchControls, 화면의 칸을 누름)
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


func code_down(code: String) -> bool:
	return _down.has(code) or _touch.has(code)


func code_pressed(code: String) -> bool:
	return _pressed.has(code)


func is_down(action: String) -> bool:
	if InputMap.has_action(action) and Input.is_action_pressed(action):
		return true
	for code in bindings.get(action, []):
		if code_down(code):
			return true
	return false


## 이번 프레임에 새로 눌렸는지 (end_frame 전까지)
func was_pressed(action: String) -> bool:
	if _pressed_actions.has(action):
		return true
	for code in bindings.get(action, []):
		if _pressed.has(code):
			return true
	return false


## 마우스를 최근에 움직였는지 (가만히 두면 이동 방향을 바라본다)
func mouse_active() -> bool:
	return mouse != null and _mouse_idle < 2.5


func end_frame(dt: float) -> void:
	_pressed.clear()
	_pressed_actions.clear()
	_mouse_idle += dt
	for code in _taps.keys():
		_taps[code] -= dt
		if _taps[code] <= 0:
			_taps.erase(code)
			touch_up(code)


## 이번 렌더 프레임의 Controls (GameSession.step에 넘기는 사전, TS Controls와 같은 camelCase 키).
## player_screen: 화면에서 내 위치 (마우스 조준용, 없으면 null)
func read_controls(s, player_screen: Variant = null) -> Dictionary:
	var mode: String = s.mode["kind"] if s != null else ""
	var move := Vector2.ZERO
	if is_down("moveLeft"):
		move.x -= 1
	if is_down("moveRight"):
		move.x += 1
	if is_down("moveUp"):
		move.y -= 1
	if is_down("moveDown"):
		move.y += 1
	# 터치 조이스틱: 기울인 만큼 걷고, 끝까지 밀면 달린다
	var stick_run := false
	if stick != null and (stick as Vector2) != Vector2.ZERO:
		move = stick
		stick_run = (stick as Vector2).length() > 0.95
	var aim: Variant = null
	if mouse_active() and player_screen != null:
		var d: Vector2 = (mouse as Vector2) - (player_screen as Vector2)
		aim = atan2(d.y, d.x)
	var keyed := mode == "dialogue" or mode == "work"
	var reply := ""
	if keyed:
		for i in 4:
			if was_pressed("reply%d" % (i + 1)):
				reply = REPLIES[i]
	var note := -1
	if mode == "piano":
		for i in PIANO_CODES.size():
			if code_pressed(PIANO_CODES[i]):
				note = i
	var slot := -1
	if mode == "seated":
		for i in 3:
			if code_pressed("Digit%d" % (i + 1)):
				slot = i
	var use_item := -1
	if not keyed:
		for i in ITEM_ACTIONS.size():
			if was_pressed(ITEM_ACTIONS[i]):
				use_item = i
	var phone_open: bool = s.phone_open if s != null else false
	var menu_open := phone_open or mode == "shop" or mode == "metroMenu"
	var nav := 0
	if menu_open:
		if code_pressed("ArrowUp") or code_pressed("KeyW"):
			nav = -1
		elif code_pressed("ArrowDown") or code_pressed("KeyS"):
			nav = 1
	return {
		"move": Vector2.ZERO if phone_open else move,
		"sprint": is_down("sprint") or stick_run,
		"aim": aim,
		"interactPressed": was_pressed("interact"),
		"interactHeld": is_down("interact"),
		"earphonesPressed": was_pressed("earphones"),
		"phonePretend": is_down("phonePretend"),
		"cover": is_down("coverCheeks"),
		"eyesClosed": is_down("closeEyes"),
		"maskPressed": was_pressed("mask"),
		"useItem": use_item,
		"reply": reply,
		"smile": is_down("smile"),
		"spacePressed": code_pressed("Space"),
		"sos": was_pressed("sos"),
		"confirm": was_pressed("confirm"),
		"accept": was_pressed("accept"),
		"decline": was_pressed("decline"),
		"textInstead": was_pressed("textInstead"),
		"phoneToggle": was_pressed("phone"),
		"menuNav": nav,
		"phoneReply": menu_open and code_pressed("Enter"),
		"phoneIgnore": menu_open and code_pressed("Backspace"),
		"note": note,
		"slot": slot,
		"retry": code_pressed("KeyR"),
		"leave": was_pressed("leave"),
		"cancel": was_pressed("pause"),
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
