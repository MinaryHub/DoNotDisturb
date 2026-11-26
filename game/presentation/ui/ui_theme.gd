class_name UiTheme
extends RefCounted

## 화면 UI의 모양: 웹 판 src/style.css의 부드럽고 따뜻한 둥근 창을 Godot 테마로 옮긴다.
## 글꼴은 Noto Sans KR(가변 글꼴, 기본 굵기가 100이라 굵기를 꼭 정해 쓴다) + 그림 문자는 시스템 글꼴로 넘긴다.

const FONT_PATH := "res://game/assets/fonts/NotoSansKR-subset.ttf"

# style.css :root
const INK := Color("#f3ece0")
const INK_DIM := Color(0.953, 0.925, 0.878, 0.72)
const PAPER := Color("#fbf5e6")
const PAPER_INK := Color("#3b342c")
const WARM := Color("#ffd166")
const HOT := Color("#e0705a")
const PANEL := Color(22 / 255.0, 21 / 255.0, 27 / 255.0, 0.86)
const DARK := Color(20 / 255.0, 20 / 255.0, 26 / 255.0, 0.82)
const UP := Color("#a8d99a")
const DOWN := Color("#f0a29a")

static var _fonts := {}
static var _boxes := {}
static var _theme: Theme = null


## 굵기별 글꼴 (400 보통, 600, 700 굵게). italic이면 기울인 글꼴 (Noto Sans KR에는 기울임꼴이 없다)
static func font(weight: int = 400, italic: bool = false) -> Font:
	var key := "%d%s" % [weight, "i" if italic else ""]
	if _fonts.has(key):
		return _fonts[key]
	var base: FontFile = load(FONT_PATH)
	var v := FontVariation.new()
	v.base_font = base
	var ts := TextServerManager.get_primary_interface()
	v.variation_opentype = {ts.name_to_tag("wght"): weight}
	if italic:
		v.variation_transform = Transform2D(Vector2(1, 0), Vector2(-0.2, 1), Vector2.ZERO)
	# 데이터 글의 그림 문자(📱🎧…)는 시스템 그림 글꼴로 (웹 내보내기에는 시스템 글꼴이 없다)
	var emoji := SystemFont.new()
	emoji.font_names = PackedStringArray(["Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Emoji"])
	v.fallbacks = [emoji]
	_fonts[key] = v
	return v


## 둥근 상자. 같은 모양은 나눠 쓴다
static func box(bg: Color, radius: float = 10.0, pad: Vector4 = Vector4(12, 8, 12, 8), border: Color = Color(0, 0, 0, 0), border_w: int = 0, shadow: float = 0.0) -> StyleBoxFlat:
	var key := "%s|%s|%s|%s|%d|%s" % [bg.to_html(), radius, pad, border.to_html(), border_w, shadow]
	if _boxes.has(key):
		return _boxes[key]
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.set_corner_radius_all(int(radius))
	sb.corner_detail = 8
	sb.anti_aliasing = true
	sb.content_margin_left = pad.x
	sb.content_margin_top = pad.y
	sb.content_margin_right = pad.z
	sb.content_margin_bottom = pad.w
	if border_w > 0:
		sb.border_color = border
		sb.set_border_width_all(border_w)
	if shadow > 0:
		sb.shadow_color = Color(0, 0, 0, 0.35)
		sb.shadow_size = int(shadow)
		sb.shadow_offset = Vector2(0, shadow * 0.4)
	_boxes[key] = sb
	return sb


## 게임 전체 테마: 기본 글꼴·글자색·버튼·설정 창 입력들
static func build() -> Theme:
	if _theme != null:
		return _theme
	var t := Theme.new()
	t.default_font = font(400)
	t.default_font_size = 14
	t.set_color("font_color", "Label", INK)
	t.set_color("default_color", "RichTextLabel", INK)
	t.set_font("bold_font", "RichTextLabel", font(700))
	t.set_font("italics_font", "RichTextLabel", font(400, true))
	t.set_font("bold_italics_font", "RichTextLabel", font(700, true))
	t.set_constant("line_separation", "RichTextLabel", 3)
	t.set_constant("line_spacing", "Label", 2)
	t.set_constant("text_highlight_h_padding", "RichTextLabel", 4)
	t.set_constant("text_highlight_v_padding", "RichTextLabel", 1)
	# 버튼: 어두운 반투명 둥근 칸, 올리면 노란 테두리
	var normal := box(Color(1, 1, 1, 0.06), 10, Vector4(12, 6, 12, 6), Color(1, 1, 1, 0.2), 1)
	var hover := box(Color(1, 1, 1, 0.1), 10, Vector4(12, 6, 12, 6), Color(1, 0.82, 0.4, 0.8), 1)
	var pressed := box(Color(1, 0.82, 0.4, 0.22), 10, Vector4(12, 6, 12, 6), Color(1, 0.82, 0.4, 0.9), 1)
	for st in ["normal", "disabled"]:
		t.set_stylebox(st, "Button", normal)
	t.set_stylebox("hover", "Button", hover)
	t.set_stylebox("pressed", "Button", pressed)
	t.set_stylebox("hover_pressed", "Button", pressed)
	t.set_stylebox("focus", "Button", box(Color(0, 0, 0, 0), 10, Vector4.ZERO, Color(1, 0.82, 0.4, 0.6), 1))
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		t.set_color(c, "Button", INK)
	t.set_font("font", "Button", font(600))
	# 설정 창: 체크 상자·미끄럼 막대·언어 고르기
	t.set_color("font_color", "CheckButton", INK)
	t.set_color("font_hover_color", "CheckButton", INK)
	t.set_color("font_pressed_color", "CheckButton", INK)
	t.set_color("font_hover_pressed_color", "CheckButton", INK)
	t.set_color("font_focus_color", "CheckButton", INK)
	var empty := StyleBoxEmpty.new()
	for st in ["normal", "hover", "pressed", "hover_pressed", "focus", "disabled"]:
		t.set_stylebox(st, "CheckButton", empty)
	t.set_icon("checked", "CheckButton", _switch_icon(true))
	t.set_icon("unchecked", "CheckButton", _switch_icon(false))
	t.set_stylebox("slider", "HSlider", box(Color(1, 1, 1, 0.14), 3, Vector4(0, 3, 0, 3)))
	t.set_stylebox("grabber_area", "HSlider", box(Color(1, 0.82, 0.4, 0.75), 3, Vector4(0, 3, 0, 3)))
	t.set_stylebox("grabber_area_highlight", "HSlider", box(Color(1, 0.82, 0.4, 0.95), 3, Vector4(0, 3, 0, 3)))
	t.set_icon("grabber", "HSlider", _dot_icon(Color("#fff3d6"), 16))
	t.set_icon("grabber_highlight", "HSlider", _dot_icon(Color.WHITE, 18))
	t.set_stylebox("normal", "OptionButton", normal)
	t.set_stylebox("hover", "OptionButton", hover)
	t.set_stylebox("pressed", "OptionButton", pressed)
	t.set_stylebox("focus", "OptionButton", box(Color(0, 0, 0, 0), 10, Vector4.ZERO, Color(1, 0.82, 0.4, 0.6), 1))
	t.set_color("font_color", "OptionButton", INK)
	t.set_stylebox("panel", "PopupMenu", box(Color("#1c1c23"), 10, Vector4(6, 6, 6, 6), Color(1, 1, 1, 0.15), 1, 10))
	t.set_color("font_color", "PopupMenu", INK)
	t.set_stylebox("hover", "PopupMenu", box(Color(1, 0.82, 0.4, 0.2), 6))
	# 스크롤 막대: 가늘고 흐리게
	var bar := box(Color(1, 1, 1, 0.05), 3, Vector4(2, 2, 2, 2))
	var grab := box(Color(1, 1, 1, 0.25), 3, Vector4(2, 2, 2, 2))
	t.set_stylebox("scroll", "VScrollBar", bar)
	t.set_stylebox("grabber", "VScrollBar", grab)
	t.set_stylebox("grabber_highlight", "VScrollBar", box(Color(1, 1, 1, 0.4), 3, Vector4(2, 2, 2, 2)))
	t.set_stylebox("grabber_pressed", "VScrollBar", box(Color(1, 1, 1, 0.5), 3, Vector4(2, 2, 2, 2)))
	t.set_stylebox("panel", "ScrollContainer", StyleBoxEmpty.new())
	t.set_stylebox("panel", "PanelContainer", StyleBoxEmpty.new())
	_theme = t
	return t


## 켜짐/꺼짐 스위치 그림 (체크 상자 대신)
static func _switch_icon(on: bool) -> Texture2D:
	var w := 40
	var h := 22
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var track := Color(1, 0.82, 0.4, 0.8) if on else Color(1, 1, 1, 0.18)
	var r := h / 2.0
	for y in h:
		for x in w:
			var cx := clampf(x + 0.5, r, w - r)
			var d := Vector2(x + 0.5 - cx, y + 0.5 - r).length()
			var a := clampf(r - d, 0.0, 1.0)
			if a > 0:
				img.set_pixel(x, y, Color(track, track.a * a))
	var knob_x := w - r if on else r
	for y in h:
		for x in w:
			var d := Vector2(x + 0.5 - knob_x, y + 0.5 - r).length()
			var a := clampf(r - 3.0 - d, 0.0, 1.0)
			if a > 0:
				img.set_pixel(x, y, img.get_pixel(x, y).blend(Color(1, 0.97, 0.9, a)))
	return ImageTexture.create_from_image(img)


static func _dot_icon(c: Color, size: int) -> Texture2D:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var r := size / 2.0
	for y in size:
		for x in size:
			var d := Vector2(x + 0.5 - r, y + 0.5 - r).length()
			var a := clampf(r - 1.0 - d, 0.0, 1.0)
			if a > 0:
				img.set_pixel(x, y, Color(c, a))
	return ImageTexture.create_from_image(img)


## RichTextLabel BBCode에 넣을 글 (대괄호가 태그로 읽히지 않게)
static func esc(s: String) -> String:
	return s.replace("[", "[lb]")


## 색 → BBCode 색 문자열
static func hex(c: Color) -> String:
	return "#" + c.to_html(c.a < 1.0)
