class_name PsychLayer
extends CanvasLayer

## 3D 장면 위에 덮는 심리 연출 한 장 (psych_screen.gdshader). 웹 판 Renderer.composite·overlays의 강도 계산을 옮김.
## 연출 상태(PresentationState)와 설정만 읽는다.

var _rect: ColorRect
var _mat: ShaderMaterial
var _cfg: Dictionary
var _stretch_angle := 0.0


func setup(cfg: Dictionary) -> void:
	_cfg = cfg
	layer = 1
	_rect = ColorRect.new()
	_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_mat = ShaderMaterial.new()
	_mat.shader = load("res://game/presentation/shaders/psych_screen.gdshader")
	_rect.material = _mat
	add_child(_rect)
	var fx: Dictionary = cfg["presentation"]["fx"]
	var soft: Dictionary = cfg["presentation"]["soft"]
	_set_if(fx, "stressVignette", "stress_vignette")
	_set_if(fx, "tiredDesaturation", "tired_desat")
	_set_if(fx, "criticalTunnel", "critical_tunnel")
	_set_if(fx, "lightRadiusTiles", "light_radius_tiles")
	_set_if(fx, "lightRadiusCritical", "light_radius_critical")
	_set_if(fx, "burnoutFadeSec", "burnout_fade_sec")
	_set_if(fx, "chromaticPx", "chromatic_px")
	_set_if(fx, "migraineBlurPx", "migraine_blur_px")
	_set_if(fx, "flushHeight", "flush_height")
	_set_if(fx, "homeAmber", "home_amber")
	_set_if(soft, "saturate", "soft_saturate")
	_set_if(soft, "contrast", "soft_contrast")
	_set_if(soft, "glow", "soft_glow")
	_set_if(soft, "lift", "soft_lift")


func _set_if(src: Dictionary, key: String, uniform: String) -> void:
	if src.has(key) and (src[key] is float or src[key] is int):
		_mat.set_shader_parameter(uniform, float(src[key]))


## view: WorldView3D (화면 투영). s: GameSession
func update_layer(dt: float, s, ps: PresentationState, st: Settings, view) -> void:
	var m := _mat
	var p: Vector2 = s.player.pos
	var pp: Vector2 = view.project(p, 0.9)
	var unit := (view.project(p + Vector2(1, 0), 0.0) - view.project(p, 0.0)).length()
	m.set_shader_parameter("player_px", pp * _rect.get_viewport_transform().get_scale())
	m.set_shader_parameter("tile_px", maxf(4.0, unit))
	m.set_shader_parameter("time", ps.time)
	m.set_shader_parameter("distortion", st.distortion)
	for k in ["stress", "tired", "danger", "critical", "trauma", "hurt", "flush", "migraine", "sanctuary", "phone", "eyes", "warp", "beat", "awkward"]:
		m.set_shader_parameter(k, ps.get(k))
	m.set_shader_parameter("burnout", ps.burnout_time)
	m.set_shader_parameter("chromatic", st.chromatic)
	m.set_shader_parameter("flash", st.flash)
	m.set_shader_parameter("soft", st.soft_glow)
	# Danger: 진행 방향으로 공간이 늘어난다 (복도가 길어 보이는 원근 왜곡). 방향은 화면에서 잰다
	var stretch: float = float(_cfg["presentation"]["camera"]["dangerStretch"]) * (ps.danger + ps.critical * 0.5) * st.distortion
	var md: Variant = s.player.move_dir
	if md is Vector2 and md != Vector2.ZERO:
		var sd: Vector2 = view.project(p + md, 0.0) - view.project(p, 0.0)
		if sd.length() > 0.01:
			_stretch_angle = lerp_angle(_stretch_angle, sd.angle(), 0.05)
	m.set_shader_parameter("stretch", stretch)
	m.set_shader_parameter("stretch_axis", Vector2.from_angle(_stretch_angle))
	# 모드 덮개: 외시경, 이동 페이드, 지하철 차창, 엘리베이터
	var mode: Dictionary = s.mode
	var kind: String = mode["kind"]
	var code := 0
	var fade := 0.0
	match kind:
		"peephole":
			code = 1
		"travel":
			code = 2
			fade = clampf(minf(mode["timer"], mode["total"] - mode["timer"]) / 0.4, 0.0, 1.0)
		"metro":
			code = 3
			fade = maxf(0.0, minf(1.0, minf(mode["timer"] / 0.4, (mode["total"] - mode["timer"]) / 0.4)))
		"elevator":
			if mode.get("phase", "") == "riding":
				code = 4
	m.set_shader_parameter("mode", code)
	m.set_shader_parameter("mode_fade", fade)
