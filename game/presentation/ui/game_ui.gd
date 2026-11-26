class_name GameUI
extends Control

## 플레이 화면 UI (웹 판 src/presentation/ui/GameUI.ts를 고정 구역으로 다시 짠 것). 배터리·스트레스 수치는 보여 주지 않는다.
## 상태는 말투·떨림·가려짐 같은 '감각'으로 드러낸다. 예외: 숫자 없는 게이지 (설정에서 끌 수 있음).
## 세션은 읽기만 한다 (CLAUDE.md 8). 누른 칸은 키 코드로 돌려준다: game_input.tap(code) + code_tapped 시그널 → main이 Controls로.
##
## 구역 (1280×720과 가로로 든 휴대폰이 같다, 서로 겹치지 않는다):
##   왼쪽 위    시계·요일 + 지금 할 일 한 줄(목표 쪽 화살표). [H]나 한 줄을 누르면 전체 메모가 펼쳐지고 닫힌다
##   오른쪽 위  게이지만 (에너지·심리 상태·켜진 증상, 숫자 없이)
##   아래 가운데 한 줄 행동 막대: 가방 1~4 + 기술(E 이어폰·Q 폰 보는 척·V 마스크·C 볼 감싸기·X 눈 감기) + Tab 폰.
##              그 위에 지금 쓸 수 있는 키만, 전화가 오면 큰 버튼 셋(받기·거절·문자로). 대화·업무·상점·발화는 이 구역을 차지한다
##   왼쪽 아래  알림 (최대 3개, 새 것이 아래)
##   상호작용 안내는 한 곳: 내 머리 근처 ("[F] 이름", projector로)
##
## main이 할 일:
##   ui = GameUI.new(); ui.setup(cfg, settings, game_input); CanvasLayer에 add_child(ui)
##   ui.projector = func(world: Vector2, height: float) -> Vector2: 화면 좌표 (3D 카메라 투영)
##   ui.touch = 터치 기기인지
##   타이틀: ui.show_title(이어할 날 이름 또는 "", 난이도 id); 매 프레임 ui.route(gi, null); ui.update(dt, null, null)
##   게임:   매 프레임 ui.route(gi, session) → (ui.blocks_game()이면 세션을 멈춘다) → ui.handle_fx(session.drain_fx()) → ui.update(dt, session, ps)

signal code_tapped(code: String)
## 설정 창에서 값을 바꿨다 (main이 저장·적용)
signal settings_changed
## 설정 창에서 언어를 바꿨다 (main이 저장하고 그 언어로 다시 불러온다)
signal language_changed(lang: String)
## 멈춤 메뉴의 '타이틀로'
signal quit_to_title

const TOAST_SEC := 3.6
const TOAST_MAX := 4
const NOTIF_MAX := 3
const LIFE_IDS := ["income", "housing", "essentials", "bond"]
const MOODS := ["tension", "stress", "panic", "meltdown"]
const SYMPTOM_BARS := ["flush", "stutter", "sweat", "migraine", "hurry"]
const REPLIES := ["nod", "agree", "answer", "exit"]
const SCREEN_KINDS := ["dayIntro", "night", "final", "burnout", "collapse"]
const PANEL_KINDS := ["dialogue", "speech", "work", "piano", "seated", "shop", "metroMenu"]
const BAR_COLORS := {
	"tension": "#e0c25a", "stress": "#d98a5a", "panic": "#e06a8a", "meltdown": "#b05ae0",
	"flush": "#e06a6a", "stutter": "#e0b85a", "sweat": "#6fb3e0", "migraine": "#a98be0", "hurry": "#f29e4c",
}
## 행동 막대의 기술 칸: [동작, 아이콘, 이름 키, 누르는 방식(tap=한 번 / hold=누르고 있기)]
const SKILLS := [
	["earphones", "ui.earphones", "ui.skill.earphones", "tap"],
	["phonePretend", "ui.phonePretend", "ui.skill.phonePretend", "hold"],
	["mask", "ui.mask", "ui.skill.mask", "tap"],
	["coverCheeks", "ui.cover", "ui.skill.cover", "hold"],
	["closeEyes", "ui.eyes", "ui.skill.eyes", "hold"],
	["phone", "ui.phone", "ui.skill.phone", "tap"],
]

var cfg: Dictionary
var settings: Settings
var game_input: GameInput
## (Vector2 월드 좌표, float 높이 m) -> Vector2 화면 좌표. main이 3D 카메라로 준다
var projector: Callable = Callable()
## 터치 화면: 키 대신 버튼 이름으로 안내 (`<키>.touch`), 터치 배치
var touch := false
## 화면 px: 나와 나에게 다가오는 사람. 그 위를 덮은 UI는 투명하게 비켜 준다 (TouchControls도 같은 점을 쓴다)
var focus_points: Array = []

var _time := 0.0
var _click_group := ""
var _sigs := {}
var _fade := {}
var _memo_open := false

# 화면 요소
var _hud: Control
var _tags: Control
var _tag_nodes := {}
var _prompt: PanelContainer
var _prompt_label: Label
var _mono: Label
var _line: PanelContainer
var _line_day: Label
var _line_arrow: DirArrow
var _line_obj: Label
var _line_must: PanelContainer
var _line_key: PanelContainer
var _memo: PanelContainer
var _memo_list: RichTextLabel
var _memo_foot: RichTextLabel
var _memo_pending: VBoxContainer
var _memo_hot: Array = []
var _gauges: Gauges
var _qte: PanelContainer
var _qte_label: Label
var _qte_bar: Bar
var _notifs: VBoxContainer
var _column: VBoxContainer
var _status: PanelContainer
var _status_label: Label
var _call: PanelContainer
var _call_who: Label
var _call_hint: Label
var _call_btns: Array = []
var _panel: PanelContainer
var _panel_body: VBoxContainer
var _panel_kind := ""
var _p := {}
var _hints: HBoxContainer
var _bar: HBoxContainer
var _phone: PanelContainer
var _phone_time: Label
var _phone_icons: Array = []
var _phone_batt: Battery
var _phone_list: VBoxContainer
var _phone_scroll: ScrollContainer
var _phone_wait: Label
var _toasts: VBoxContainer
var _toast_items: Array = []
var _screen: Control
var _screen_bg: TextureRect
var _screen_scroll: ScrollContainer
var _screen_center: VBoxContainer
var _screen_kind := ""
var _map: Control
var _map_view: MapView
var _map_open := false
var _map_city := false
var _minimap: Texture2D = null
var _pause: Control
var _pause_first: Control
var _options: Control
var _opt_tab := 0
var _opt_pages: Array = []
var _opt_tabs: Array = []
var _opt_controls: VBoxContainer
var _option_inputs := {}
var _energy_shown := 1.0
var _bar_shown := {}


func setup(config: Dictionary, s: Settings, input: GameInput = null) -> void:
	cfg = config
	settings = s
	game_input = input if input != null else GameInput.new(cfg["input"], false, false)
	game_input.on_captured = func(_a, _d, _c) -> void: _rebuild_controls_page()
	_click_group = "game_ui_click_%d" % get_instance_id()
	theme = UiTheme.build()
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build()


## 터치 화면·게임패드: 키보드 키 대신 버튼 이름으로 안내하는 문구가 있으면 그쪽 (`<키>.touch`)
func _tx(key: String, vars: Dictionary = {}) -> String:
	var text: Dictionary = cfg["text"]
	if (touch or game_input.last_device == "pad") and text.has(key + ".touch"):
		return DataLoader.t(text, key + ".touch", vars)
	return DataLoader.t(text, key, vars)


## 화면에 보일 키 이름 (마지막으로 쓴 장치에 맞춰)
func _g(action: String) -> String:
	return game_input.glyph(action)


func _pad() -> bool:
	return game_input.last_device == "pad"


## 돈 표시 (자릿수 구분)
func _money(n: float) -> String:
	return _tx("hud.money", {"money": _group(n)})


static func _group(n: float) -> String:
	var neg := n < 0
	var s := str(int(absf(roundf(n))))
	var out := ""
	while s.length() > 3:
		out = "," + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	return ("-" if neg else "") + s + out


# ───────────────────────── 공개 도우미 ─────────────────────────

func set_minimap(tex: Texture2D) -> void:
	_minimap = tex


## [M]: 열기 ↔ 닫기 (지난번에 보던 크기로 열린다)
func toggle_map() -> void:
	_map_open = not _map_open


## [Z]: 지도가 열려 있을 때 주변 ↔ 도시 전체
func zoom_map() -> void:
	if _map_open:
		_map_city = not _map_city


func close_map() -> void:
	_map_open = false


func is_map_open() -> bool:
	return _map_open


func options_open() -> bool:
	return _options.visible


func is_paused() -> bool:
	return _pause.visible


## 세션을 멈춰야 하는지 (멈춤 메뉴·설정 창)
func blocks_game() -> bool:
	return _pause.visible or _options.visible


## [H]: 오늘 할 일 전체 펼치기 ↔ 접기
func toggle_memo() -> void:
	_memo_open = not _memo_open


func toggle_options(tab: int = -1) -> void:
	if _options.visible and (tab < 0 or tab == _opt_tab):
		_options.visible = false
		game_input.capture = null
		_release_focus_in(_options)
		if _pause.visible and is_instance_valid(_pause_first):
			_pause_first.grab_focus()
		return
	if tab >= 0:
		_opt_tab = tab
	_options.visible = true
	_refresh_options()
	_show_opt_tab(_opt_tab)
	_appear(_options.get_child(1))


func open_pause() -> void:
	_pause.visible = true
	_appear(_pause.get_child(1))
	_pause_first.call_deferred("grab_focus")


func close_pause() -> void:
	_pause.visible = false
	_release_focus_in(_pause)


## 설정의 '단축키 안내 표시' (지금 쓸 수 있는 키 줄)
func toggle_hints() -> void:
	settings.controls_hint = not settings.controls_hint
	_refresh_options()
	settings_changed.emit()


## 세션의 fx 중 알림을 띄운다 (main이 drain_fx()로 꺼낸 것을 넘긴다)
func handle_fx(fx: Array) -> void:
	for e in fx:
		if e is Dictionary and e.get("type", "") == "toast":
			toast(e["key"], e.get("vars", {}))


func toast(key: String, vars: Dictionary = {}) -> void:
	var text := _tx(key, vars)
	# 같은 말이 다시 오면 새로 쌓지 않고 시간만 늘린다
	for t in _toast_items:
		if t["text"] == text:
			t["left"] = TOAST_SEC
			return
	var box := _pc(UiTheme.box(UiTheme.DARK, 18, Vector4(16, 6, 16, 7), Color(0, 0, 0, 0), 0, 10))
	var fs := 13 if _low() else 15
	var l := _lbl(text, fs, UiTheme.INK)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	if UiTheme.font().get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > 420:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.custom_minimum_size.x = 420
	box.add_child(l)
	box.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_toasts.add_child(box)
	_toast_items.append({"node": box, "text": text, "left": TOAST_SEC, "age": 0.0})
	while _toast_items.size() > TOAST_MAX:
		_toast_items.pop_front()["node"].queue_free()


## difficulty: 새로 시작할 때의 '나는 이만큼 지친다' (balance.difficulty의 id). continue_day: 이어할 날 이름 ("" = 처음)
func show_title(continue_day: String, difficulty: String = "normal") -> void:
	var diffs: Array = cfg["balance"]["difficulty"]
	var diff: Dictionary = diffs[0]
	for d in diffs:
		if d["id"] == difficulty:
			diff = d
	var box := _screen_box(600)
	var w := box.custom_minimum_size.x
	box.add_child(_center(_lbl(_tx("screen.title"), 34, UiTheme.INK, 700)))
	box.add_child(_gap(14))
	box.add_child(_center(_wrap(_tx("screen.subtitle"), 17, Color("#ddd5c6"), w)))
	box.add_child(_gap(22))
	var first := _menu_item(_tx("screen.continue", {"day": continue_day}) if continue_day != "" else _tx("screen.start"), "Enter", 16, UiTheme.WARM)
	box.add_child(first)
	if continue_day != "":
		box.add_child(_menu_item(_tx("screen.newGame"), "KeyN", 13, UiTheme.INK_DIM))
	if cfg.get("vacationDay") != null:
		box.add_child(_menu_item(_tx("screen.vacation"), "KeyV", 13, Color("#b9e3a5")))
	box.add_child(_menu_item("%s — %s" % [_tx("diff.title", {"name": _tx(diff["nameKey"])}), _tx(diff["descKey"])], "KeyD", 13, UiTheme.INK_DIM))
	box.add_child(_menu_item(_tx("touch.options"), func() -> void: toggle_options(0), 13, UiTheme.INK_DIM))
	box.add_child(_gap(24))
	box.add_child(_center(_wrap(_tx("screen.photosensitive"), 12, UiTheme.INK_DIM, w)))
	_set_screen("title", box, first)
	_sigs["screen"] = "title"
	_hud.visible = false


# ───────────────────────── 입력 길잡이 ─────────────────────────

## 매 프레임 read_controls 전에: Esc/B는 맨 위 창부터 닫고, 아무것도 없을 때만 멈춤 메뉴. 지도·메모·설정 키도 여기서.
## UI가 쓴 눌림은 지워서 게임에 넘기지 않는다 (s: GameSession 또는 null = 타이틀)
func route(gi: GameInput, s) -> void:
	if gi.capture != null:
		return
	var kind: String = s.mode["kind"] if s != null else "title"
	var ringing: bool = s != null and s.phone.call != null
	if gi.was_pressed("options"):
		gi.consume("options")
		toggle_options(0)
		return
	if s != null and gi.was_pressed("menu"):
		gi.consume("menu")
		if _options.visible:
			toggle_options()
		elif _pause.visible:
			close_pause()
		else:
			open_pause()
		return
	if s != null and not blocks_game():
		if gi.was_pressed("map", not ringing) and (kind == "free" or kind == "peephole" or _map_open):
			gi.consume("map")
			toggle_map()
		if _map_open and (gi.code_pressed("KeyZ") or gi.code_pressed("pad:y")):
			gi.consume_code("KeyZ")
			gi.consume_code("pad:y")
			zoom_map()
		if gi.was_pressed("toggleHints"):
			gi.consume("toggleHints")
			toggle_memo()
	# 뒤로: Esc · (UI 창이 열려 있으면) Backspace · 게임패드 B (전화가 울리거나 대화 중이면 B는 거절·반응)
	var pad_b: bool = gi.code_pressed("pad:b") and not ringing and kind != "dialogue" and kind != "work"
	var esc: bool = gi.code_pressed("Escape") or pad_b
	var ui_open: bool = _options.visible or _pause.visible or _map_open or _memo_open
	if not (esc or (ui_open and gi.code_pressed("Backspace"))):
		return
	var eat := func() -> void:
		gi.consume("pause")
		gi.consume_code("Escape")
		gi.consume_code("Backspace")
		gi.consume_code("pad:b")
	if _options.visible:
		toggle_options()
		eat.call()
	elif _pause.visible:
		close_pause()
		eat.call()
	elif _map_open:
		close_map()
		eat.call()
	elif _memo_open:
		_memo_open = false
		eat.call()
	elif s == null:
		return
	elif s.phone_open:
		# 폰은 Tab과 같이 닫는다
		eat.call()
		gi.tap(gi.bindings["phone"][0] if gi.bindings.get("phone", []).size() > 0 else "Tab")
	elif kind == "free" and not ringing:
		eat.call()
		open_pause()
	elif pad_b and not gi.was_pressed("pause", false):
		# 미니게임·상점: 게임패드 B도 Esc처럼 그만두기
		gi.tap("Escape")


# ───────────────────────── 매 프레임 ─────────────────────────

## s: GameSession (null이면 타이틀), ps: PresentationState
func update(dt: float, s, ps) -> void:
	_time += dt
	_update_toasts(dt)
	_update_fades(dt)
	_place(_toasts, Vector2(0.5, 0.22 if (touch and _low()) else 0.14), Vector2.ZERO, Control.GROW_DIRECTION_BOTH, Control.GROW_DIRECTION_END)
	if s == null:
		_hud.visible = false
		_map.visible = false
		return
	_hud.visible = true
	var kind: String = s.mode["kind"]
	var playing := not SCREEN_KINDS.has(kind)
	_update_screen(s, ps)
	_update_line(s, playing)
	_update_memo(s, playing)
	_update_prompt(s, playing)
	_update_monologue(s, ps, playing)
	_update_tags(s, playing)
	_update_panel(s, ps)
	_update_call(s, playing)
	_update_status(s, playing)
	_update_bar(s, playing)
	_update_hints(s, playing)
	_update_notifs(s, playing)
	_update_phone(s, ps, playing)
	_update_qte(s)
	_update_gauges(dt, s, playing)
	_update_map(s)
	_layout(s)
	_update_covering(s, playing, dt)


func _low() -> bool:
	return size.y < 520


# ───────────────────────── 만들기 ─────────────────────────

func _build() -> void:
	_hud = _full(Control.new())
	add_child(_hud)
	_tags = _full(Control.new())
	_hud.add_child(_tags)
	_prompt = _pc(UiTheme.box(Color(0.078, 0.078, 0.1, 0.78), 8, Vector4(8, 4, 10, 5)))
	var ph := HBoxContainer.new()
	ph.add_theme_constant_override("separation", 6)
	ph.add_child(_kbd("F"))
	_prompt_label = _lbl("", 14)
	ph.add_child(_prompt_label)
	_prompt.add_child(ph)
	_hud.add_child(_prompt)
	# 내면 독백: 시야 앞에 떠다니는 생각
	_mono = _lbl("", 15, Color("#fffaf0"), 400, true)
	_mono.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_mono.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_mono.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.85))
	_mono.add_theme_constant_override("shadow_outline_size", 6)
	_mono.add_theme_constant_override("shadow_offset_y", 1)
	_hud.add_child(_mono)
	_build_line()
	_gauges = Gauges.new()
	_gauges.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hud.add_child(_gauges)
	_qte = _pc(UiTheme.box(Color(0.078, 0.078, 0.1, 0.86), 12, Vector4(18, 10, 18, 10)))
	var qv := _vbox(8)
	_qte_label = _lbl("", 18, UiTheme.INK, 700)
	_qte_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	qv.add_child(_qte_label)
	_qte_bar = Bar.new()
	_qte_bar.setup(UiTheme.WARM, Color(1, 1, 1, 0.15), 5)
	qv.add_child(_qte_bar)
	_qte.add_child(qv)
	_hud.add_child(_qte)
	# 왼쪽 아래 알림: 새 것이 아래
	_notifs = _vbox(6)
	_notifs.alignment = BoxContainer.ALIGNMENT_END
	_hud.add_child(_notifs)
	# 아래 가운데 한 줄 (위에서부터): 진행 상태 · 전화 · 모드 창 · 지금 쓸 수 있는 키 · 행동 막대
	_column = _vbox(8)
	_column.alignment = BoxContainer.ALIGNMENT_END
	_hud.add_child(_column)
	_status = _pc(UiTheme.box(Color(0.078, 0.078, 0.1, 0.7), 10, Vector4(14, 5, 14, 6)))
	_status_label = _lbl("", 14)
	_status.add_child(_status_label)
	_status.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_column.add_child(_status)
	_build_call()
	_panel = _pc(UiTheme.box(UiTheme.PANEL, 16, Vector4(20, 14, 20, 14), Color(0, 0, 0, 0), 0, 18))
	_panel_body = _vbox(0)
	_panel.add_child(_panel_body)
	_panel.visible = false
	_panel.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_column.add_child(_panel)
	_hints = HBoxContainer.new()
	_hints.add_theme_constant_override("separation", 14)
	_hints.alignment = BoxContainer.ALIGNMENT_CENTER
	_hints.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_column.add_child(_hints)
	_bar = HBoxContainer.new()
	_bar.add_theme_constant_override("separation", 6)
	_bar.alignment = BoxContainer.ALIGNMENT_CENTER
	_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_column.add_child(_bar)
	_build_phone()
	# 화면 전체 (하루 시작·밤·실패·엔딩·타이틀)
	_screen = _full(Control.new())
	_screen_bg = TextureRect.new()
	_screen_bg.stretch_mode = TextureRect.STRETCH_SCALE
	_screen_bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_full(_screen_bg)
	_screen_bg.mouse_filter = Control.MOUSE_FILTER_STOP
	_screen.add_child(_screen_bg)
	_screen_scroll = ScrollContainer.new()
	_full(_screen_scroll)
	_screen_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_screen_scroll.mouse_filter = Control.MOUSE_FILTER_PASS
	_screen_scroll.follow_focus = true
	_screen.add_child(_screen_scroll)
	_screen_center = _vbox(0)
	_screen_center.alignment = BoxContainer.ALIGNMENT_CENTER
	_screen_center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_screen_center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_screen_scroll.add_child(_screen_center)
	_screen.visible = false
	add_child(_screen)
	_build_map()
	_build_pause()
	_build_options()
	# 알림 글: 여러 개를 쌓아 모든 창(업무·대화·상점) 위에
	_toasts = _vbox(6)
	add_child(_toasts)
	for c in [_line, _memo, _notifs, _gauges, _column, _toasts, _panel, _phone]:
		_fade[c] = {"appear": 1.0, "cover": 1.0}


## 왼쪽 위: 시계·요일 + 지금 할 일 한 줄 (누르면 전체 메모)
func _build_line() -> void:
	_line = _pc(UiTheme.box(Color(0.984, 0.961, 0.902, 0.94), 12, Vector4(12, 7, 12, 8), Color(0, 0, 0, 0), 0, 8))
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 8)
	_line_day = _lbl("", 14, UiTheme.PAPER_INK, 700)
	h.add_child(_line_day)
	_line_arrow = DirArrow.new()
	_line_arrow.custom_minimum_size = Vector2(16, 16)
	_line_arrow.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_line_arrow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	h.add_child(_line_arrow)
	_line_obj = _lbl("", 14, UiTheme.PAPER_INK)
	_line_obj.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_line_obj.clip_text = true
	h.add_child(_line_obj)
	_line_must = _pc(UiTheme.box(Color("#f2c4a8"), 8, Vector4(6, 0, 6, 1)))
	_line_must.add_child(_lbl(_tx("obj.mandatory"), 11, UiTheme.PAPER_INK))
	_line_must.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(_line_must)
	_line_key = _kbd("H", Color(0.231, 0.204, 0.173, 0.12), UiTheme.PAPER_INK)
	_line_key.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	h.add_child(_line_key)
	_line.add_child(h)
	_clickable(_line, func() -> void: toggle_memo())
	_hud.add_child(_line)
	# 펼친 메모 (종이 쪽지)
	var memo_box := StyleBoxFlat.new()
	memo_box.bg_color = UiTheme.PAPER
	memo_box.corner_radius_top_left = 4
	memo_box.corner_radius_top_right = 14
	memo_box.corner_radius_bottom_right = 6
	memo_box.corner_radius_bottom_left = 10
	memo_box.corner_detail = 8
	memo_box.content_margin_left = 16
	memo_box.content_margin_right = 16
	memo_box.content_margin_top = 12
	memo_box.content_margin_bottom = 10
	memo_box.shadow_color = Color(0, 0, 0, 0.35)
	memo_box.shadow_size = 12
	memo_box.shadow_offset = Vector2(0, 5)
	_memo = _pc(memo_box)
	_memo.rotation = deg_to_rad(-1.0)
	var mv := _vbox(4)
	_memo.add_child(mv)
	mv.add_child(_lbl(_tx("hud.objectivePrefix"), 13, Color(0.231, 0.204, 0.173, 0.7), 700))
	_memo_list = _rt(270, 14, UiTheme.PAPER_INK)
	mv.add_child(_memo_list)
	_memo_foot = _rt(270, 12, Color(0.231, 0.204, 0.173, 0.7))
	mv.add_child(_memo_foot)
	_memo_pending = _vbox(1)
	mv.add_child(_memo_pending)
	_memo.visible = false
	_hud.add_child(_memo)


func _build_call() -> void:
	var sb := UiTheme.box(Color(0.118, 0.125, 0.157, 0.95), 18, Vector4(20, 12, 20, 14), Color(0.627, 0.824, 1, 0.6), 2).duplicate()
	sb.shadow_color = Color(0.47, 0.7, 1, 0.3)
	sb.shadow_size = 24
	_call = _pc(sb)
	_call.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var v := _vbox(6)
	_call.add_child(v)
	var who := HBoxContainer.new()
	who.alignment = BoxContainer.ALIGNMENT_CENTER
	who.add_theme_constant_override("separation", 8)
	who.add_child(_icon("ui.call", 22))
	_call_who = _lbl("", 19, UiTheme.INK, 700)
	who.add_child(_call_who)
	who.add_child(_lbl(_tx("phone.call.incoming"), 13, UiTheme.INK_DIM))
	v.add_child(who)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 10)
	# 큰 버튼 셋: 받기(Y) · 거절(N) · 문자로 대신(U)
	for pair in [["accept", "touch.accept", Color(0.56, 0.83, 0.54, 0.3)], ["decline", "touch.decline", Color(1, 1, 1, 0.08)], ["textInstead", "touch.textInstead", Color(1, 1, 1, 0.08)]]:
		var b := _pc(UiTheme.box(pair[2], 12, Vector4(14, 9, 14, 10), Color(1, 1, 1, 0.2), 1))
		b.custom_minimum_size = Vector2(128, 0)
		var h := HBoxContainer.new()
		h.alignment = BoxContainer.ALIGNMENT_CENTER
		h.add_theme_constant_override("separation", 8)
		var k := _kbd("")
		h.add_child(k)
		h.add_child(_lbl(_tx(pair[1]), 15, UiTheme.INK, 600))
		b.add_child(h)
		var action: String = pair[0]
		_clickable(b, func() -> void: _tap_action(action))
		row.add_child(b)
		_call_btns.append({"node": b, "key": k, "action": action})
	v.add_child(row)
	_call_hint = _lbl("", 12, UiTheme.INK_DIM)
	_call_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_call_hint)
	_call.visible = false
	_column.add_child(_call)


func _build_phone() -> void:
	_phone = _pc(UiTheme.box(Color("#15171d"), 28, Vector4(14, 14, 14, 14), Color("#3a3d48"), 3, 22))
	_phone.custom_minimum_size = Vector2(300, 440)
	var v := _vbox(6)
	_phone.add_child(v)
	var bar := HBoxContainer.new()
	bar.add_theme_constant_override("separation", 5)
	_phone_time = _lbl("", 12, UiTheme.INK_DIM)
	bar.add_child(_phone_time)
	var sp := Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.add_child(sp)
	for id in LIFE_IDS:
		var ib := IconBar.new()
		ib.tex = UiIcons.tex(UiIcons.life(id), 28)
		ib.custom_minimum_size = Vector2(16, 20)
		ib.tooltip_text = _tx("life." + id)
		_phone_icons.append(ib)
		bar.add_child(ib)
	var sp2 := Control.new()
	sp2.custom_minimum_size.x = 4
	bar.add_child(sp2)
	_phone_batt = Battery.new()
	_phone_batt.custom_minimum_size = Vector2(28, 14)
	bar.add_child(_phone_batt)
	v.add_child(bar)
	v.add_child(_lbl(_tx("phone.title"), 16, UiTheme.INK, 700))
	_phone_scroll = ScrollContainer.new()
	_phone_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_phone_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_phone_list = _vbox(6)
	_phone_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_phone_scroll.add_child(_phone_list)
	v.add_child(_phone_scroll)
	_phone_wait = _lbl(_tx("phone.waiting"), 12, Color("#9fc6ff"))
	v.add_child(_phone_wait)
	_phone.visible = false
	_hud.add_child(_phone)


func _build_map() -> void:
	_map = _full(Control.new())
	var bg := ColorRect.new()
	bg.color = Color(0.04, 0.04, 0.055, 0.82)
	_full(bg)
	bg.mouse_filter = Control.MOUSE_FILTER_STOP
	_map.add_child(bg)
	var v := _vbox(10)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	_full(v)
	_map.add_child(v)
	v.add_child(_center(_lbl(_tx("map.title"), 15, UiTheme.INK, 700)))
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 10)
	row.add_child(_pill_item(_tx("ui.action.zoom"), func() -> void: zoom_map(), "KeyZ"))
	row.add_child(_pill_item(_tx("ui.close"), func() -> void: close_map(), "Escape"))
	v.add_child(row)
	_map_view = MapView.new()
	_map_view.ui = self
	_map_view.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	v.add_child(_map_view)
	v.add_child(_center(_lbl(_tx("map.hint"), 12, UiTheme.INK_DIM)))
	_map.visible = false
	add_child(_map)


## 멈춤 메뉴: 계속하기 / 지도 / 설정 / 조작 / 타이틀로
func _build_pause() -> void:
	_pause = _full(Control.new())
	var bg := ColorRect.new()
	bg.color = Color(0.04, 0.04, 0.055, 0.72)
	_full(bg)
	bg.mouse_filter = Control.MOUSE_FILTER_STOP
	_pause.add_child(bg)
	var center := CenterContainer.new()
	_full(center)
	_pause.add_child(center)
	var box := _pc(UiTheme.box(Color("#1c1c23"), 18, Vector4(28, 22, 28, 22), Color(1, 1, 1, 0.08), 1, 18))
	box.custom_minimum_size.x = 320
	center.add_child(box)
	var v := _vbox(6)
	box.add_child(v)
	v.add_child(_center(_lbl(_tx("ui.pause.title"), 22, UiTheme.INK, 700)))
	v.add_child(_center(_lbl(_tx("ui.pause.note"), 12, UiTheme.INK_DIM)))
	v.add_child(_gap(8))
	_pause_first = _menu_item(_tx("ui.pause.continue"), func() -> void: close_pause(), 16, UiTheme.WARM)
	v.add_child(_pause_first)
	v.add_child(_menu_item(_tx("ui.pause.map"), func() -> void:
		close_pause()
		_map_open = true, 15, UiTheme.INK))
	v.add_child(_menu_item(_tx("ui.pause.settings"), func() -> void: toggle_options(0), 15, UiTheme.INK))
	v.add_child(_menu_item(_tx("ui.pause.controls"), func() -> void: toggle_options(1), 15, UiTheme.INK))
	v.add_child(_menu_item(_tx("ui.pause.quit"), func() -> void:
		close_pause()
		quit_to_title.emit(), 15, UiTheme.INK_DIM))
	_pause.visible = false
	add_child(_pause)


func _build_options() -> void:
	_options = _full(Control.new())
	var bg := ColorRect.new()
	bg.color = Color(0.04, 0.04, 0.055, 0.75)
	_full(bg)
	bg.mouse_filter = Control.MOUSE_FILTER_STOP
	_options.add_child(bg)
	var center := CenterContainer.new()
	_full(center)
	_options.add_child(center)
	var box := _pc(UiTheme.box(Color("#1c1c23"), 16, Vector4(22, 18, 22, 16), Color(1, 1, 1, 0.06), 1, 18))
	center.add_child(box)
	var v := _vbox(8)
	box.add_child(v)
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	var title := _lbl(_tx("options.title"), 19, UiTheme.INK, 700)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	for i in 2:
		var tab := _pill_item(_tx("ui.options.tab.settings" if i == 0 else "ui.options.tab.controls"), func() -> void: _show_opt_tab(i))
		_opt_tabs.append(tab)
		head.add_child(tab)
	v.add_child(head)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.follow_focus = true
	scroll.custom_minimum_size = Vector2(560, 440)
	v.add_child(scroll)
	var pages := _vbox(0)
	pages.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(pages)
	var sv := _vbox(4)
	pages.add_child(sv)
	_build_settings_page(sv)
	_opt_controls = _vbox(3)
	pages.add_child(_opt_controls)
	_opt_pages = [sv, _opt_controls]
	_opt_pages.append(scroll)
	var foot := HBoxContainer.new()
	foot.add_theme_constant_override("separation", 10)
	var warn := _wrap(_tx("screen.photosensitive"), 11, UiTheme.INK_DIM, 400)
	warn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	foot.add_child(warn)
	foot.add_child(_pill_item(_tx("ui.close"), func() -> void: toggle_options(), "Escape"))
	v.add_child(foot)
	_options.visible = false
	add_child(_options)
	_refresh_options()


func _build_settings_page(v: VBoxContainer) -> void:
	var rows := [
		["slider", "distortion", "options.distortion"], ["toggle", "shake", "options.shake"], ["toggle", "chromatic", "options.chromatic"],
		["toggle", "flash", "options.flash"], ["slider", "master", "options.master"], ["slider", "heartbeat", "options.heartbeat"],
		["slider", "tinnitus", "options.tinnitus"], ["toggle", "visual_cues", "options.visualCues"], ["toggle", "stress_gauge", "options.stressGauge"],
		["toggle", "symptom_gauge", "options.symptomGauge"], ["toggle", "controls_hint", "options.controlsHint"], ["toggle", "soft_glow", "options.softGlow"],
	]
	for r in rows:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		var l := _wrap(_tx(r[2]), 14, UiTheme.INK, 360)
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(l)
		var field: String = r[1]
		if r[0] == "slider":
			var sl := HSlider.new()
			sl.min_value = 0
			sl.max_value = 1
			sl.step = 0.05
			sl.custom_minimum_size = Vector2(150, 24)
			sl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			sl.value_changed.connect(func(v2: float) -> void:
				settings.set(field, v2)
				settings_changed.emit())
			row.add_child(sl)
			_option_inputs[field] = sl
		else:
			var cb := CheckButton.new()
			cb.toggled.connect(func(on: bool) -> void:
				settings.set(field, on)
				settings_changed.emit())
			row.add_child(cb)
			_option_inputs[field] = cb
		v.add_child(row)
	# 언어: 바꾸면 저장하고 다시 불러온다
	var lrow := HBoxContainer.new()
	var ll := _lbl(_tx("options.language"), 14)
	ll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lrow.add_child(ll)
	var ob := OptionButton.new()
	ob.add_item("한국어")
	ob.add_item("English")
	ob.item_selected.connect(func(i: int) -> void:
		var lang := "en" if i == 1 else "ko"
		if lang == settings.lang:
			return
		settings.lang = lang
		settings_changed.emit()
		language_changed.emit(lang))
	lrow.add_child(ob)
	_option_inputs["lang"] = ob
	v.add_child(lrow)


func _show_opt_tab(i: int) -> void:
	_opt_tab = i
	(_opt_pages[0] as Control).visible = i == 0
	(_opt_pages[1] as Control).visible = i == 1
	(_opt_pages[2] as ScrollContainer).scroll_vertical = 0
	for j in _opt_tabs.size():
		var on := j == i
		(_opt_tabs[j] as Control).set_meta("on", on)
		_style_item(_opt_tabs[j], (_opt_tabs[j] as Control).has_focus())
	if i == 1:
		_rebuild_controls_page()
	var first: Control = null
	if i == 0:
		first = _option_inputs["distortion"]
	else:
		first = _opt_controls.get_meta("first", null)
	if first != null and is_instance_valid(first):
		first.call_deferred("grab_focus")


## 조작: 동작마다 키보드·게임패드 칸 (누르면 새 키를 기다린다), 누르고 있어야 하는 동작은 누르는 방식, 기본값으로
func _rebuild_controls_page() -> void:
	if _opt_controls == null:
		return
	var keep := ""
	var fo := get_viewport().gui_get_focus_owner() if is_inside_tree() else null
	if fo != null and fo.has_meta("remap"):
		keep = fo.get_meta("remap")
	for c in _opt_controls.get_children():
		c.queue_free()
	var gi := game_input
	_opt_controls.add_child(_wrap(_tx("ui.controls.note"), 12, UiTheme.INK_DIM, 540))
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 8)
	var hl := _lbl("", 12)
	hl.custom_minimum_size.x = 196
	head.add_child(hl)
	for k in ["ui.controls.keyboard", "ui.controls.pad", "ui.controls.mode"]:
		var l := _lbl(_tx(k), 12, UiTheme.WARM, 700)
		l.custom_minimum_size.x = 96 if k != "ui.controls.mode" else 150
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		head.add_child(l)
	_opt_controls.add_child(head)
	var first: Control = null
	var refocus: Control = null
	for action in GameInput.REMAP_ORDER:
		if not gi.bindings.has(action):
			continue
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var label := _action_label(action)
		var l := _lbl(label, 13)
		l.custom_minimum_size.x = 196
		l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		l.clip_text = true
		row.add_child(l)
		for dev in ["keyboard", "pad"]:
			var capturing: bool = gi.capture != null and gi.capture["action"] == action and gi.capture["device"] == dev
			var text := _tx("ui.controls.press") if capturing else gi.device_glyph(action, dev)
			var a: String = action
			var d: String = dev
			var cell := _pill_item(text, func() -> void:
				gi.begin_capture(a, d)
				_rebuild_controls_page())
			cell.custom_minimum_size.x = 96
			cell.set_meta("remap", "%s|%s" % [action, dev])
			row.add_child(cell)
			if first == null:
				first = cell
			if keep == "%s|%s" % [action, dev]:
				refocus = cell
		if GameInput.HOLD_ACTIONS.has(action):
			var a2: String = action
			var mode_text := _tx("ui.controls.toggle") if gi.hold_mode.get(action, "hold") == "toggle" else _tx("ui.controls.hold")
			var mc := _pill_item(mode_text, func() -> void:
				gi.set_hold_mode(a2, "hold" if gi.hold_mode.get(a2, "hold") == "toggle" else "toggle")
				_rebuild_controls_page())
			mc.custom_minimum_size.x = 150
			mc.set_meta("remap", "%s|mode" % action)
			if keep == "%s|mode" % action:
				refocus = mc
			row.add_child(mc)
		_opt_controls.add_child(row)
	_opt_controls.add_child(_gap(6))
	var reset := _pill_item(_tx("ui.controls.reset"), func() -> void:
		gi.reset_to_defaults()
		_rebuild_controls_page())
	reset.set_meta("remap", "reset")
	reset.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	if keep == "reset":
		refocus = reset
	_opt_controls.add_child(reset)
	_opt_controls.set_meta("first", first)
	if refocus != null:
		refocus.call_deferred("grab_focus")


func _action_label(action: String) -> String:
	if action.begins_with("useItem"):
		return _tx("ui.action.useItem", {"n": action.substr(7)})
	if action.begins_with("reply"):
		return _tx("ui.action.reply", {"n": action.substr(5)})
	return _tx("ui.action." + action)


func _refresh_options() -> void:
	if settings == null:
		return
	for field in _option_inputs:
		var n = _option_inputs[field]
		if n is HSlider:
			n.set_value_no_signal(float(settings.get(field)))
		elif n is CheckButton:
			n.set_pressed_no_signal(bool(settings.get(field)))
		elif n is OptionButton:
			n.select(1 if settings.lang == "en" else 0)


# ───────────────────────── 알림·게이지 ─────────────────────────

func _update_toasts(dt: float) -> void:
	for i in range(_toast_items.size() - 1, -1, -1):
		var t: Dictionary = _toast_items[i]
		t["left"] -= dt
		t["age"] += dt
		var n: Control = t["node"]
		# 살며시 떠오르고, 끝에 흐려진다
		var appear := clampf(t["age"] / 0.45, 0.0, 1.0)
		n.modulate.a = minf(appear, clampf(t["left"] / 0.6, 0.0, 1.0))
		if t["left"] <= 0:
			n.queue_free()
			_toast_items.remove_at(i)


## 에너지: 가득(초록) → 지침(노랑) → 위험(주황) → 바닥(빨강, 떨림). 옆의 ▼는 지금 심리 상태 때문에 닳는 속도.
## 심리 상태 넷은 늘, 증상은 켜진 것만 (작게)
func _update_gauges(dt: float, s, playing: bool) -> void:
	var show_energy := playing and settings.stress_gauge
	var show_sym := playing and settings.symptom_gauge
	var snap: Dictionary = s.snapshot()
	var rows: Array = []
	var e := minf(1.0, float(snap["battery"]) / 100.0)
	_energy_shown += (e - _energy_shown) * minf(1.0, dt * 6)
	var tiers: Dictionary = cfg["balance"]["battery"]["tiers"]
	var pct := _energy_shown * 100
	var color := Color("#7fbf7a") if pct > float(tiers["tired"]) else Color("#e0c25a") if pct > float(tiers["danger"]) else Color("#e0904a") if pct > float(tiers["critical"]) else Color("#e05a5a")
	# 혼자만의 틈으로 차는 중이면 ▲ (누가 보고 있어 멈췄으면 Ⅱ)
	var b: Variant = s.item_break
	var d := float(snap["drainPerSec"])
	var eating := false
	if b != null:
		eating = float(_consumable(b["id"]).get("effects", {}).get("battery", 0)) > 0
	var drain := ("Ⅱ" if b["paused"] else "▲") if eating else "▼▼▼" if d >= 1.2 else "▼▼" if d >= 0.6 else "▼" if d >= 0.2 else ""
	if show_energy:
		rows.append({"label": _tx("hud.energy"), "value": _energy_shown, "color": color, "kind": "energy", "on": true, "alert": pct <= float(tiers["critical"])})
		for m in MOODS:
			rows.append(_gauge_row(m, float(snap[m]) / 100.0, dt, "mood"))
	if show_sym:
		for k in SYMPTOM_BARS:
			var v := float(s.hurry) if k == "hurry" else float(snap[k])
			var r := _gauge_row(k, v, dt, "symptom")
			if r["on"]:
				rows.append(r)
	_gauges.visible = rows.size() > 0
	_gauges.rows = rows
	_gauges.drain = drain
	_gauges.drain_up = eating and not b["paused"]
	_gauges.time = _time
	_gauges.scale = Vector2(0.82, 0.82) if _low() else Vector2.ONE
	_gauges.update_minimum_size()
	_gauges.queue_redraw()


func _gauge_row(key: String, value: float, dt: float, kind: String) -> Dictionary:
	var shown: float = _bar_shown.get(key, 0.0)
	shown += (minf(1.0, value) - shown) * minf(1.0, dt * 6)
	_bar_shown[key] = shown
	return {"label": _tx("hud." + key), "value": shown, "color": Color(BAR_COLORS[key]), "kind": kind, "on": shown > 0.05, "alert": shown >= 0.6 and (key == "meltdown" or key == "panic")}


# ───────────────────────── 왼쪽 위: 지금 할 일 ─────────────────────────

## 지금 할 일 하나: 표식이 있는 첫 목표, 없으면 보이는 첫 목표
func _current_objective(s) -> Variant:
	var vis: Array = s.objectives.visible()
	for o in vis:
		if o["def"].get("marker", "") != "":
			return o
	return vis[0] if vis.size() > 0 else null


func _update_line(s, playing: bool) -> void:
	_line.visible = playing
	if not playing:
		return
	var day: Dictionary = s.day
	_line_day.text = "%s %s" % [_tx(day["weekdayKey"], {"n": _sget(s, "vacation_day_count", 1)}), s.clock.label()]
	var o: Variant = _current_objective(s)
	if o == null:
		_line_obj.text = _tx("ui.memo.none")
		_line_must.visible = false
	else:
		var def: Dictionary = o["def"]
		var count := " (%d/%d)" % [int(o["progress"]), int(def["count"])] if float(def.get("count", 1)) > 1 else ""
		var dl := "  ~%s" % def["deadline"] if def.has("deadline") and not o.get("late", false) else ""
		_line_obj.text = _tx(def["textKey"]) + count + dl
		_line_obj.add_theme_color_override("font_color", Color("#b2533e") if o.get("late", false) else UiTheme.PAPER_INK)
		_line_must.visible = def.get("mandatory", false)
	var maxw := (300.0 if _low() else 360.0)
	_line_obj.custom_minimum_size.x = minf(maxw, UiTheme.font().get_string_size(_line_obj.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x + 2)
	# 목표 쪽 작은 화살표 (내 화면 위치 → 표식 화면 위치)
	var target: Variant = marker_target(s)
	var a: Variant = null
	if target != null:
		var me: Variant = _project(s.player.pos, 0.0)
		var there: Variant = _project(target, 0.0)
		if me != null and there != null and (there as Vector2).distance_to(me) > 24:
			a = ((there as Vector2) - (me as Vector2)).angle()
	_line_arrow.visible = a != null
	if a != null:
		_line_arrow.angle = a
		_line_arrow.queue_redraw()
	var hk := _g("toggleHints")
	_line_key.visible = hk != "" and not touch
	(_line_key.get_child(0) as Label).text = hk


func _update_memo(s, playing: bool) -> void:
	_memo.visible = playing and _memo_open
	if not _memo.visible:
		return
	var lines: Array = []
	for o in s.objectives.list:
		if o["done"] and not o["def"].get("endsDay", false):
			lines.append("[color=#3b342c73][s]%s[/s][/color]" % UiTheme.esc(_tx(o["def"]["textKey"])))
	for o in s.objectives.visible():
		var def: Dictionary = o["def"]
		var tags := ""
		if def.get("mandatory", false):
			tags += " [bgcolor=#f2c4a8][font_size=11] %s [/font_size][/bgcolor]" % UiTheme.esc(_tx("obj.mandatory"))
		if def.has("deadline") and not o.get("late", false):
			tags += " [bgcolor=#3b342c1a][font_size=11] %s [/font_size][/bgcolor]" % UiTheme.esc(_tx("obj.deadline", {"time": def["deadline"]}))
		var count := " (%d/%d)" % [int(o["progress"]), int(def["count"])] if float(def.get("count", 1)) > 1 else ""
		var body := UiTheme.esc(_tx(def["textKey"])) + count
		if o.get("late", false):
			body = "[color=#b2533e]%s[/color]" % body
		lines.append(body + tags)
	var life = s.sim.life
	var poor: bool = life.money < float(cfg["life"]["settlement"]["dailyCost"]["money"])
	var gear: Array = []
	for g in cfg["items"]["gear"]:
		if s.player.inventory["gear"].has(g["id"]):
			gear.append(g)
	var pend := _pending_rows(s)
	var sig := "%s|%s|%s|%s|%s" % [lines, life.money, poor, gear.size(), pend]
	if _sigs.get("memo") == sig:
		for n in _memo_hot:
			(n as Control).modulate.a = 0.78 + 0.22 * cos(_time * TAU / 1.4)
		return
	_sigs["memo"] = sig
	var w := 300.0
	_memo_list.custom_minimum_size.x = w
	_memo_foot.custom_minimum_size.x = w
	_memo_list.clear()
	_memo_list.append_text("[ul]%s[/ul]" % "\n".join(lines) if lines.size() > 0 else "")
	_memo_foot.clear()
	if poor:
		_memo_foot.append_text("[color=#b0402b][b]%s[/b][/color]" % UiTheme.esc(_money(life.money)))
	else:
		_memo_foot.append_text(UiTheme.esc(_money(life.money)))
	for g in gear:
		_memo_foot.add_text("  ")
		var t := UiIcons.tex(g.get("icon", ""), 32)
		if t:
			_memo_foot.add_image(t, 16, 16)
	for c in _memo_pending.get_children():
		c.queue_free()
	_memo_hot.clear()
	if pend.size() > 0:
		var sep := ColorRect.new()
		sep.color = Color(0.231, 0.204, 0.173, 0.22)
		sep.custom_minimum_size = Vector2(w, 1)
		_memo_pending.add_child(_gap(2))
		_memo_pending.add_child(sep)
		_memo_pending.add_child(_lbl(_tx("memo.pending"), 12, Color(0.231, 0.204, 0.173, 0.85), 700))
		for r in pend:
			var col := Color("#a3361f") if r["hot"] else Color("#b4573f") if r["tip"] else Color(0.231, 0.204, 0.173, 0.85)
			var rt := _rt(w, 12, col)
			var text := UiTheme.esc(r["text"])
			if r["dots"] != "":
				text += " [color=#b0573f]%s[/color]" % r["dots"]
			rt.append_text(("[b]%s[/b]" % text) if r["hot"] else text)
			_memo_pending.add_child(rt)
			if r["hot"]:
				_memo_hot.append(rt)
	_memo.reset_size()


## 미뤄 둔 연락: 피할수록 쌓이는 점(●). 다 차면 직접 찾아온다. 낮은 생활 지표에는 오르는 방법. 읽지 않은 메시지 수
func _pending_rows(s) -> Array:
	var life = s.sim.life
	var rows: Array = []
	var mx := int(cfg["life"]["stats"]["escalateAfter"])
	var contacts: Dictionary = cfg["life"]["contacts"]
	for id in contacts:
		var n: int = life.avoid_count(id)
		if n <= 0 or id == "unknownNumber":
			continue
		var c: Dictionary = contacts[id]
		var esc_on := c.has("escalation")
		var k := (n % mx if n % mx != 0 else mx) if esc_on else mini(n, mx)
		var dots := "●".repeat(k) + ("○".repeat(mx - k) if esc_on else "")
		rows.append({"text": _tx(c["nameKey"]), "dots": dots, "hot": esc_on and k >= mx - 1, "tip": false})
	for id in LIFE_IDS:
		if life.get_stat(id) < float(cfg["life"]["stats"]["lowTipBelow"]):
			rows.append({"text": _tx("tip." + id), "dots": "", "hot": false, "tip": true})
	var unread: int = _scall(s, "loud_unread", [], _loud(s).size())
	if unread > 0:
		rows.append({"text": _tx("memo.unread", {"n": unread}), "dots": "", "hot": false, "tip": false})
	return rows


## 알림이 울리는(꺼 두지 않은) 안 읽은 메시지
func _loud(s) -> Array:
	var out: Array = []
	for m in s.phone.messages:
		if not m["read"] and not m["resolved"] and not cfg["life"]["contacts"].get(m["contactId"], {}).get("muted", false):
			out.append(m)
	return out


# ───────────────────────── 아래 가운데: 행동 막대 ─────────────────────────

## 아이템 효과를 짧은 말로
func _effect_text(d: Dictionary) -> String:
	var e: Dictionary = d.get("effects", {})
	var parts: Array = []
	if e.get("battery", 0):
		parts.append(_tx("item.fx.battery"))
	if e.get("stress", 0):
		parts.append(_tx("item.fx.calm"))
	if e.get("flush", 0) or e.get("migraine", 0):
		parts.append(_tx("item.fx.symptom"))
	if e.has("soothe"):
		parts.append(_tx("item.fx.soothe", {"sec": e["soothe"]["sec"]}))
	if e.has("resist"):
		parts.append(_tx("item.fx.resist", {"sec": e["resist"]["sec"]}))
	if e.get("warpHome", false):
		parts.append(_tx("item.fx.warp"))
	if d.get("quiet", false):
		parts.append(_tx("item.fx.quiet"))
	return " · ".join(parts)


func _consumable(id: String) -> Dictionary:
	for c in cfg["items"]["consumables"]:
		if c["id"] == id:
			return c
	return {}


func _bar_mode(s) -> bool:
	var kind: String = s.mode["kind"]
	return not SCREEN_KINDS.has(kind) and not PANEL_KINDS.has(kind) and not s.phone_open


## 좁은 화면이면 칸을 줄인다 (이름·효과 없이 그림·개수만)
func _compact() -> bool:
	return _column_width() < 900


func _column_width() -> float:
	return size.x - (240.0 if touch else 32.0) - (2 * 230.0 if not touch else 0.0) * 0.0


## 가방 1~4 + 기술 + 폰: 칸마다 키(또는 패드 버튼), 켜짐은 밝게, 못 쓰면 흐리게 + 짧은 이유. 누르거나 톡
func _update_bar(s, playing: bool) -> void:
	var vis := playing and _bar_mode(s)
	_bar.visible = vis
	if not vis:
		return
	var p = s.player
	var compact := _compact()
	var inv: Dictionary = p.inventory["consumables"]
	var brk: Variant = s.item_break
	var kind: String = s.mode["kind"]
	var modal: bool = kind != "free" and kind != "peephole"
	var items: Array = []
	var slots: Array = s.bag_slots()
	var bag_max := int(cfg["items"]["bagMax"])
	for i in mini(slots.size(), bag_max):
		var id: String = slots[i]
		var d := _consumable(id)
		if d.is_empty():
			continue
		var per := int(d.get("usesPerDay", 0))
		var left: float = s.uses_left(id)
		var count := _tx("item.usesLeft", {"n": int(left), "max": per}) if per > 0 else "×%d" % int(inv.get(id, 0))
		var using: bool = brk != null and brk["id"] == id
		var reason := ""
		if p.biking:
			reason = _tx("item.state.biking")
		elif using:
			reason = _tx("item.state.watched") if brk["paused"] else _tx("item.state.using")
		elif brk != null:
			reason = _tx("item.state.busy")
		elif per > 0 and left <= 0:
			reason = _tx("item.state.done")
		elif modal:
			reason = _tx("ui.reason.busy")
		var key := _g("useItem%d" % (i + 1))
		if _pad():
			key = _g("slotUse") if i == game_input.selected_slot else ""
		items.append({"kind": "item", "i": i, "icon": d.get("icon", ""), "name": _tx(d["nameKey"]), "count": count,
			"sub": reason if reason != "" else _effect_text(d), "off": reason != "" and not using, "on": using, "key": key,
			"fill": float(brk["time"]) / maxf(0.001, float(brk["dur"])) if using else -1.0, "sel": _pad() and i == game_input.selected_slot})
	for sk in SKILLS:
		var action: String = sk[0]
		var on := false
		match action:
			"earphones": on = p.earphones
			"phonePretend": on = p.phone_pretend
			"mask": on = p.mask
			"coverCheeks": on = p.cover
			"closeEyes": on = p.eyes_closed
			"phone": on = s.phone_open
		on = on or game_input.latched(action)
		var reason := ""
		if (action == "phonePretend" or action == "phone") and p.biking:
			reason = _tx("item.state.biking")
		elif (action == "phonePretend" or action == "phone") and p.cover:
			reason = _tx("ui.reason.covering")
		elif modal and action != "phone":
			reason = _tx("ui.reason.busy")
		items.append({"kind": "skill", "action": action, "icon": sk[1], "name": _tx(sk[2]), "sub": reason, "off": reason != "", "on": on, "key": _g(action), "hold": sk[3] == "hold"})
	var sig := str(items.map(func(r): return [r.get("i", r.get("action")), r.get("name"), r.get("count", ""), r["sub"], r["off"], r["on"], r["key"], r.get("sel", false)])) + str(compact) + str(touch)
	if _sigs.get("bar") == sig:
		for j in mini(items.size(), _bar.get_child_count()):
			var n: Control = _bar.get_child(j)
			n.set_meta("fill", items[j].get("fill", -1.0))
			n.queue_redraw()
		return
	_sigs["bar"] = sig
	for c in _bar.get_children():
		c.queue_free()
	var first_skill := true
	for r in items:
		if r["kind"] == "skill" and first_skill:
			first_skill = false
			if items[0]["kind"] == "item":
				var sep := ColorRect.new()
				sep.color = Color(1, 1, 1, 0.12)
				sep.custom_minimum_size = Vector2(1, 36)
				sep.size_flags_vertical = Control.SIZE_SHRINK_CENTER
				_bar.add_child(sep)
		_bar.add_child(_bar_cell(r, compact))
	_bar.reset_size()


func _bar_cell(r: Dictionary, compact: bool) -> Control:
	var on: bool = r["on"]
	var sel: bool = r.get("sel", false)
	var border := Color("#a8d99a") if on and r["kind"] == "item" else UiTheme.WARM if on or sel else Color(1, 1, 1, 0.16)
	var bg := Color(1, 0.82, 0.4, 0.26) if on and r["kind"] == "skill" else Color(0.094, 0.094, 0.118, 0.84)
	var cell := _pc(UiTheme.box(bg, 12, Vector4(8, 18, 8, 6), border, 2 if (on or sel) else 1))
	var item := r["kind"] == "item"
	var w := (64.0 if compact else 132.0) if item else (56.0 if compact else 64.0)
	cell.custom_minimum_size = Vector2(w, 66 if not compact else 58)
	var v := _vbox(1)
	if item and not compact:
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 6)
		h.add_child(_icon(r["icon"], 26))
		var tv := _vbox(0)
		var name := _lbl(r["name"], 12, UiTheme.INK, 700)
		name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		name.clip_text = true
		name.custom_minimum_size.x = w - 50
		tv.add_child(name)
		tv.add_child(_lbl(r["count"], 11, Color(UiTheme.INK, 0.75)))
		h.add_child(tv)
		v.add_child(h)
		var sub := _lbl(r["sub"], 10, Color("#ffcf9a") if r["off"] else Color(UiTheme.INK, 0.7))
		sub.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		sub.clip_text = true
		sub.custom_minimum_size.x = w - 16
		v.add_child(sub)
	else:
		var ic := _icon(r["icon"], 24)
		ic.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		v.add_child(ic)
		var cap: String = r["count"] if item else (r["sub"] if r["off"] else r["name"])
		var l := _lbl(cap, 10, Color("#ffcf9a") if r["off"] else Color(UiTheme.INK, 0.85))
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		l.clip_text = true
		l.custom_minimum_size.x = w - 12
		v.add_child(l)
	cell.add_child(v)
	cell.modulate.a = 0.45 if r["off"] else 1.0
	cell.tooltip_text = "%s — %s" % [r["name"], r["sub"]] if r["sub"] != "" else r["name"]
	var key: String = r["key"]
	var hold: bool = r.get("hold", false)
	cell.set_meta("fill", r.get("fill", -1.0))
	# 왼쪽 위 키 이름, 누르고 있어야 하는 기술은 오른쪽 위에 작은 점(누르고 있기)
	cell.draw.connect(func() -> void:
		if key != "":
			var f := UiTheme.font(700)
			var kw := f.get_string_size(key, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x + 8
			cell.draw_style_box(UiTheme.box(Color(1, 1, 1, 0.16), 4, Vector4.ZERO), Rect2(5, 4, kw, 14))
			cell.draw_string(f, Vector2(9, 15), key, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, UiTheme.WARM)
		if hold:
			cell.draw_arc(Vector2(cell.size.x - 10, 11), 3.5, 0, TAU, 16, Color(1, 1, 1, 0.5), 1.2)
		var k: float = cell.get_meta("fill", -1.0)
		if k >= 0:
			cell.draw_rect(Rect2(6, cell.size.y - 4, (cell.size.x - 12) * clampf(k, 0, 1), 3), Color("#a8d99a")))
	if item:
		var i: int = r["i"]
		_clickable(cell, func() -> void:
			game_input.selected_slot = i
			_tap_code("Digit%d" % (i + 1)))
	else:
		var action: String = r["action"]
		_clickable(cell, func() -> void:
			if hold:
				game_input.toggle_latch(action)
			else:
				_tap_action(action))
	return cell


## 지금 쓸 수 있는 키만 (설정의 '단축키 안내'로 끈다)
func _update_hints(s, playing: bool) -> void:
	var rows: Array = _context_hints(s) if playing and settings.controls_hint and not touch else []
	_hints.visible = rows.size() > 0
	var sig := str(rows)
	if _sigs.get("hints") == sig:
		return
	_sigs["hints"] = sig
	for c in _hints.get_children():
		c.queue_free()
	for r in rows:
		if r[0] == "":
			continue
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 5)
		h.add_child(_kbd(r[0]))
		var l := _lbl(r[1], 12, UiTheme.INK)
		_shadow(l)
		h.add_child(l)
		_hints.add_child(h)


## [키 이름, 하는 일] 목록
func _context_hints(s) -> Array:
	var kind: String = s.mode["kind"]
	var pad := _pad()
	var nav := "D↑↓" if pad else "↑↓"
	var ok := game_input.code_glyph("pad:a") if pad else "Enter"
	var space := game_input.code_glyph("pad:a") if pad else "Space"
	var back := _g("pause")
	if s.phone.call != null and kind != "dialogue":
		return []
	if s.phone_open:
		return [[nav, _tx("ui.nav")], [ok, _tx("touch.reply")], [game_input.code_glyph("pad:x") if pad else "Bksp", _tx("touch.readSkip")], [_g("phone"), _tx("ui.close")]]
	match kind:
		"free", "peephole":
			var out := [[_g("sprint"), _tx("ui.action.sprint")], [_g("map"), _tx("ui.action.map")], [_g("toggleHints"), _tx("ui.action.toggleHints")], [back, _tx("ui.pause.title")]]
			if s.player.biking:
				out.remove_at(0)
			return out
		"dialogue":
			var out2 := []
			var m: Dictionary = s.mode
			if _npc_type(m["npc"]) != "ally":
				out2.append([_g("smile"), _tx("ui.action.smile")])
			if not _sget(s, "sos_used", false) and _npc_type(m["npc"]) != "ally" and s.sim.life.get_stat("bond") >= float(cfg["balance"]["sos"]["bondMin"]):
				out2.append([_g("sos"), _tx("ui.action.sos")])
			return out2
		"work":
			return [[_g("smile"), _tx("ui.action.focus")], [_g("reply1"), _tx("touch.reply")], [back, _tx("touch.break")]]
		"speech":
			return [[space, _tx("ui.action.speak")]]
		"shop":
			return [[nav, _tx("ui.nav")], [ok, _tx("ui.action.buy")], [back, _tx("ui.close")]]
		"metroMenu":
			return [[nav, _tx("ui.nav")], [ok, _tx("touch.board")], [back, _tx("ui.close")]]
		"piano":
			return [["A~J", _tx("piano.title")], [back, _tx("touch.stop")]]
		"seated":
			var out3 := [["1·2·3", _tx("ui.action.flip")]]
			if s.mode.get("toastDone", false):
				out3.append([_g("interact"), _tx("touch.leave")])
			return out3
		"rest", "laundry", "priceTag":
			return [[back, _tx("touch.stop")]]
		"elevator", "bus":
			return [[_g("interact"), _tx("ui.action.interact")]]
	return []


func _tap_code(code: String) -> void:
	game_input.tap(code)
	code_tapped.emit(code)


## 동작의 첫 키(키보드)를 톡
func _tap_action(action: String) -> void:
	for code in game_input.bindings.get(action, []):
		if not GameInput.is_pad_code(code):
			_tap_code(code)
			return


# ───────────────────────── 월드 위에 뜨는 것 ─────────────────────────

func _project(world: Vector2, height: float) -> Variant:
	if not projector.is_valid():
		return null
	return projector.call(world, height)


## 지금 할 일이 있는 곳. 다른 층이면 그 층으로 가는 계단·엘리베이터·지하철 출구를 가리킨다
func marker_target(s) -> Variant:
	var obj: Variant = null
	for o in s.objectives.visible():
		if o["def"].get("marker", "") != "":
			obj = o
			break
	if obj == null:
		return null
	var m: String = obj["def"]["marker"]
	var world_def: Dictionary = cfg["world"]
	var goal: Variant = null
	for it in world_def["interactables"]:
		if it["id"] == m:
			goal = Vector2(it["at"][0], it["at"][1])
			break
	if goal == null:
		var area: Variant = s.world.map.area(m)
		if area != null:
			var r: Array = area["rect"]
			goal = Vector2(r[0] + r[2] / 2.0, r[1] + r[3] / 2.0)
	if goal == null:
		return null
	var here: String = s.world.layer_of(s.player.pos)
	var goal_layer: String = s.world.layer_of(goal)
	if goal_layer == here:
		return goal
	# 층을 잇는 출입구: 포털과 엘리베이터
	var links: Array = []
	for p in world_def["portals"]:
		for q in world_def["portals"]:
			if q["id"] == p.get("to", ""):
				links.append([Vector2(p["at"][0], p["at"][1]), Vector2(q["arrive"][0], q["arrive"][1])])
	var fronts: Dictionary = world_def.get("elevator", {}).get("fronts", {})
	for e in world_def["interactables"]:
		if e.get("kind", "") == "elevator" and fronts.has(e.get("target", "")):
			var f: Array = fronts[e["target"]]
			links.append([Vector2(e["at"][0], e["at"][1]), Vector2(f[0], f[1])])
	var best: Variant = null
	var best_cost := INF
	for l in links:
		if s.world.layer_of(l[0]) != here:
			continue
		var to_layer: String = s.world.layer_of(l[1])
		# 목표 층으로 바로 가거나, 지상을 거쳐 가는 출입구
		if to_layer != goal_layer and to_layer != "ground":
			continue
		var cost: float = s.player.pos.distance_to(l[0]) + (l[1].distance_to(goal) if to_layer == goal_layer else 60.0)
		if cost < best_cost:
			best_cost = cost
			best = l[0]
	return best if best != null else goal


## 상호작용 안내는 한 곳: 내 머리 근처 "[F] 이름"
func _update_prompt(s, playing: bool) -> void:
	var pr: Variant = s.prompt
	var kind: String = s.mode["kind"]
	var vis: bool = playing and (kind == "free" or kind == "peephole") and pr != null and not s.phone_open
	var sp: Variant = _project(s.player.pos, 2.1) if vis else null
	_prompt.visible = sp != null
	if sp == null:
		return
	var key := "👆" if touch else _g("interact")
	((_prompt.get_child(0) as HBoxContainer).get_child(0).get_child(0) as Label).text = key
	_prompt_label.text = _tx(pr["labelKey"])
	_place(_prompt, Vector2.ZERO, (sp as Vector2) + Vector2(0, -6), Control.GROW_DIRECTION_BOTH, Control.GROW_DIRECTION_BEGIN)


func _update_monologue(s, ps, playing: bool) -> void:
	var line: Variant = s.monologue.current
	var vis: bool = playing and line != null and s.mode["kind"] != "speech"
	var p = s.player
	# 시야 앞쪽에 떠다니는 생각 (월드 좌표 → 화면 좌표). 상호작용 안내가 있으면 그 위로
	var ahead: Vector2 = p.pos + Vector2(cos(p.facing) * 0.8, minf(0.0, sin(p.facing)) * 0.8)
	var sp: Variant = _project(ahead, 2.4) if vis else null
	_mono.visible = sp != null
	if sp == null:
		return
	var text: String = line["text"]
	_mono.text = text
	var fs := 13 if _low() else 15
	_mono.add_theme_font_size_override("font_size", fs)
	var maxw := 260.0 if _low() else 340.0
	_mono.custom_minimum_size.x = minf(maxw, UiTheme.font(400, true).get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x + 26)
	var t: float = ps.time if ps != null else _time
	var flt := sin(t * 1.6) * 4
	var k := float(line["age"]) / maxf(0.01, float(line["duration"]))
	var fade := minf(1.0, minf(float(line["age"]) / 0.3, (float(line["duration"]) - float(line["age"])) / 0.5))
	var migraine: float = ps.migraine if ps != null else 0.0
	var jitter := (randf() - 0.5) * migraine * 4 if migraine > 0.2 else 0.0
	var eyes: float = ps.eyes if ps != null else 0.0
	_mono.modulate.a = maxf(0.0, fade) * (1 - eyes * 0.5)
	var lift := -40.0 if _prompt.visible else 0.0
	_place(_mono, Vector2.ZERO, (sp as Vector2) + Vector2(jitter, flt - k * 10 + lift), Control.GROW_DIRECTION_BOTH, Control.GROW_DIRECTION_BEGIN)


func _npc_type(n) -> String:
	var t: Variant = n.get("npc_type")
	if t == null:
		t = n.profile.get("type", "")
	return t


## 머리 위 인식표: 이름 대신 위협 태그
func _update_tags(s, playing: bool) -> void:
	var seen := {}
	if playing:
		var p: Vector2 = s.player.pos
		for n in s.active_npcs():
			var d: float = n.pos.distance_to(p)
			var ty := _npc_type(n)
			if d > 11 or n.state == "dialogue" or (ty == "passerby" and d > 5):
				continue
			if not s.world.map.line_of_sight(p, n.pos) and d > 3:
				continue
			var sp: Variant = _project(n.pos, 0.6 if ty == "pet" else 2.05)
			if sp == null:
				continue
			seen[n.id] = true
			var tag: PanelContainer = _tag_nodes.get(n.id)
			if tag == null:
				tag = _pc(null)
				tag.add_child(_lbl("", 11, Color("#e9e3d6")))
				_tags.add_child(tag)
				_tag_nodes[n.id] = tag
			var st := Color(0.67, 0.27, 0.22, 0.8) if n.pursuing else Color(0.7, 0.55, 0.12, 0.75) if ty == "ally" else Color(0.55, 0.39, 0.24, 0.7) if n.notice > 0.4 else Color(0.118, 0.118, 0.14, 0.62)
			tag.add_theme_stylebox_override("panel", UiTheme.box(st, 10, Vector4(8, 1, 8, 2)))
			(tag.get_child(0) as Label).text = _tx(n.profile["displayTagKey"])
			tag.modulate.a = maxf(0.25, 1 - d / 12)
			_place(tag, Vector2.ZERO, sp, Control.GROW_DIRECTION_BOTH, Control.GROW_DIRECTION_BEGIN)
	for id in _tag_nodes.keys():
		if not seen.has(id):
			_tag_nodes[id].queue_free()
			_tag_nodes.erase(id)


# ───────────────────────── 폰·전화·알림 ─────────────────────────

func _contact_name(id: String) -> String:
	return _tx(cfg["life"]["contacts"].get(id, {}).get("nameKey", id))


## 왼쪽 아래 알림: 최대 3개, 새 것이 아래
func _update_notifs(s, playing: bool) -> void:
	var unread := _loud(s)
	var vis: bool = playing and not s.phone_open and unread.size() > 0
	_notifs.visible = vis
	var shown := unread.slice(maxi(0, unread.size() - NOTIF_MAX))
	var nsig := str(shown.map(func(m): return m["id"])) + str(unread.size()) + str(_low())
	if _sigs.get("notifs") == nsig:
		return
	_sigs["notifs"] = nsig
	for c in _notifs.get_children():
		c.queue_free()
	var low := _low()
	var w := 220.0
	if unread.size() > NOTIF_MAX:
		var more := _pc(UiTheme.box(Color(0.96, 0.96, 0.98, 0.7), 10, Vector4(10, 2, 10, 3)))
		more.add_child(_lbl("+%d" % (unread.size() - NOTIF_MAX), 12, Color("#222222"), 700))
		more.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		_notifs.add_child(more)
	for m in shown:
		var b := _pc(UiTheme.box(Color(0.96, 0.96, 0.98, 0.94), 12, Vector4(9, 5, 9, 6) if low else Vector4(11, 7, 11, 8), Color(0, 0, 0, 0), 0, 8))
		var v := _vbox(1)
		v.add_child(_lbl(_contact_name(m["contactId"]), 11, Color("#555566"), 700))
		v.add_child(_wrap(_tx(m["textKey"]), 12, Color("#222222"), w - 22))
		b.add_child(v)
		_notifs.add_child(b)
	_appear(_notifs)
	_notifs.reset_size()


## 전화: 행동 막대 위에 카드 하나, 큰 버튼 셋 (받기 Y · 거절 N · 문자로 U). 피할 수 없는 전화면 받기만
func _update_call(s, playing: bool) -> void:
	var c: Variant = s.phone.call
	var vis: bool = playing and c != null
	if vis and not _call.visible:
		_appear(_call)
	_call.visible = vis
	if not vis:
		return
	var mandatory := false
	for o in s.objectives.list:
		if o["def"].get("on", "") == "answered:%s" % c["contactId"] and o["def"].get("mandatory", false) and not o["done"]:
			mandatory = true
	_call_who.text = _contact_name(c["contactId"])
	_call_hint.text = _tx("phone.call.hintMandatory") if mandatory else ""
	_call_hint.visible = mandatory
	for b in _call_btns:
		var k: PanelContainer = b["key"]
		var g := _g(b["action"])
		k.visible = g != "" and not touch
		(k.get_child(0) as Label).text = g
		(b["node"] as Control).visible = not mandatory or b["action"] == "accept"
	# 울리는 동안 떨린다 (점점 잦아든다)
	var shake := (randf() - 0.5) * 6 * maxf(0.0, 1 - float(c["ringElapsed"]) / 12.0)
	_call.position.x += shake * 0.0
	(_call.get_child(0) as Control).position.x = shake


func _update_phone(s, ps, playing: bool) -> void:
	var shown_phone: bool = playing and s.phone_open
	if shown_phone and not _phone.visible:
		_appear(_phone)
	_phone.visible = shown_phone
	if not shown_phone:
		return
	var phone = s.phone
	var msgs: Array = phone.messages.filter(func(m): return not m["resolved"])
	var snap: Dictionary = s.snapshot()
	_phone_time.text = s.clock.label()
	for i in LIFE_IDS.size():
		var ib: IconBar = _phone_icons[i]
		ib.value = s.sim.life.get_stat(LIFE_IDS[i]) / 100.0
		ib.time = _time
		ib.queue_redraw()
	_phone_batt.level = float(snap["battery"]) / 100.0
	_phone_batt.queue_redraw()
	var cursor: int = mini(int(s.phone_cursor), msgs.size() - 1)
	var psig := str(msgs.map(func(m): return [m["id"], m["read"]])) + str(cursor)
	if _sigs.get("phone") != psig:
		_sigs["phone"] = psig
		for ch in _phone_list.get_children():
			ch.queue_free()
		var sel_node: Control = null
		if msgs.is_empty():
			_phone_list.add_child(_lbl(_tx("phone.empty"), 13, UiTheme.INK_DIM))
		for i in msgs.size():
			var m: Dictionary = msgs[i]
			var sel := i == cursor
			var row := _pc(UiTheme.box(Color(0.627, 0.824, 1, 0.22) if sel else Color(1, 1, 1, 0.06), 10, Vector4(10, 8, 10, 8), UiTheme.WARM if sel else Color(0, 0, 0, 0), 1 if sel else 0))
			var v := _vbox(2)
			var name := _rt(244, 13)
			name.append_text("[b]%s[/b]%s" % [UiTheme.esc(_contact_name(m["contactId"])), "" if m["read"] else " [color=#6fb3ff]●[/color]"])
			v.add_child(name)
			v.add_child(_wrap(_tx(m["textKey"]), 13, UiTheme.INK, 244))
			row.add_child(v)
			# 칸을 누르면: 커서를 옮기고 답장 (세션의 목록 조작 그대로)
			var idx := i
			_clickable(row, func() -> void: _menu_pick(idx, cursor, "Enter"))
			_phone_list.add_child(row)
			if sel:
				sel_node = row
		if sel_node != null:
			_phone_scroll.call_deferred("ensure_control_visible", sel_node)
	_phone_wait.visible = phone.waiting_reply()
	# 진땀: 폰 화면이 흐릿해진다
	var sweat: float = ps.sweat if ps != null else 0.0
	_phone.self_modulate = Color(1, 1, 1, 1.0 - maxf(0.0, sweat - 0.5) * 0.3)


## 세션이 커서를 가진 목록(폰·상점·개찰구)의 칸을 눌렀을 때: 그 칸까지 옮기고 고른다
func _menu_pick(index: int, cursor: int, confirm_code: String) -> void:
	var codes: Array = []
	var step := "ArrowDown" if index > cursor else "ArrowUp"
	for i in absi(index - cursor):
		codes.append(step)
	codes.append(confirm_code)
	game_input.queue_codes(codes)


# ───────────────────────── 모드 창 ─────────────────────────

func _update_panel(s, ps) -> void:
	var m: Dictionary = s.mode
	var kind: String = m["kind"]
	if not PANEL_KINDS.has(kind):
		_panel.visible = false
		_panel_kind = ""
		return
	# 같은 일이 이어지는 동안은 틀을 다시 만들지 않는다 (대화는 상대가 바뀌면 새로)
	var ident := kind
	if kind == "dialogue":
		ident += str(m["battle"].get_instance_id())
	elif kind == "speech":
		ident += str(m["challenge"].get_instance_id())
	elif kind == "work":
		ident += str(m["game"].get_instance_id())
	ident += str(touch) + str(_low()) + game_input.last_device
	if ident != _panel_kind:
		_panel_kind = ident
		_sigs.erase("panel")
		for c in _panel_body.get_children():
			c.queue_free()
		_p = {}
		_appear(_panel)
		match kind:
			"dialogue":
				_build_dialogue(s, m)
			"speech":
				_build_speech(m)
			"work":
				_build_work()
	_panel.visible = true
	_panel.custom_minimum_size.x = _panel_width()
	var pw := _panel_width()
	match kind:
		"dialogue":
			_update_dialogue(s, ps, m)
		"speech":
			_update_speech(m)
		"work":
			_update_work(s, m)
		"piano":
			_rebuild_if("panel", str([m["game"].index, m["game"].last_note, m["game"].last_correct, m["game"].done]), func(): _build_piano(m))
		"seated":
			_update_seated(m)
		"shop":
			_rebuild_if("panel", str([m["shopId"], m["cursor"], s.bag_count(), s.sim.life.money, s.player.inventory["consumables"]]), func(): _build_shop(s, m, pw))
		"metroMenu":
			_rebuild_if("panel", str([m["from"], m["cursor"], s.sim.life.money]), func(): _build_metro(s, m, pw))


func _rebuild_if(key: String, sig: String, build: Callable) -> void:
	if _sigs.get(key) == sig:
		return
	_sigs[key] = sig
	for c in _panel_body.get_children():
		c.queue_free()
	build.call()


func _panel_width() -> float:
	if touch:
		return minf(620.0, size.x - 260.0)
	return minf(720.0, size.x - 2 * 250.0)


func _inner_width() -> float:
	return _panel_width() - 40.0


func _build_dialogue(s, m: Dictionary) -> void:
	var npc = m["npc"]
	var ally := _npc_type(npc) == "ally"
	var w := _inner_width()
	var root := _vbox(4)
	_panel_body.add_child(root)
	if ally:
		# 내 사람: 왼쪽에 노란 줄
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(0, 0, 0, 0)
		sb.border_color = Color("#f2c94c")
		sb.border_width_left = 4
		sb.content_margin_left = 12
		var wrapper := _pc(sb)
		root.add_child(wrapper)
		var inner := _vbox(4)
		wrapper.add_child(inner)
		root = inner
		w -= 16
	var coach_sb := StyleBoxFlat.new()
	coach_sb.bg_color = Color(0.949, 0.788, 0.298, 0.16)
	coach_sb.border_color = Color("#f2c94c")
	coach_sb.border_width_left = 3
	coach_sb.set_corner_radius_all(8)
	coach_sb.content_margin_left = 10
	coach_sb.content_margin_right = 10
	coach_sb.content_margin_top = 5
	coach_sb.content_margin_bottom = 6
	var coach := _pc(coach_sb)
	var ch := HBoxContainer.new()
	ch.add_theme_constant_override("separation", 6)
	ch.add_child(_icon("ui.bulb", 16))
	var coach_l := _wrap("", 13, Color("#fff3c9"), w - 46)
	ch.add_child(coach_l)
	coach.add_child(ch)
	root.add_child(coach)
	# 누구: 얼굴(만족도) + 인식표, 오른쪽에 말투·사이 한 줄
	var who := HBoxContainer.new()
	who.add_theme_constant_override("separation", 8)
	var face := _pc(UiTheme.box(Color(npc.profile.get("color", "#888888")), 15, Vector4(4, 4, 4, 4)))
	var face_icon := _icon("ui.face1", 22)
	face.add_child(face_icon)
	who.add_child(face)
	var who_l := _lbl(_tx(npc.profile["displayTagKey"]), 13, UiTheme.INK_DIM)
	who_l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	who.add_child(who_l)
	var style := _lbl("", 12, Color("#cfc6b4"), 400, true)
	style.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	style.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	style.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	style.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	style.clip_text = true
	style.custom_minimum_size.x = 80
	who.add_child(style)
	root.add_child(who)
	var bubble := _wrap("", 17, UiTheme.INK, w)
	bubble.custom_minimum_size.y = 28
	root.add_child(bubble)
	var me_m := MarginContainer.new()
	me_m.add_theme_constant_override("margin_left", 24)
	var me := _wrap("", 14, Color("#bcd8ff"), w - 24)
	me_m.add_child(me)
	root.add_child(me_m)
	# 타이밍: 대사가 끝나는 곳의 반응 구간(노랑)·틈(초록), 왼쪽엔 미소 상태
	var trow := HBoxContainer.new()
	trow.add_theme_constant_override("separation", 10)
	var smile := _pc(UiTheme.box(Color(0.56, 0.83, 0.54, 0.22), 9, Vector4(8, 2, 8, 3)))
	var smile_l := _lbl("", 12, UiTheme.INK, 600)
	smile.add_child(smile_l)
	smile.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	trow.add_child(smile)
	var legend := _lbl(_tx("ui.timing.legend"), 11, UiTheme.INK_DIM)
	legend.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	legend.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	legend.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	legend.clip_text = true
	legend.custom_minimum_size.x = 60
	legend.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	trow.add_child(legend)
	root.add_child(_gap(2))
	root.add_child(trow)
	var timing := Bar.new()
	timing.setup(Color(1, 1, 1, 0.5), Color(1, 1, 1, 0.1), 10)
	root.add_child(timing)
	root.add_child(_gap(6))
	# 반응 넷: 큰 버튼 (키 · 이름 · 언제 쓰는지)
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	var choices: Array = []
	var cw := (w - 24) / 4.0
	for i in 4:
		var cell := _pc(UiTheme.box(Color(1, 1, 1, 0.07), 10, Vector4(9, 7, 9, 8)))
		cell.custom_minimum_size = Vector2(cw, 62)
		var v := _vbox(2)
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 6)
		var k := _kbd(_g("reply%d" % (i + 1)))
		k.visible = not touch
		k.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		h.add_child(k)
		var t := _wrap(_tx("dialogue.reply." + REPLIES[i]), 14, UiTheme.INK, cw - (18 if touch else 50), 600)
		h.add_child(t)
		v.add_child(h)
		v.add_child(_wrap(_tx("ui.reply.for." + REPLIES[i]), 11, UiTheme.INK_DIM, cw - 18))
		cell.add_child(v)
		_clickable(cell, func() -> void: _tap_code("Digit%d" % (i + 1)))
		grid.add_child(cell)
		choices.append(cell)
	root.add_child(grid)
	var foot := HBoxContainer.new()
	foot.add_theme_constant_override("separation", 16)
	var sos_p := _lbl("", 12, Color("#ffe08a"))
	var boss := _lbl(_tx("ui.timing.wait"), 12, Color("#ffb39a"))
	foot.add_child(sos_p)
	foot.add_child(boss)
	root.add_child(foot)
	_p = {"coach": coach, "coach_l": coach_l, "face": face_icon, "style": style, "bubble": bubble, "me": me, "me_m": me_m,
		"timing": timing, "trow": trow, "smile": smile, "smile_l": smile_l, "grid": grid, "choices": choices, "foot": foot,
		"sos_p": sos_p, "boss": boss, "ally": ally}


func _update_dialogue(s, ps, m: Dictionary) -> void:
	if _p.is_empty():
		return
	var b = m["battle"]
	var npc = m["npc"]
	var line: Dictionary = b.current_line()
	var ended: bool = b.ended()
	var text: String = line.get("text", "")
	var typed := mini(text.length(), ceili(text.length() * minf(1.0, b.line_progress() * 1.25)))
	var npc_text: String = (m.get("closer") if m.get("closer") != null else "") if ended else text.substr(0, typed)
	# 홍조: 상대 목소리가 작게 들린다 (글자가 흐려짐)
	var flush: float = ps.flush if ps != null else 0.0
	var volume := maxf(0.45, 1 - flush * 0.5)
	var bubble: Label = _p["bubble"]
	bubble.text = npc_text
	bubble.modulate.a = volume
	bubble.add_theme_font_size_override("font_size", int(15 + volume * 4))
	var sat: float = b.satisfaction
	(_p["face"] as TextureRect).texture = UiIcons.tex("ui.face3" if sat >= 80 else "ui.face2" if sat >= 45 else "ui.face1" if sat >= 15 else "ui.face0", 44)
	var ally: bool = _p["ally"]
	var ease: float = 0.0 if ally else s.reputation.ease(s.reputation.person_of_npc(npc.id))
	var rapport := "warm" if ease >= 0.3 else "hurt" if ease <= -0.3 else ""
	var hint_key: String = npc.profile.get("talkStyle", {}).get("hintKey", "")
	var style: Label = _p["style"]
	style.text = _tx("dialogue.rapport." + rapport) if rapport != "" else (_tx(hint_key) if hint_key != "" else "")
	style.add_theme_color_override("font_color", Color("#f2d98a") if rapport == "warm" else Color("#b9b4c9") if rapport == "hurt" else Color("#cfc6b4"))
	style.tooltip_text = _tx(hint_key) if hint_key != "" else ""
	style.visible = not ended
	var coach: Control = _p["coach"]
	coach.visible = m.get("practice", false) and not ended
	if coach.visible:
		(_p["coach_l"] as Label).text = _tx(_coach_key(m))
	var my_line: Variant = m.get("myLine")
	var my := _tx(my_line) if my_line != null and my_line != "" and float(m.get("myLineTime", 9)) < 1.6 else ""
	if my != "" and s.sim.somatic.active("stutter"):
		my = SpeechChallenge.stutter_text(my)
	(_p["me"] as Label).text = my
	(_p["me_m"] as Control).visible = my != ""
	var timing: Bar = _p["timing"]
	for k in ["timing", "trow", "grid", "foot"]:
		(_p[k] as Control).visible = not ended
	if ended:
		return
	# 미소: 유지 중이면 초록, 풀리면 붉게 + 누를 키
	var smiling: bool = m.get("smiling", false)
	var sm: PanelContainer = _p["smile"]
	sm.visible = not ally
	(_p["smile_l"] as Label).text = _tx("ui.smile.on") if smiling else _tx("ui.smile.off", {"key": _g("smile") if not touch else _tx("touch.smile")})
	sm.add_theme_stylebox_override("panel", UiTheme.box(Color(0.56, 0.83, 0.54, 0.24) if smiling else Color(0.88, 0.42, 0.35, 0.3 + 0.15 * sin(_time * 6)), 9, Vector4(8, 2, 8, 3)))
	var dur := maxf(0.01, float(line.get("durationSec", 1)))
	var window_w: float = b.window_sec() / dur
	var opening: bool = line.get("kind", "") == "opening"
	timing.value = b.line_progress()
	timing.window = Vector2(1 - window_w, 1 + window_w)
	timing.window_color = Color(0.51, 0.9, 0.59, 0.75) if opening else Color(1, 0.82, 0.4, 0.5)
	timing.marker = b.line_progress()
	timing.queue_redraw()
	var in_window: bool = b.in_window()
	var can_exit: bool = b.can_exit_now()
	for i in 4:
		var cell: PanelContainer = _p["choices"][i]
		var exit := REPLIES[i] == "exit"
		var hot := in_window and (opening and can_exit if exit else true)
		var col := (Color(0.51, 0.9, 0.59, 0.32) if exit else Color(1, 0.82, 0.4, 0.22)) if hot else Color(1, 1, 1, 0.07)
		var border := (Color(0.51, 0.9, 0.59, 0.9) if exit else Color(1, 0.82, 0.4, 0.8)) if hot else Color(1, 1, 1, 0.14)
		cell.add_theme_stylebox_override("panel", UiTheme.box(col, 10, Vector4(9, 7, 9, 8), border, 2 if hot else 1))
	# 편두통: 선택지 진동
	var migraine: float = ps.migraine if ps != null else 0.0
	(_p["grid"] as Control).position.x = (randf() - 0.5) * migraine * 5 if migraine > 0.2 else 0.0
	var sp: Label = _p["sos_p"]
	sp.visible = b.sos_pending()
	if sp.visible:
		sp.text = "%s %d" % [_tx("dialogue.sosPending"), ceili(b.sos_remaining())]
	(_p["boss"] as Control).visible = not can_exit
	(_p["foot"] as Control).visible = sp.visible or not can_exit


## 연습 대화: 지금 무엇을 하면 되는지 한 줄씩
func _coach_key(m: Dictionary) -> String:
	var b = m["battle"]
	if float(m.get("wrongAge", 99)) < 2.5:
		return "coach.wrong"
	if not m.get("smiling", false):
		return "coach.smile"
	var kind: String = b.current_line().get("kind", "")
	if kind == "opening":
		return "coach.parryNow" if b.in_window() else "coach.opening"
	return "coach." + kind


func _build_speech(m: Dictionary) -> void:
	var w := _inner_width()
	var sp: Dictionary = cfg["speeches"][m["speechId"]]
	var root := _vbox(8)
	root.add_child(_wrap(_tx(sp["introKey"]), 13, UiTheme.INK_DIM, w))
	var line := _rt(w, 20)
	root.add_child(line)
	var beat := Bar.new()
	beat.setup(Color(0, 0, 0, 0), Color(1, 1, 1, 0.1), 14)
	beat.window_color = Color(0.51, 0.9, 0.59, 0.55)
	root.add_child(beat)
	_panel_body.add_child(root)
	_p = {"line": line, "beat": beat, "sig": ""}


func _update_speech(m: Dictionary) -> void:
	if _p.is_empty():
		return
	var ch = m["challenge"]
	var parts: Array = []
	for wd in ch.spoken:
		var clean: bool = wd["clean"]
		parts.append("[color=%s]%s[/color]" % ["#fffaf0" if clean else "#ffb3a1", UiTheme.esc(wd["text"] if clean else SpeechChallenge.stutter_text(wd["text"]))])
	for i in range(ch.index, ch.chunks.size()):
		parts.append("[color=#ffffff47]%s[/color]" % UiTheme.esc(ch.chunks[i]))
	var text := " ".join(parts)
	if _p["sig"] != text:
		_p["sig"] = text
		var rt: RichTextLabel = _p["line"]
		rt.clear()
		rt.append_text(text)
	var done: bool = ch.done()
	var beat: Bar = _p["beat"]
	beat.visible = not done
	if not done:
		var z: Dictionary = ch.zone()
		beat.window = Vector2(z["from"], z["to"])
		beat.marker = ch.marker
		beat.queue_redraw()


func _build_work() -> void:
	var w := _inner_width()
	var root := _vbox(8)
	var title := _lbl("", 14, UiTheme.INK, 700)
	root.add_child(title)
	var prog := Bar.new()
	prog.setup(Color("#8fb7e8"), Color(1, 1, 1, 0.1), 10)
	root.add_child(prog)
	var pings := HFlowContainer.new()
	pings.add_theme_constant_override("h_separation", 6)
	pings.add_theme_constant_override("v_separation", 6)
	pings.custom_minimum_size.x = w
	root.add_child(pings)
	var standing := HBoxContainer.new()
	standing.add_theme_constant_override("separation", 8)
	standing.add_child(_icon("ui.income", 16))
	standing.add_child(_lbl(_tx("life.income"), 12))
	var rep := Bar.new()
	rep.setup(Color("#e8c37a"), Color(1, 1, 1, 0.12), 6)
	rep.custom_minimum_size.x = 160
	rep.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	standing.add_child(rep)
	root.add_child(standing)
	var log := _vbox(1)
	root.add_child(log)
	var nudge := _lbl(_tx("work.nudge"), 13, UiTheme.WARM, 600)
	root.add_child(nudge)
	_panel_body.add_child(root)
	_p = {"title": title, "prog": prog, "pings": pings, "rep": rep, "log": log, "nudge": nudge, "psig": "", "lsig": ""}


## 업무 화면: 진행, 메신저(놓치면 어떻게 되는지), 업무 평판 막대와 방금 바뀐 이유, 집중 안내
func _update_work(s, m: Dictionary) -> void:
	if _p.is_empty():
		return
	var g = m["game"]
	(_p["title"] as Label).text = "%s · %d/%d" % [_tx("work.title"), g.tasks_done, g.tasks]
	var prog: Bar = _p["prog"]
	prog.value = g.progress / 100.0
	prog.queue_redraw()
	var work: Variant = s.day.get("work")
	var timeout := float(work.get("pingTimeoutSec", 4)) if work is Dictionary else 4.0
	var psig := str(g.pings.map(func(p): return p["id"]))
	var pings: HFlowContainer = _p["pings"]
	if _p["psig"] != psig:
		_p["psig"] = psig
		for c in pings.get_children():
			c.queue_free()
		for p in g.pings:
			var from: String = p["from"]
			var b := _pc(UiTheme.box(Color(0.98, 0.98, 1, 0.95), 8, Vector4(10, 5, 10, 6)))
			var v := _vbox(2)
			var head := HBoxContainer.new()
			head.add_theme_constant_override("separation", 5)
			if not touch:
				head.add_child(_kbd(_g("reply1"), Color(0, 0, 0, 0.1), Color("#222222")))
			var hl := _rt(0, 12, Color("#222222"))
			hl.autowrap_mode = TextServer.AUTOWRAP_OFF
			hl.append_text("[b]%s[/b] %s" % [UiTheme.esc(_tx("work.ping")), UiTheme.esc(_tx("work.ping." + from))])
			head.add_child(hl)
			v.add_child(head)
			v.add_child(_lbl(_tx("work.cost." + from), 11, Color("#b4493a") if from == "boss" else Color("#4f8f45") if from == "team" else Color("#666677")))
			b.add_child(v)
			_clickable(b, func() -> void: _tap_code("Digit1"))
			pings.add_child(b)
	var kids := pings.get_children()
	for i in mini(kids.size(), g.pings.size()):
		var age := float(g.pings[i]["age"]) / timeout
		(kids[i] as Control).self_modulate.a = clampf((0.95 - age * 0.4) / 0.95, 0.3, 1.0)
	var income: float = s.sim.life.get_stat("income")
	var rep: Bar = _p["rep"]
	rep.value = income / 100.0
	rep.fill = Color("#e07a6a") if income < 40 else Color("#e8c37a")
	rep.queue_redraw()
	var ledger: Array = s.sim.life.ledger
	var rows: Array = []
	for i in range(int(m.get("ledgerFrom", 0)), ledger.size()):
		if ledger[i]["stat"] == "income":
			rows.append(ledger[i])
	rows = rows.slice(maxi(0, rows.size() - 3))
	rows.reverse()
	var lsig := str(rows)
	if _p["lsig"] != lsig:
		_p["lsig"] = lsig
		var log: VBoxContainer = _p["log"]
		for c in log.get_children():
			c.queue_free()
		for c in rows:
			var down: bool = c["delta"] < 0
			log.add_child(_wrap(("▼ " if down else "▲ ") + _why_text(s, c), 12, UiTheme.DOWN if down else UiTheme.UP, _inner_width()))
	var nudge: Label = _p["nudge"]
	nudge.visible = float(m.get("idle", 0)) > 2.5
	nudge.modulate.a = 0.55 + 0.45 * (0.5 + 0.5 * sin(_time * PI))


func _why_text(s, c: Dictionary) -> String:
	if s.has_method("life_why_text"):
		return s.life_why_text(c)
	return _tx("why." + str(c.get("why", "")))


func _build_piano(m: Dictionary) -> void:
	var g = m["game"]
	var keys := ["A", "S", "D", "F", "G", "H", "J"]
	var root := _vbox(8)
	root.add_child(_lbl("%s · %d/%d" % [_tx("piano.title"), g.index, g.melody.size()], 14, UiTheme.INK, 700))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	var kw := (_inner_width() - 36) / 7.0
	for i in 7:
		var bg := Color("#f4efe6")
		if g.last_note == i:
			bg = Color("#e6f4dd") if g.last_correct else Color("#f6e1dc")
		var sb := StyleBoxFlat.new()
		sb.bg_color = bg
		sb.corner_radius_bottom_left = 8
		sb.corner_radius_bottom_right = 8
		sb.content_margin_bottom = 8
		if g.expected == i and not g.done:
			sb.border_color = Color("#f2c94c")
			sb.border_width_bottom = 6
		var key := _pc(sb)
		key.custom_minimum_size = Vector2(kw, 90)
		var v := _vbox(2)
		v.alignment = BoxContainer.ALIGNMENT_END
		v.add_child(_center(_lbl(_tx("touch.note%d" % (i + 1)), 13, Color("#444444"))))
		var k := _kbd(keys[i], Color(0, 0, 0, 0.08), Color("#444444"))
		k.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		k.visible = not touch
		v.add_child(k)
		key.add_child(v)
		var code: String = "Key" + keys[i]
		_clickable(key, func() -> void: _tap_code(code))
		row.add_child(key)
	root.add_child(row)
	if g.done:
		root.add_child(_wrap(_tx("piano.done"), 12, UiTheme.INK_DIM, _inner_width()))
	_panel_body.add_child(root)


func _update_seated(m: Dictionary) -> void:
	var g = m["grill"]
	var states: Array = []
	for i in 3:
		states.append([g.state(i), snappedf(minf(1.0, float(g.slots[i]["t"]) / (g.cook_sec + g.burn_sec)), 0.02)])
	var sig := str([states, m.get("toastDone", false), float(m.get("distractedFor", 0)) > 0, touch])
	_rebuild_if("panel", sig, func():
		var root := _vbox(10)
		var row := HBoxContainer.new()
		row.alignment = BoxContainer.ALIGNMENT_CENTER
		row.add_theme_constant_override("separation", 14)
		for i in 3:
			var st: String = states[i][0]
			var k: float = states[i][1]
			var col := Color("#2b2522") if st == "burnt" else _hsl(k * 20, 0.6 - k * 0.4, 0.7 - k * 0.45)
			var meat := _pc(UiTheme.box(col, 14, Vector4(0, 0, 0, 4), Color("#f2c94c"), 3 if st == "cooked" else 0))
			meat.custom_minimum_size = Vector2(90, 56)
			var kb := _kbd(str(i + 1))
			kb.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			kb.size_flags_vertical = Control.SIZE_SHRINK_END
			meat.add_child(kb)
			_clickable(meat, func() -> void: _tap_code("Digit%d" % (i + 1)))
			row.add_child(meat)
		root.add_child(row)
		root.add_child(_center(_wrap(_tx("dinner.grill.hint"), 12, UiTheme.INK_DIM, _inner_width())))
		if m.get("toastDone", false):
			var now := float(m.get("distractedFor", 0)) > 0
			var l := _lbl(_tx("dinner.leaveNow" if now else "dinner.leave"), 14, Color("#9de3a8") if now else UiTheme.INK, 700 if now else 400)
			root.add_child(_center(l))
		_panel_body.add_child(root))


static func _hsl(h: float, s: float, l: float) -> Color:
	var c := (1 - absf(2 * l - 1)) * s
	var hp := fposmod(h, 360.0) / 60.0
	var x := c * (1 - absf(fmod(hp, 2.0) - 1))
	var rgb := Vector3(c, x, 0) if hp < 1 else Vector3(x, c, 0) if hp < 2 else Vector3(0, c, x) if hp < 3 else Vector3(0, x, c) if hp < 4 else Vector3(x, 0, c) if hp < 5 else Vector3(c, 0, x)
	var mm := l - c / 2
	return Color(rgb.x + mm, rgb.y + mm, rgb.z + mm)


## 상점·지하철 공용 목록 (이름·설명·가진 것·값). 칸을 누르면 그 칸까지 옮기고 고른다
func _list_panel(title: String, right: String, rows: Array, cursor: int, pw: float) -> void:
	var w := pw - 40.0
	var root := _vbox(8)
	var head := HBoxContainer.new()
	var tl := _lbl(title, 16, UiTheme.INK, 700)
	tl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(tl)
	head.add_child(_lbl(right, 13, UiTheme.INK_DIM))
	root.add_child(head)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var list := _vbox(2)
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(list)
	var name_w := 150.0
	var sel_node: Control = null
	for i in rows.size():
		var r: Dictionary = rows[i]
		var sel := i == cursor
		var row := _pc(UiTheme.box(Color(0.627, 0.824, 1, 0.22) if sel else Color(0, 0, 0, 0), 8, Vector4(10, 6, 10, 6), UiTheme.WARM if sel else Color(0, 0, 0, 0), 1 if sel else 0))
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 10)
		var nm := HBoxContainer.new()
		nm.add_theme_constant_override("separation", 6)
		nm.custom_minimum_size.x = name_w
		if r.get("icon", "") != "":
			nm.add_child(_icon(r["icon"], 22))
		var nl := _wrap(r["name"], 14, UiTheme.INK, name_w - 28)
		nl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		nm.add_child(nl)
		h.add_child(nm)
		var desc := _rt(maxf(80.0, w - name_w - 160), 12, UiTheme.INK_DIM)
		desc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		desc.append_text(UiTheme.esc(r["desc"]) + (" [color=#9fc6ff][font_size=11]%s[/font_size][/color]" % UiTheme.esc(r["note"]) if r.get("note", "") != "" else ""))
		desc.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(desc)
		var have := _lbl(r.get("have", ""), 12, UiTheme.WARM)
		have.custom_minimum_size.x = 36
		have.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(have)
		var price := _lbl(r["price"], 14)
		price.custom_minimum_size.x = 84
		price.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		price.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(price)
		row.add_child(h)
		row.modulate.a = 0.45 if r.get("out", false) else 1.0
		var idx := i
		_clickable(row, func() -> void: _menu_pick(idx, cursor, "Enter"))
		list.add_child(row)
		if sel:
			sel_node = row
	# 낮은 화면: 목록이 넘치면 안에서 넘긴다
	var max_h := size.y - 300.0
	scroll.custom_minimum_size.y = clampf(rows.size() * 40.0, 40.0, maxf(120.0, max_h))
	root.add_child(scroll)
	_panel_body.add_child(root)
	if sel_node != null:
		scroll.call_deferred("ensure_control_visible", sel_node)


func _build_shop(s, m: Dictionary, pw: float) -> void:
	var shop: Dictionary = cfg["items"]["shops"][m["shopId"]]
	var inv: Dictionary = s.player.inventory["consumables"]
	var icons := {"income": "💼", "housing": "🏠", "essentials": "🛒", "bond": "💛"}
	var rows: Array = []
	for e in shop["stock"]:
		var item: String = e["item"]
		var def := _consumable(item)
		if def.is_empty():
			for g in cfg["items"]["gear"]:
				if g["id"] == item:
					def = g
		var have := "✓" if s.player.inventory["gear"].has(item) else ("×%d" % int(inv[item])) if int(inv.get(item, 0)) > 0 else ""
		# 값: 돈, 생활 지표(집 찬장), 무료(탕비실, 남은 개수)
		var left: float = _scall(s, "shop_left", [m["shopId"], item], INF)
		var life_cost: Array = []
		for k in e.get("life", {}):
			life_cost.append("%s%s" % [icons.get(k, k), _num(e["life"][k])])
		var price := _money(float(e["price"])) if float(e.get("price", 0)) > 0 else (" ".join(life_cost) if life_cost.size() > 0 else _tx("shop.free"))
		var note := "" if is_inf(left) else (_tx("shop.left", {"n": int(left)}) if left > 0 else _tx("shop.soldOut"))
		rows.append({"icon": def.get("icon", ""), "name": _tx(def.get("nameKey", item)), "desc": _tx(def.get("nameKey", item) + ".desc"), "note": note, "have": have, "price": price, "out": left <= 0})
	var right := "%d/%d · %s" % [s.bag_count(), int(cfg["items"]["bagMax"]), _money(s.sim.life.money)]
	_list_panel(_tx(shop["titleKey"]), right, rows, int(m["cursor"]), pw)


static func _num(v) -> String:
	var f := float(v)
	return str(int(f)) if f == floorf(f) else str(f)


## 지하철 개찰구: 갈 역 고르기 (정거장 수·걸리는 시간·요금)
func _build_metro(s, m: Dictionary, pw: float) -> void:
	var st: Dictionary = cfg["world"]["metro"]["stations"]
	var mc: Dictionary = cfg["balance"]["metro"]
	var rows: Array = []
	for d in _scall(s, "metro_destinations", [m["from"]], []):
		rows.append({"icon": "ui.metro", "name": _tx(st[d["id"]]["nameKey"]), "desc": _tx("metro.stops", {"n": int(d["stops"]), "min": int(d["stops"] * float(mc["minutesPerStop"]))}), "price": _money(float(mc["fare"]))})
	_list_panel(_tx("metro.title", {"name": _tx(st[m["from"]]["nameKey"])}), _money(s.sim.life.money), rows, int(m["cursor"]), pw)


func _update_qte(s) -> void:
	var q: Variant = s.qte
	_qte.visible = q != null
	if q == null:
		return
	_qte_label.text = _tx("qte.laugh" if q["kind"] == "laugh" else "knock.prompt")
	_qte_bar.value = maxf(0.0, 1 - float(q["timer"]) / maxf(0.01, float(q["window"])))
	_qte_bar.queue_redraw()
	_place(_qte, Vector2(0.5, 0.3), Vector2.ZERO, Control.GROW_DIRECTION_BOTH, Control.GROW_DIRECTION_BOTH)


## 엘리베이터·버스·셀프 계산대·외시경·가격 택·안전지대·조용한 곳 등 지금 상태 한 줄 (행동 막대 위)
func _update_status(s, playing: bool) -> void:
	var m: Dictionary = s.mode
	var kind: String = m["kind"]
	var text := ""
	match kind:
		"elevator":
			text = _tx("elevator.waiting") if m["phase"] == "waiting" else _tx("elevator.ride") if m["phase"] == "closing" else "▼ ▲  " + ("…" if m.get("companion") != null else "")
		"metro":
			var st: Dictionary = cfg["world"]["metro"]["stations"]
			text = _tx("metro.riding", {"name": _tx(st[m["to"]]["nameKey"]), "pct": roundi(float(m["timer"]) / maxf(0.01, float(m["total"])) * 100)})
		"bus":
			var stops: Dictionary = cfg["world"].get("bus", {}).get("stops", {})
			var dest := _tx(stops.get(m["to"], {}).get("nameKey", m["to"]))
			text = _tx("bus.waiting", {"dest": dest, "min": ceili(float(_scall(s, "bus_wait_min", [], 0.0)))}) if m["phase"] == "waiting" else _tx("bus.ridingAwkward" if m.get("awkward", false) else "bus.riding", {"dest": dest})
		"selfCheckout":
			text = "%s %d%%" % [_tx("checkout.self.waiting"), roundi(float(m["timer"]) / maxf(0.01, float(m["total"])) * 100)]
		"priceTag":
			text = "%s  %s" % [_tx("priceTag.hint"), _ticks(float(m["progress"]))]
		"peephole":
			text = _tx("peephole.view")
		"rest":
			text = _tx("bench.done" if m["what"] == "bench" else "browse.start" if m["what"] == "books" else "window.done")
		"laundry":
			text = "%s  %s" % [_tx("laundry.waiting"), _ticks(minf(1.0, float(m["time"]) / float(cfg["balance"]["laundry"]["waitSec"])))]
		_:
			var p = s.player
			if p.locked_safe != null:
				text = _tx("safe.locked")
			elif p.biking and kind == "free":
				text = _tx("bike.riding")
			elif s.quiet_here != null:
				text = _tx("quiet.here", {"name": _tx(s.quiet_here["nameKey"])})
			elif p.hidden:
				text = _tx("hud.hiding")
			elif s.sanctuary():
				text = _tx("hud.sanctuary")
			elif kind == "seated":
				text = _tx("dinner.focusBuff")
	_status.visible = playing and text != ""
	_status_label.text = text


## 진행 막대를 글자로 (■□)
static func _ticks(k: float) -> String:
	var n := roundi(clampf(k, 0, 1) * 10)
	return "■".repeat(n) + "□".repeat(10 - n)


# ───────────────────────── 지도 ─────────────────────────

func _update_map(s) -> void:
	if _map_open and not _map.visible:
		_appear(_map.get_child(1))
	_map.visible = _map_open
	if not _map_open:
		return
	if _minimap == null:
		_minimap = build_minimap(s.world.map)
	var tex := _minimap
	var aspect := float(tex.get_width()) / float(tex.get_height()) if _map_city else 2.0
	var max_w := size.x * 0.9
	var max_h := size.y * (0.66 if _low() else 0.7)
	var dw := minf(max_w, max_h * aspect)
	_map_view.custom_minimum_size = Vector2(dw, dw / aspect)
	_map_view.session = s
	_map_view.tex = tex
	_map_view.city = _map_city
	_map_view.queue_redraw()


## 타일 색으로 도시 지도를 만든다 (1칸 = 1px). main이 렌더러의 지도를 set_minimap으로 주면 그쪽을 쓴다
static func build_minimap(grid) -> Texture2D:
	var w: int = grid.width
	var h: int = grid.height
	var cols := PackedByteArray()
	for d in grid.defs:
		var c := Color(d.get("color", "#1f1c24"))
		if not d.get("walk", true):
			c = c.darkened(0.12)
		cols.append_array([c.r8, c.g8, c.b8])
	var data := PackedByteArray()
	data.resize(w * h * 3)
	var tiles: PackedInt32Array = grid.tiles
	var j := 0
	for i in w * h:
		var t := tiles[i] * 3
		data[j] = cols[t]
		data[j + 1] = cols[t + 1]
		data[j + 2] = cols[t + 2]
		j += 3
	var img := Image.create_from_data(w, h, false, Image.FORMAT_RGB8, data)
	return ImageTexture.create_from_image(img)


# ───────────────────────── 화면 ─────────────────────────

func _update_screen(s, ps) -> void:
	var m: Dictionary = s.mode
	var kind: String = m["kind"]
	var sig := kind + game_input.last_device + str(touch)
	match kind:
		"dayIntro":
			sig += "%d|%s|%s" % [s.day_index, _sget(s, "on_leave", false), _sget(s, "leave_used", 0)]
		"burnout":
			var fade_sec := float(cfg["presentation"]["fx"].get("burnoutFadeSec", 2.5))
			var bt: float = ps.burnout_time if ps != null else 99.0
			if bt < fade_sec * 0.8:
				sig = ""
		"collapse":
			sig += str(m["stat"])
		"night":
			sig += "%s|%s" % [s.day_index, m.get("perkChosen")]
		"final":
			pass
		_:
			sig = ""
	if sig == _sigs.get("screen"):
		return
	_sigs["screen"] = sig
	if sig == "":
		_screen.visible = false
		_screen_kind = ""
		_release_focus_in(_screen)
		return
	var box: VBoxContainer
	var first: Control = null
	match kind:
		"dayIntro":
			box = _day_intro_box(s)
		"burnout":
			box = _screen_box(600)
			box.add_child(_center(_lbl(_tx("result.burnout.title"), 22 if _low() else 34, UiTheme.INK, 700)))
			box.add_child(_gap(14))
			box.add_child(_center(_wrap(_tx("result.burnout.body"), 17, Color("#ddd5c6"), box.custom_minimum_size.x)))
			box.add_child(_gap(18))
			first = _menu_item(_tx("result.wakeHome"), "Enter", 16, UiTheme.WARM)
			box.add_child(first)
		"collapse":
			box = _screen_box(600)
			box.add_child(_center(_lbl(_tx("result.collapse.title"), 22 if _low() else 34, UiTheme.INK, 700)))
			box.add_child(_gap(14))
			box.add_child(_center(_wrap(_tx("result.collapse." + str(m["stat"])), 17, Color("#ddd5c6"), box.custom_minimum_size.x)))
			box.add_child(_gap(18))
			first = _menu_item(_tx("result.retry"), "KeyR", 16, UiTheme.WARM)
			box.add_child(first)
		"night":
			box = _night_box(s, m)
		"final":
			box = _final_box(s, m)
	if first == null:
		first = box.get_meta("first", null)
	_set_screen(kind, box, first)


func _set_screen(kind: String, box: Control, first: Control) -> void:
	for c in _screen_center.get_children():
		c.queue_free()
	_screen_center.add_child(_gap(24))
	_screen_center.add_child(box)
	_screen_center.add_child(_gap(24))
	_screen_center.custom_minimum_size = size
	_screen_scroll.scroll_vertical = 0
	_screen_bg.texture = _screen_texture(kind)
	_screen.visible = true
	if kind != _screen_kind:
		_appear(box)
	_screen_kind = kind
	# 하나의 메뉴 문법: 처음 항목에 포커스 (방향키/D-pad로 옮기고 Enter/A로 고른다)
	if first != null and not _options.visible:
		first.call_deferred("grab_focus")


static var _bg_cache := {}


## 화면 뒤 배경: 타이틀은 가운데가 밝은 어둠, 밤·엔딩은 따뜻한 갈색, 실패는 아주 어둡게
static func _screen_texture(kind: String) -> Texture2D:
	if _bg_cache.has(kind):
		return _bg_cache[kind]
	var g := Gradient.new()
	var t := GradientTexture2D.new()
	t.width = 256
	t.height = 256
	t.fill = GradientTexture2D.FILL_RADIAL
	match kind:
		"title":
			g.set_color(0, Color("#2b2a35"))
			g.set_color(1, Color("#0d0e12"))
			g.set_offset(1, 0.7)
			t.fill_from = Vector2(0.5, 0.4)
			t.fill_to = Vector2(1.25, 1.1)
		"night", "final":
			g.set_color(0, Color(60 / 255.0, 42 / 255.0, 22 / 255.0, 0.95))
			g.set_color(1, Color(12 / 255.0, 10 / 255.0, 10 / 255.0, 0.97))
			g.set_offset(1, 0.8)
			t.fill_from = Vector2(0.5, 0.3)
			t.fill_to = Vector2(1.2, 1.1)
		"burnout", "collapse":
			g.set_color(0, Color(6 / 255.0, 6 / 255.0, 9 / 255.0, 0.92))
			g.set_color(1, Color(6 / 255.0, 6 / 255.0, 9 / 255.0, 0.92))
		_:
			g.set_color(0, Color(12 / 255.0, 12 / 255.0, 16 / 255.0, 0.8))
			g.set_color(1, Color(12 / 255.0, 12 / 255.0, 16 / 255.0, 0.9))
			t.fill_from = Vector2(0.5, 0.45)
			t.fill_to = Vector2(1.2, 1.1)
	t.gradient = g
	_bg_cache[kind] = t
	return t


func _screen_box(width: float) -> VBoxContainer:
	var box := _vbox(0)
	box.custom_minimum_size.x = minf(width, size.x - 32)
	box.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	return box


func _day_intro_box(s) -> VBoxContainer:
	var box := _screen_box(600)
	var w := box.custom_minimum_size.x
	var day: Dictionary = s.day
	var n: int = _sget(s, "vacation_day_count", 1)
	box.add_child(_center(_lbl("%s · %s" % [_tx(day["weekdayKey"], {"n": n}), DayCycle.format_time(s.clock.minutes)], 14, UiTheme.WARM)))
	box.add_child(_gap(6))
	box.add_child(_center(_wrap(_tx(day["titleKey"]), 22 if _low() else 34, UiTheme.INK, w, 700)))
	box.add_child(_gap(14))
	box.add_child(_center(_wrap(_tx(day["introKey"]), 17, Color("#ddd5c6"), w)))
	box.add_child(_gap(16))
	# 지난 날의 선택이 남긴 이야기 한 줄이 먼저, 그다음 오늘만의 작은 사건
	var keys: Array = []
	for note in day.get("notes", []):
		keys.append(note["textKey"])
	for h in _sget(s, "happenings", []):
		if h.get("introKey", "") != "":
			keys.append(h["introKey"])
	if keys.size() > 0:
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(1, 1, 1, 0.05)
		sb.border_color = Color(0.949, 0.788, 0.298, 0.7)
		sb.border_width_left = 3
		sb.corner_radius_top_right = 8
		sb.corner_radius_bottom_right = 8
		sb.content_margin_left = 14
		sb.content_margin_right = 14
		sb.content_margin_top = 10
		sb.content_margin_bottom = 10
		var today := _pc(sb)
		var rt := _rt(w - 28, 14, Color("#e9dfc9"))
		rt.append_text("\n".join(keys.map(func(k): return "[color=#f2c94c]·[/color] " + UiTheme.esc(_tx(k)))))
		rt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		today.add_child(rt)
		box.add_child(today)
		box.add_child(_gap(10))
	if s.day_index == 0:
		box.add_child(_center(_wrap(_tx("intro.gauges"), 14, Color("#ffd98a"), w)))
		box.add_child(_gap(6))
	box.add_child(_gap(10))
	var first := _menu_item(_tx("screen.dayIntro.hint"), "Enter", 16, UiTheme.WARM)
	box.add_child(first)
	box.set_meta("first", first)
	# 연차 (쓸 수 있으면 고를 수 있게, 썼으면 쉬는 날, 못 쓰는 날이면 이유)
	var leave: Variant = day.get("leave")
	if leave != null:
		if _sget(s, "on_leave", false):
			box.add_child(_center(_wrap(_tx("leave.on"), 14, Color("#b9e3a5"), w)))
		elif not leave.get("allowed", false):
			box.add_child(_center(_wrap(_tx(leave.get("noteKey", "")), 13, Color("#cfd9c4"), w)))
		else:
			var left := int(cfg["balance"]["leave"]["perWeek"]) - int(_sget(s, "leave_used", 0))
			if left <= 0:
				box.add_child(_center(_wrap(_tx("leave.none"), 13, Color("#cfd9c4"), w)))
			else:
				box.add_child(_menu_item(_tx("leave.offer", {"n": left}), "KeyL", 13, Color("#cfd9c4")))
	return box


func _h3(text: String) -> Control:
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_top", 16)
	m.add_theme_constant_override("margin_bottom", 6)
	m.add_child(_lbl(text, 14, UiTheme.WARM, 700))
	return m


func _report_rows(r: Dictionary, w: float) -> Control:
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("v_separation", 3)
	var n := func(v) -> String: return _tx("report.unit.count", {"n": int(v)})
	var rows := [
		["report.smalltalkAvoided", n.call(r.get("smalltalkAvoided", 0))],
		["report.smalltalkEndured", n.call(r.get("smalltalkEndured", 0))],
		["report.parried", n.call(r.get("parried", 0))],
		["report.silence", _tx("report.unit.sec", {"n": roundi(float(r.get("silenceSec", 0)))})],
		["report.mandatory", n.call(r.get("mandatoryDone", []).size())],
		["report.calls", "%d / %d" % [int(r.get("callsAnswered", 0)), int(r.get("callsAvoided", 0))]],
		["report.messages", "%d / %d" % [int(r.get("messagesReplied", 0)), int(r.get("messagesIgnored", 0))]],
		["report.recovered", n.call(roundi(float(r.get("recoveredBattery", 0))))],
		["report.favors", n.call(r.get("favorsDone", 0))],
	]
	for row in rows:
		var th := _lbl(_tx(row[0]), 14, UiTheme.INK_DIM)
		th.custom_minimum_size.x = w - 120
		grid.add_child(th)
		var td := _lbl(row[1], 14)
		td.custom_minimum_size.x = 120
		td.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		grid.add_child(td)
	return grid


func _life_bars(values: Dictionary, before: Variant = null) -> Control:
	var v := _vbox(3)
	for id in LIFE_IDS:
		var val := roundi(float(values.get(id, 0)))
		var d := val - roundi(float(before.get(id, 0))) if before is Dictionary else 0
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 8)
		h.add_child(_icon(UiIcons.life(id), 14))
		var l := _lbl(_tx("life." + id), 13)
		l.custom_minimum_size.x = 96
		h.add_child(l)
		var bar := Bar.new()
		bar.setup(Color("#d8b98a"), Color(1, 1, 1, 0.1), 8)
		bar.value = val / 100.0
		bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(bar)
		var dl := _lbl(("+%d" % d if d > 0 else str(d)) if d != 0 else "", 12, Color("#9de3a8") if d > 0 else Color("#ffab96"))
		dl.custom_minimum_size.x = 40
		h.add_child(dl)
		v.add_child(h)
	return v


## 정산 한 줄: 왼쪽 글, 오른쪽 값
func _settle_row(text: String, value: String, value_color: Color = UiTheme.INK, w: float = 520.0, prefix_icon: String = "") -> Control:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 8)
	if prefix_icon != "":
		h.add_child(_icon(prefix_icon, 14))
	var l := _wrap(text, 13, Color("#ddd5c6"), w - 90 - (22 if prefix_icon != "" else 0))
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(l)
	var b := _lbl(value, 13, value_color, 600)
	b.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	h.add_child(b)
	return h


func _night_box(s, m: Dictionary) -> VBoxContainer:
	var box := _screen_box(560)
	var w := box.custom_minimum_size.x
	var r: Dictionary = m["report"]
	var n: int = _sget(s, "vacation_day_count", 1)
	box.add_child(_lbl(_tx("night.title", {"weekday": _tx(s.day["weekdayKey"], {"n": n})}), 14, UiTheme.WARM))
	box.add_child(_gap(6))
	box.add_child(_wrap(_tx("night.body"), 17, Color("#ddd5c6"), w))
	box.add_child(_gap(14))
	box.add_child(_report_rows(r, w))
	box.add_child(_h3(_tx("report.life")))
	box.add_child(_life_bars(m["lifeEnd"], r.get("lifeStart")))
	_why_rows(s, box, w)
	_people_today(s, box, w)
	var settle: Array = m.get("settlement", [])
	if settle.size() > 0:
		box.add_child(_gap(10))
		for l in settle:
			var v := ""
			if l.get("money") != null:
				var mn := float(l["money"])
				v = ("+" if mn > 0 else "−" if mn < 0 else "") + _money(absf(mn))
			else:
				var dd := float(l.get("delta", 0))
				v = ("+" if dd > 0 else "") + _num(dd)
			box.add_child(_settle_row(_tx(l["key"]), v, UiTheme.INK, w))
	box.add_child(_gap(10))
	for b in m.get("breakdown", []):
		var dd := float(b["delta"])
		box.add_child(_settle_row(_tx(b["key"]), ("+" if dd > 0 else "") + _num(dd), UiTheme.INK, w))
	var nm := HBoxContainer.new()
	var nl := _lbl(_tx("night.nextMax"), 13, Color("#ddd5c6"))
	nl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	nm.add_child(nl)
	var nb := Bar.new()
	nb.setup(UiTheme.WARM, Color(1, 1, 1, 0.12), 8)
	nb.custom_minimum_size.x = 120
	nb.value = float(m.get("nextMax", 100)) / 100.0
	nb.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	nm.add_child(nb)
	box.add_child(nm)
	var perk_first := _perk_choice(m, box, w)
	box.add_child(_gap(20))
	box.add_child(_center(_wrap(_tx("report.comfort.%d" % (int(s.day_index) % 4)), 17, Color("#ffe9c4"), w, 400, true)))
	box.add_child(_gap(18))
	var next := _menu_item(_tx("night.next"), "Enter", 16, UiTheme.WARM)
	box.add_child(next)
	box.set_meta("first", perk_first if perk_first != null else next)
	return box


## 오늘 생활 지표가 바뀐 이유: 지표마다 이유별로 모아서 (밤 정산의 하루 소모는 아래 정산 목록에)
func _why_rows(s, box: VBoxContainer, w: float) -> void:
	var groups := {}
	var order: Array = []
	for c in s.sim.life.ledger:
		if str(c["why"]).begins_with("settle."):
			continue
		var k := "%s|%s|%s" % [c["stat"], c["why"], c.get("who", "")]
		if not groups.has(k):
			groups[k] = {"stat": c["stat"], "delta": 0.0, "text": _why_text(s, c)}
			order.append(k)
		groups[k]["delta"] += float(c["delta"])
	var rows: Array = []
	for id in LIFE_IDS:
		var mine: Array = []
		for k in order:
			var g: Dictionary = groups[k]
			if g["stat"] == id and absf(g["delta"]) >= 0.5:
				mine.append(g)
		mine.sort_custom(func(a, b): return a["delta"] < b["delta"])
		rows.append_array(mine)
	if rows.is_empty():
		return
	box.add_child(_h3(_tx("night.why")))
	for g in rows:
		var d: float = g["delta"]
		box.add_child(_settle_row(g["text"], ("+" if d > 0 else "−") + str(roundi(absf(d))), UiTheme.UP if d > 0 else UiTheme.DOWN, w, UiIcons.life(g["stat"])))


## 오늘 나에 대한 인상이 바뀐 사람: 화살표와 말로 (숫자 없이)
func _people_today(s, box: VBoxContainer, w: float) -> void:
	var rep = s.reputation
	var changed: Dictionary = rep.changed_today()
	var ids: Array = []
	for id in changed:
		if absf(float(changed[id])) >= 1:
			ids.append(id)
	if ids.is_empty():
		return
	ids.sort_custom(func(a, b): return changed[a] < changed[b])
	box.add_child(_h3(_tx("rep.today")))
	for id in ids:
		var d := float(changed[id])
		var arrows := ("▲" if d > 0 else "▼").repeat(mini(3, ceili(absf(d) / 5.0)))
		var rt := _rt(w - 60, 13, Color("#ddd5c6"))
		rt.append_text("%s  [color=#cfc6b4][font_size=12]%s[/font_size][/color]" % [UiTheme.esc(_tx(cfg["reputation"]["people"][id]["nameKey"])), UiTheme.esc(_tx(rep.tier_key(rep.get_value(id))))])
		var h := HBoxContainer.new()
		rt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		h.add_child(rt)
		h.add_child(_lbl(arrows, 13, UiTheme.UP if d > 0 else UiTheme.DOWN, 600))
		box.add_child(h)


## 밤: 오늘 익힐 기술 셋 중 하나 (고른 뒤엔 그것만 밝게). 카드는 메뉴 항목 (방향키/D-pad로 옮기고 고른다)
func _perk_choice(m: Dictionary, box: VBoxContainer, w: float) -> Control:
	var choices: Array = m.get("perkChoices", [])
	if choices.is_empty():
		return null
	box.add_child(_h3(_tx("perk.title")))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	var chosen: Variant = m.get("perkChosen")
	var cw := (w - 16) / 3.0
	var first: Control = null
	for i in choices.size():
		var d: Dictionary = {}
		for k in cfg["perks"]["list"]:
			if k["id"] == choices[i]:
				d = k
		var on: bool = chosen != null and chosen == choices[i]
		var off: bool = chosen != null and not on
		var v := _vbox(3)
		var head := HBoxContainer.new()
		head.add_theme_constant_override("separation", 6)
		if not touch:
			head.add_child(_lbl(str(i + 1), 12, UiTheme.WARM, 700))
		head.add_child(_wrap(_tx(d.get("nameKey", "")), 14, UiTheme.INK, cw - 40, 700))
		v.add_child(head)
		v.add_child(_wrap(_tx(d.get("descKey", "")), 12, Color(UiTheme.INK, 0.8), cw - 20))
		var code := "Digit%d" % (i + 1)
		var card := _card(v, func() -> void: _tap_code(code),
			UiTheme.box(Color(0.659, 0.851, 0.604, 0.15) if on else Color(1, 1, 1, 0.06), 10, Vector4(10, 10, 10, 8), Color("#a8d99a") if on else Color(1, 1, 1, 0.2), 1),
			UiTheme.box(Color(1, 0.82, 0.4, 0.14), 10, Vector4(10, 10, 10, 8), UiTheme.WARM, 2))
		card.custom_minimum_size.x = cw
		card.modulate.a = 0.35 if off else 1.0
		row.add_child(card)
		if first == null and chosen == null:
			first = card
	box.add_child(row)
	return first


func _final_box(s, m: Dictionary) -> VBoxContainer:
	var box := _screen_box(560)
	var w := box.custom_minimum_size.x
	var total := DayReport.merge(m.get("reports", []))
	box.add_child(_center(_lbl(_tx("final.title"), 22 if _low() else 34, UiTheme.INK, 700)))
	box.add_child(_gap(14))
	box.add_child(_wrap(_tx("final.body"), 17, Color("#ddd5c6"), w))
	box.add_child(_gap(12))
	box.add_child(_report_rows(total, w))
	box.add_child(_h3(_tx("report.life")))
	box.add_child(_life_bars(s.sim.life.all()))
	box.add_child(_gap(8))
	var spots: int = cfg["quietSpots"]["spots"].size()
	box.add_child(_lbl(_tx("quiet.mapCount", {"n": _count(_sget(s, "quiet_found", {})), "max": spots}), 13, Color("#c9e8bf")))
	# 사람들이 본 나 (막대와 말) + 사회적 평판
	var rep = s.reputation
	box.add_child(_h3(_tx("rep.title")))
	var ov := HBoxContainer.new()
	ov.add_theme_constant_override("separation", 8)
	ov.add_child(_lbl(_tx("rep.overall"), 13))
	var ob := Bar.new()
	ob.setup(Color("#e8c37a"), Color(1, 1, 1, 0.12), 6)
	ob.value = rep.overall() / 100.0
	ob.custom_minimum_size.x = 160
	ob.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	ov.add_child(ob)
	ov.add_child(_lbl(_tx(rep.tier_key(rep.overall())), 12, Color("#cfc6b4")))
	box.add_child(ov)
	box.add_child(_gap(4))
	for id in cfg["reputation"]["people"]:
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 8)
		var nl := _lbl(_tx(cfg["reputation"]["people"][id]["nameKey"]), 13)
		nl.custom_minimum_size.x = 110
		h.add_child(nl)
		var b := Bar.new()
		b.setup(Color("#e8c37a"), Color(1, 1, 1, 0.12), 6)
		b.value = rep.get_value(id) / 100.0
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(b)
		var tl := _lbl(_tx(rep.tier_key(rep.get_value(id))), 12, Color("#cfc6b4"))
		tl.custom_minimum_size.x = 140
		h.add_child(tl)
		box.add_child(h)
	# 익힌 기술
	box.add_child(_h3(_tx("perk.final")))
	var perks = _sget(s, "perks", {})
	var any := false
	for k in cfg["perks"]["list"]:
		if _has(perks, k["id"]):
			any = true
			var rt := _rt(w, 13)
			rt.append_text("[b]%s[/b] — %s" % [UiTheme.esc(_tx(k["nameKey"])), UiTheme.esc(_tx(k["descKey"]))])
			box.add_child(rt)
	if not any:
		box.add_child(_lbl(_tx("perk.none"), 12, Color("#cfc6b4")))
	# 작은 승리 도장 (얻은 것은 밝게) + 이번 주의 조건
	var achieved = _sget(s, "achieved", {})
	var list: Array = cfg["achievements"]["list"]
	box.add_child(_h3("%s (%d/%d)" % [_tx("ach.title"), _count(achieved), list.size()]))
	var wc: Variant = _sget(s, "week_condition", null)
	if wc is Dictionary and wc.has("nameKey"):
		box.add_child(_lbl(_tx(wc["nameKey"]), 12, Color("#cfc6b4")))
		box.add_child(_gap(4))
	var grid := GridContainer.new()
	grid.columns = 3 if w >= 520 else 2
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	var aw := (w - 6 * (grid.columns - 1)) / grid.columns
	for a in list:
		var got := _has(achieved, a["id"])
		var cell := _pc(UiTheme.box(Color(1, 0.82, 0.4, 0.12) if got else Color(1, 1, 1, 0.04), 8, Vector4(8, 6, 8, 6)))
		cell.custom_minimum_size.x = aw
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 6)
		var ic := _icon("ui.medal" if got else "ui.ring", 20)
		ic.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		h.add_child(ic)
		var v := _vbox(0)
		v.add_child(_wrap(_tx(a["nameKey"]), 12, UiTheme.INK, aw - 42, 700))
		v.add_child(_wrap(_tx(a["descKey"]), 11, Color(UiTheme.INK, 0.8), aw - 42))
		h.add_child(v)
		cell.add_child(h)
		cell.modulate.a = 1.0 if got else 0.45
		grid.add_child(cell)
	box.add_child(grid)
	# 한 주의 이야기 줄기마다 결말 한 줄, 그리고 일요일 아침의 맺음말
	var epi: Array = Story.epilogue_keys(cfg["story"], _sget(s, "story", {}))
	if epi.size() > 0:
		box.add_child(_h3(_tx("final.epilogue")))
		for k in epi:
			box.add_child(_wrap(_tx(k), 14, Color("#e8e2d6"), w))
			box.add_child(_gap(6))
		box.add_child(_gap(8))
		box.add_child(_center(_wrap(_tx(cfg["story"].get("closingKey", "")), 14, Color("#cfc6b4"), w)))
	box.add_child(_gap(20))
	box.add_child(_center(_wrap(_tx("report.comfort.2"), 17, Color("#ffe9c4"), w, 400, true)))
	box.add_child(_gap(18))
	var restart := _menu_item(_tx("final.restart"), "Enter", 16, UiTheme.WARM)
	box.add_child(restart)
	box.set_meta("first", restart)
	return box


# ───────────────────────── 배치·가림 ─────────────────────────

func _layout(s) -> void:
	var low := _low()
	var vs := size
	var right_w := 230.0 if touch else 0.0
	# 왼쪽 위: 한 줄, 그 아래 펼친 메모
	_place(_line, Vector2.ZERO, Vector2(16, 14), Control.GROW_DIRECTION_END, Control.GROW_DIRECTION_END)
	_memo.scale = Vector2(0.82, 0.82) if low else Vector2.ONE
	_memo.position = Vector2(18, 14 + _line.size.y + 10)
	_memo.reset_size()
	# 오른쪽 위: 게이지 (터치는 위 버튼 줄 아래)
	var gs := _gauges.get_combined_minimum_size()
	_gauges.size = gs
	_gauges.position = Vector2(vs.x - 18 - gs.x * _gauges.scale.x, 62.0 if touch else 16.0)
	# 아래 가운데 한 줄 (터치는 오른쪽 버튼 묶음을 뺀 가운데)
	_place(_column, Vector2(0, 1), Vector2((vs.x - right_w) / 2.0, -12), Control.GROW_DIRECTION_BOTH, Control.GROW_DIRECTION_BEGIN)
	# 폰: 오른쪽 아래, 게이지 아래부터
	var gauge_bottom := _gauges.position.y + gs.y * _gauges.scale.y + 12 if _gauges.visible else 16.0
	var ph := minf(440.0, vs.y - gauge_bottom - 16)
	_phone.custom_minimum_size = Vector2(300, ph)
	_place(_phone, Vector2(1, 1), Vector2(-(16 + right_w), -16), Control.GROW_DIRECTION_BEGIN, Control.GROW_DIRECTION_BEGIN)
	# 왼쪽 아래 알림: 아래 가운데 줄과 겹치면 그 위로
	_notifs.custom_minimum_size.x = 220
	var col_rect := Rect2(_column.position, _column.size)
	var ny := -16.0
	var nrect := Rect2(16, vs.y - 16 - _notifs.size.y, 220, _notifs.size.y)
	if _column.visible and nrect.intersects(col_rect):
		ny = -(vs.y - col_rect.position.y) - 8
	_place(_notifs, Vector2(0, 1), Vector2(16, ny), Control.GROW_DIRECTION_END, Control.GROW_DIRECTION_BEGIN)


## 한 줄·메모·알림·게이지·아래 가운데 줄·알림 글이 나나 다가오는 사람을 가리면 투명해진다
func _update_covering(s, playing: bool, dt: float) -> void:
	var pts: Array = []
	if playing and projector.is_valid():
		var p: Vector2 = s.player.pos
		for v in [_project(p, 0.0), _project(p, 1.6)]:
			if v != null:
				pts.append(v)
		for n in s.active_npcs():
			if n.state != "approach" and n.notice < 0.4:
				continue
			if absf(n.pos.x - p.x) > 30 or absf(n.pos.y - p.y) > 20:
				continue
			for v in [_project(n.pos, 0.0), _project(n.pos, 1.6)]:
				if v != null:
					pts.append(v)
	focus_points = pts
	var interacting: bool = s.mode["kind"] != "free"
	for c in [_line, _memo, _notifs, _gauges, _column, _toasts]:
		var f: Dictionary = _fade[c]
		var covering := false
		# 대화·업무 창처럼 지금 쓰는 창은 흐리게 하지 않는다
		if pts.size() > 0 and (c as Control).visible and not (c == _column and interacting):
			var r := _grect(c).grow(14)
			for q in pts:
				if r.has_point(q):
					covering = true
					break
		var target := 0.22 if covering else 1.0
		f["cover"] += (target - f["cover"]) * minf(1.0, dt * 14)
	for c in _fade.keys():
		if not is_instance_valid(c):
			continue
		var f: Dictionary = _fade[c]
		(c as Control).modulate.a = f["cover"] * f["appear"]


## 창이 툭 나타나지 않고 살며시 떠오른다
func _appear(c: Control) -> void:
	if not _fade.has(c):
		_fade[c] = {"appear": 0.0, "cover": 1.0}
	_fade[c]["appear"] = 0.0


func _update_fades(dt: float) -> void:
	for c in _fade.keys():
		if not is_instance_valid(c):
			_fade.erase(c)
			continue
		var f: Dictionary = _fade[c]
		f["appear"] = minf(1.0, f["appear"] + dt / 0.4)
		if not [_line, _memo, _notifs, _gauges, _column, _toasts].has(c):
			(c as Control).modulate.a = f["cover"] * f["appear"]


static func _grect(c: Control) -> Rect2:
	var xf := c.get_global_transform()
	return Rect2(xf.origin, c.size * xf.get_scale())


## 앵커 한 점에 붙이고 내용 크기만큼 자라게 (offset은 그 점에서의 거리)
static func _place(c: Control, anchor: Vector2, offset: Vector2, grow_h: int, grow_v: int) -> void:
	c.anchor_left = anchor.x
	c.anchor_right = anchor.x
	c.anchor_top = anchor.y
	c.anchor_bottom = anchor.y
	c.grow_horizontal = grow_h
	c.grow_vertical = grow_v
	c.offset_left = offset.x
	c.offset_right = offset.x
	c.offset_top = offset.y
	c.offset_bottom = offset.y


func _release_focus_in(root: Control) -> void:
	if not is_inside_tree():
		return
	var fo := get_viewport().gui_get_focus_owner()
	if fo != null and root.is_ancestor_of(fo):
		fo.release_focus()


# ───────────────────────── 누르기 ─────────────────────────

## 누를 수 있는 칸 (마우스·터치 여러 손가락). action: 키 코드(String) 또는 Callable
func _clickable(c: Control, action: Variant) -> Control:
	c.set_meta("click", action)
	c.add_to_group(_click_group)
	c.mouse_filter = Control.MOUSE_FILTER_STOP
	c.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	c.mouse_entered.connect(func() -> void: c.self_modulate = Color(1.25, 1.2, 1.1))
	c.mouse_exited.connect(func() -> void: c.self_modulate = Color.WHITE)
	return c


## 이 화면 점에 누를 수 있는 칸이 있는지 (TouchControls가 조이스틱을 시작하기 전에 묻는다)
func hit_clickable(pos: Vector2) -> bool:
	return _find_clickable(pos) != null


func _find_clickable(pos: Vector2) -> Control:
	var top: Control = self
	if _options.visible:
		top = _options
	elif _pause.visible:
		top = _pause
	elif _map.visible:
		top = _map
	elif _screen.visible:
		top = _screen
	var nodes := get_tree().get_nodes_in_group(_click_group)
	for i in range(nodes.size() - 1, -1, -1):
		var n: Control = nodes[i]
		if not n.is_visible_in_tree() or (top != self and not top.is_ancestor_of(n)):
			continue
		if _grect(n).has_point(pos):
			return n
	return null


## 칸 누르기: 마우스 왼쪽 단추, 터치(여러 손가락 — 오른손이 미소 유지를 누르고 있어도 왼손으로).
## 키 바꾸기 중이면 키를 먼저 받는다
func _input(e: InputEvent) -> void:
	if game_input != null and game_input.capture != null and (e is InputEventKey or e is InputEventJoypadButton or e is InputEventJoypadMotion) and e.is_pressed():
		game_input.handle_event(e)
		get_viewport().set_input_as_handled()
		return
	var pos: Variant = null
	if e is InputEventScreenTouch and e.pressed:
		pos = e.position
	elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT and e.device != InputEvent.DEVICE_ID_EMULATION:
		pos = e.position
	if pos == null or not is_visible_in_tree():
		return
	var n := _find_clickable(pos)
	if n == null:
		return
	var a: Variant = n.get_meta("click")
	if a is Callable:
		(a as Callable).call()
	else:
		_tap_code(a)
	get_viewport().set_input_as_handled()


# ───────────────────────── 메뉴 항목 (포커스) ─────────────────────────

## 포커스를 받는 칸: 방향키/WASD/D-pad로 옮기고 Enter/Space/A로 고른다. 마우스를 올리면 포커스, 누르면 고른다
func _card(content: Control, on_activate: Callable, normal: StyleBox, focused: StyleBox) -> PanelContainer:
	var p := _pc(normal)
	p.focus_mode = Control.FOCUS_ALL
	p.mouse_filter = Control.MOUSE_FILTER_STOP
	p.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	p.set_meta("styles", [normal, focused])
	p.add_child(content)
	p.gui_input.connect(func(e: InputEvent) -> void:
		if (e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT) or (e is InputEventScreenTouch and e.pressed) or e.is_action_pressed("ui_accept"):
			p.accept_event()
			on_activate.call())
	p.focus_entered.connect(func() -> void: _style_item(p, true))
	p.focus_exited.connect(func() -> void: _style_item(p, false))
	p.mouse_entered.connect(func() -> void:
		if game_input.last_device == "mouse":
			p.grab_focus())
	return p


func _style_item(p: Control, focused: bool) -> void:
	var st: Array = p.get_meta("styles", [])
	if st.is_empty():
		return
	var on: bool = p.get_meta("on", false)
	p.add_theme_stylebox_override("panel", st[1] if (focused or on) else st[0])


## 화면·멈춤 메뉴의 글 한 줄 항목 (가운데). action: 키 코드 또는 Callable
func _menu_item(text: String, action: Variant, fs: int, color: Color) -> PanelContainer:
	var l := _lbl(text, fs, color, 600 if fs >= 15 else 400)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size.x = minf(520.0, UiTheme.font().get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x + 4)
	var cb := (action as Callable) if action is Callable else func() -> void: _tap_code(action)
	var card := _card(l, cb, UiTheme.box(Color(0, 0, 0, 0), 12, Vector4(16, 6, 16, 7), Color(0, 0, 0, 0), 0),
		UiTheme.box(Color(1, 0.82, 0.4, 0.12), 12, Vector4(16, 6, 16, 7), Color(1, 0.82, 0.4, 0.8), 1))
	card.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	return card


## 작은 알약 버튼 (설정 창 탭·키 칸·지도 버튼)
func _pill_item(text: String, on_activate: Callable, _key_code: String = "") -> PanelContainer:
	var l := _lbl(text, 13, UiTheme.INK)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return _card(l, on_activate, UiTheme.box(Color(1, 1, 1, 0.07), 10, Vector4(12, 4, 12, 5), Color(1, 1, 1, 0.16), 1),
		UiTheme.box(Color(1, 0.82, 0.4, 0.18), 10, Vector4(12, 4, 12, 5), UiTheme.WARM, 1))


# ───────────────────────── 세션 읽기 도우미 ─────────────────────────

## 약속(PORTING.md)에 없는 필드: 없으면 기본값
static func _sget(s, name: String, def: Variant = null) -> Variant:
	if s == null:
		return def
	var v: Variant = s.get(name)
	return def if v == null else v


static func _scall(s, method: String, args: Array = [], def: Variant = null) -> Variant:
	if s != null and s.has_method(method):
		return s.callv(method, args)
	return def


## 집합(Dictionary 키 또는 배열)
static func _has(coll, key) -> bool:
	if coll is Dictionary or coll is Array:
		return coll.has(key)
	return false


static func _count(coll) -> int:
	if coll is Dictionary or coll is Array:
		return coll.size()
	return 0


# ───────────────────────── 만들기 도우미 ─────────────────────────

static func _full(c: Control) -> Control:
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


static func _pc(style: StyleBox) -> PanelContainer:
	var p := PanelContainer.new()
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if style != null:
		p.add_theme_stylebox_override("panel", style)
	return p


static func _vbox(sep: int) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", sep)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return v


static func _gap(h: float) -> Control:
	var c := Control.new()
	c.custom_minimum_size.y = h
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


static func _lbl(text: String, size: int = 14, color: Color = UiTheme.INK, weight: int = 400, italic: bool = false) -> Label:
	var l := Label.new()
	l.text = text
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if weight != 400 or italic:
		l.add_theme_font_override("font", UiTheme.font(weight, italic))
	return l


## 줄바꿈하는 글 (너비를 정해야 한다)
static func _wrap(text: String, size: int, color: Color, width: float, weight: int = 400, italic: bool = false) -> Label:
	var l := _lbl(text, size, color, weight, italic)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size.x = maxf(10.0, width)
	return l


## 가운데 맞춤 (Label이면 글자도 가운데로)
static func _center(c: Control) -> Control:
	if c is Label:
		(c as Label).horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	c.size_flags_horizontal = Control.SIZE_FILL
	return c


static func _rt(width: float, size: int = 14, color: Color = UiTheme.INK) -> RichTextLabel:
	var r := RichTextLabel.new()
	r.bbcode_enabled = true
	r.fit_content = true
	r.scroll_active = false
	r.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	r.custom_minimum_size.x = width
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for k in ["normal_font_size", "bold_font_size", "italics_font_size", "bold_italics_font_size", "mono_font_size"]:
		r.add_theme_font_size_override(k, size)
	r.add_theme_color_override("default_color", color)
	return r


static func _icon(name: String, px: int) -> TextureRect:
	var t := TextureRect.new()
	t.texture = UiIcons.tex(name, px * 2)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.custom_minimum_size = Vector2(px, px)
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return t


## 키 이름 칩 ([1], [Y], [A]…)
static func _kbd(text: String, bg: Color = Color(1, 1, 1, 0.14), fg: Color = UiTheme.WARM) -> PanelContainer:
	var p := _pc(UiTheme.box(bg, 4, Vector4(5, 0, 5, 1)))
	var l := _lbl(text, 12, fg, 700)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	p.add_child(l)
	return p


static func _shadow(l: Label) -> void:
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.7))
	l.add_theme_constant_override("shadow_outline_size", 4)
	l.add_theme_constant_override("shadow_offset_y", 1)


# ───────────────────────── 그리는 조각 ─────────────────────────

## 둥근 막대: 값(0~1), 강조 구간(window: from,to), 표시선(marker)
class Bar extends Control:
	var value := 0.0
	var fill := Color.WHITE
	var bg := Color(1, 1, 1, 0.12)
	var window := Vector2(-1, -1)
	var window_color := Color(1, 0.82, 0.4, 0.35)
	var marker := -1.0
	var h := 6.0

	func setup(fill_color: Color, bg_color: Color, height: float) -> void:
		fill = fill_color
		bg = bg_color
		h = height
		custom_minimum_size.y = height
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, Vector2(size.x, h))
		var rad := h / 2.0
		draw_style_box(UiTheme.box(bg, rad, Vector4.ZERO), r)
		if window.x >= 0 or window.y >= 0:
			var a := clampf(window.x, 0, 1)
			var b := clampf(window.y, 0, 1)
			if b > a:
				draw_style_box(UiTheme.box(window_color, rad, Vector4.ZERO), Rect2(size.x * a, 0, size.x * (b - a), h))
		var v := clampf(value, 0, 1)
		if v > 0.002 and fill.a > 0:
			draw_style_box(UiTheme.box(fill, rad, Vector4.ZERO), Rect2(0, 0, maxf(h, size.x * v), h))
		if marker >= 0:
			draw_style_box(UiTheme.box(Color.WHITE, 2, Vector4.ZERO), Rect2(size.x * clampf(marker, 0, 1) - 2, -3, 4, h + 6))


## 생활 지표 아이콘 + 아래 막대 (숫자 없이, 낮으면 붉게 깜빡)
class IconBar extends Control:
	var tex: Texture2D
	var value := 1.0
	var time := 0.0

	func _draw() -> void:
		var low := value < 0.3
		var a := (0.55 + 0.45 * cos(time * TAU / 1.4)) if low else 1.0
		if tex:
			draw_texture_rect(tex, Rect2(1, 0, 14, 14), false, Color(1, 1, 1, a))
		draw_rect(Rect2(0, 17, size.x, 2), Color(1, 1, 1, 0.12))
		draw_rect(Rect2(0, 17, size.x * clampf(value, 0, 1), 2), Color("#e05a5a") if low else Color("#9fd38a"))


## 폰 상태 표시줄의 배터리: 숫자 없이 아이콘으로만
class Battery extends Control:
	var level := 1.0

	func _draw() -> void:
		var r := Rect2(1, 1, size.x - 5, size.y - 2)
		draw_style_box(UiTheme.box(Color(0, 0, 0, 0), 3, Vector4.ZERO, UiTheme.INK_DIM, 1), r)
		draw_rect(Rect2(size.x - 4, size.y / 2 - 2.5, 2, 5), UiTheme.INK_DIM)
		var c := Color("#9fd38a") if level > 0.69 else Color("#e7cf6b") if level > 0.39 else Color("#e79a5b") if level > 0.14 else Color("#e05a5a")
		draw_rect(Rect2(3, 3, (r.size.x - 4) * clampf(level, 0, 1), r.size.y - 4), c)


## 오른쪽 위 게이지: 에너지(핵심) → 심리 상태(에너지를 깎는 원인) → 증상(겉모습). 숫자 없이 길이·색으로
class Gauges extends Control:
	var rows: Array = []
	var drain := ""
	var drain_up := false
	var time := 0.0

	func _get_minimum_size() -> Vector2:
		var h := 0.0
		var prev := ""
		for r in rows:
			if prev != "" and prev != r["kind"]:
				h += 8
			h += 20.0 if r["kind"] == "energy" else 14.0 if r["kind"] == "mood" else 13.0
			prev = r["kind"]
		return Vector2(230, h)

	func _draw() -> void:
		update_minimum_size()
		var regular := UiTheme.font(400)
		var bold := UiTheme.font(700)
		var y := 0.0
		var prev := ""
		var right := size.x
		for r in rows:
			var kind: String = r["kind"]
			if prev != "" and prev != kind:
				if kind == "symptom":
					draw_line(Vector2(right - 120, y + 2), Vector2(right, y + 2), Color(1, 1, 1, 0.1), 1)
				y += 8
			prev = kind
			var on: bool = r["on"]
			var alpha := 1.0 if on else 0.45
			var bar_w := 150.0 if kind == "energy" else 100.0 if kind == "mood" else 80.0
			var bar_h := 10.0 if kind == "energy" else 5.0 if kind == "mood" else 4.0
			var row_h := 20.0 if kind == "energy" else 14.0 if kind == "mood" else 13.0
			var fs := 13 if kind == "energy" else 11
			var font := bold if kind == "energy" else regular
			var bar_right := right - (34.0 if kind == "energy" else 0.0)
			var cy := y + row_h / 2.0
			var bar_rect := Rect2(bar_right - bar_w, cy - bar_h / 2.0, bar_w, bar_h)
			# 바닥(빨강)·당황·멘붕이 높으면 막대가 숨 쉬듯 부푼다
			if r["alert"]:
				var k := 0.5 + 0.5 * sin(time * TAU / 0.9)
				bar_rect = bar_rect.grow_individual(bar_w * 0.03 * k, bar_h * 0.15 * k, bar_w * 0.03 * k, bar_h * 0.15 * k)
				draw_style_box(UiTheme.box(Color(0.88, 0.35, 0.35, 0.35 * k), bar_h, Vector4.ZERO), bar_rect.grow(4))
			var label: String = r["label"]
			var text_col := Color(UiTheme.INK, alpha) if on else Color(UiTheme.INK_DIM, UiTheme.INK_DIM.a * alpha)
			var tw := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
			var tp := Vector2(bar_rect.position.x - 8 - tw, cy + fs * 0.36)
			draw_string_outline(font, tp, label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 4, Color(0, 0, 0, 0.45 * alpha))
			draw_string(font, tp, label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, text_col)
			draw_style_box(UiTheme.box(Color(1, 1, 1, 0.12 * alpha + 0.02), bar_h / 2.0, Vector4.ZERO), bar_rect)
			var v := clampf(r["value"], 0, 1)
			if v > 0.003:
				var fc: Color = r["color"]
				draw_style_box(UiTheme.box(Color(fc, fc.a * alpha), bar_h / 2.0, Vector4.ZERO), Rect2(bar_rect.position, Vector2(maxf(bar_h, bar_rect.size.x * v), bar_rect.size.y)))
			if kind == "energy" and drain != "":
				var dfs := 12 if drain_up else 10
				var dc := Color("#9fe08a") if drain_up else Color("#ff9a7a")
				var dp := Vector2(bar_right + 8, cy + dfs * 0.36)
				draw_string_outline(regular, dp, drain, HORIZONTAL_ALIGNMENT_LEFT, -1, dfs, 3, Color(0, 0, 0, 0.45))
				draw_string(regular, dp, drain, HORIZONTAL_ALIGNMENT_LEFT, -1, dfs, dc)
			y += row_h


## 지금 할 일 쪽 작은 화살표 (왼쪽 위 한 줄 안)
class DirArrow extends Control:
	var angle := 0.0

	func _draw() -> void:
		var c := size / 2
		var pts := PackedVector2Array()
		for p in [Vector2(7, 0), Vector2(-5, -5.5), Vector2(-2, 0), Vector2(-5, 5.5)]:
			pts.append(c + p.rotated(angle))
		draw_colored_polygon(pts, Color("#d9962a"))


## 지도 [M]: 도시 전체 / 내 주변. 노란 점 목표, 빨간 점 아는 사람, 초록 잎 찾은 조용한 곳
class MapView extends Control:
	var ui
	var session
	var tex: Texture2D
	var city := false

	func _draw() -> void:
		if tex == null or session == null:
			return
		var s = session
		var cfg: Dictionary = ui.cfg
		var W := float(tex.get_width())
		var H := float(tex.get_height())
		var world_def: Dictionary = cfg["world"]
		var ground_h := 140.0
		for l in world_def.get("layers", []):
			if l["id"] == "ground":
				ground_h = float(l["rect"][3])
		var p: Vector2 = s.player.pos
		# 지하·3층(섬 영역)에 있으면 입구 위치로 표시
		var area: Variant = s.area
		var shown := p if p.y < ground_h else (Vector2(31.5 if p.x < 60 else 177.5, 61) if area != null and area.get("id", "") == "subway" else Vector2(22, 44))
		var region := Rect2(0, 0, W, ground_h if not city else H)
		if not city:
			# 주변: 400×200칸을 잘라서 (내 위치가 가운데)
			var rw := minf(400.0, W)
			var rh := minf(200.0, H)
			region = Rect2(clampf(shown.x - rw / 2, 0, W - rw), clampf(shown.y - rh / 2, 0, H - rh), rw, rh)
		else:
			region = Rect2(0, 0, W, H)
		var k := size.x / region.size.x
		draw_style_box(UiTheme.box(Color("#1c1c22"), 14, Vector4.ZERO, Color(0, 0, 0, 0), 0, 14), Rect2(Vector2.ZERO, size))
		draw_texture_rect_region(tex, Rect2(Vector2.ZERO, size), region)
		var ui_k := size.x / 1600.0
		var dot := func(at: Vector2, color: Color, r: float) -> void:
			var q := (at - region.position) * k
			if q.x >= -r and q.y >= -r and q.x <= size.x + r and q.y <= size.y + r:
				draw_circle(q, r * ui_k * 1.6, color)
		var font := UiTheme.font(700)
		if city:
			# 구역 이름을 크게
			var names: Array = []
			for a in world_def.get("areas", []):
				if str(a.get("labelKey", "")).begins_with("district.") and float(a["rect"][2]) >= 100:
					names.append([Vector2(a["rect"][0] + a["rect"][2] / 2.0, a["rect"][1] + a["rect"][3] / 2.0), a["labelKey"]])
			for n in world_def.get("mapNames", []):
				names.append([Vector2(n["at"][0], n["at"][1]), n["textKey"]])
			var fs := int(maxf(11.0, 26 * ui_k * 1.3))
			for n in names:
				var c: Vector2 = (n[0] - region.position) * k
				var text: String = ui._tx(n[1])
				var tw := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x + 14
				draw_style_box(UiTheme.box(Color(0.078, 0.078, 0.1, 0.65), 6, Vector4.ZERO), Rect2(c.x - tw / 2, c.y - fs * 0.75, tw, fs * 1.5))
				draw_string(font, Vector2(c.x - tw / 2 + 7, c.y + fs * 0.36), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#fff3d6"))
		var target: Variant = ui.marker_target(s)
		if target != null:
			dot.call(target, Color("#ffd166"), 9)
		for n in s.active_npcs():
			var ty: String = ui._npc_type(n)
			if ty != "passerby" and ty != "pet" and n.pos.y < ground_h:
				dot.call(n.pos, Color("#f2c94c") if ty == "ally" else Color("#e0645a"), 5)
		# 조용한 곳 도감: 찾은 곳은 초록 잎, 몇 곳 찾았는지
		var found = ui._sget(s, "quiet_found", {})
		var spots: Array = cfg["quietSpots"]["spots"]
		for q in spots:
			if ui._has(found, q["id"]):
				dot.call(Vector2(q["at"][0], q["at"][1]), Color("#7fbf6a"), 6)
		var count: String = ui._tx("quiet.mapCount", {"n": ui._count(found), "max": spots.size()})
		var cfs := 13
		var cw := UiTheme.font(600).get_string_size(count, HORIZONTAL_ALIGNMENT_LEFT, -1, cfs).x + 20
		draw_style_box(UiTheme.box(Color(0.078, 0.078, 0.1, 0.7), 6, Vector4.ZERO), Rect2(10, 10, cw, 26))
		draw_string(UiTheme.font(600), Vector2(20, 28), count, HORIZONTAL_ALIGNMENT_LEFT, -1, cfs, Color("#c9e8bf"))
		dot.call(shown, Color("#fff7d6"), 8)
		dot.call(shown, Color("#3f78c9"), 5)
