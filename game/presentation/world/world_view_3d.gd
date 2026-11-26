class_name WorldView3D
extends Node3D

## 3D 시점: 위에서 비스듬히 내려다보는 장면 (웹 판 three/Scene3D.ts + Renderer.ts drawWorld3d·crowdLook·headToward).
## 게임 판정(충돌·시야·길찾기)은 2D 타일 그대로이고, 이 장면은 그리기만 한다 (세션을 읽기만 한다).
## 바닥은 타일 번호 텍스처 + 색표 셰이더, 벽·가구는 높이만큼 세운 상자, 사람은 도형(PersonRig)을 조합한다.
## 시야 콘·시선 선·소리 파동 같은 바닥 표시는 OverlayMarks가 SubViewport에 그린 그림을 바닥 바로 위 평면에 덮는다.
## 넓은 도시는 층마다 LayerView3D가 카메라 둘레 16×16 청크만 만들고, 멀어진 청크는 버린다.
## 좌표: 월드 (x, y) → Godot (x, 0, y). 높이는 Godot y.
##
## 쓰는 법 (메인 씬):
##   var view := WorldView3D.new(); add_child(view); view.setup(cfg, session.world)
##   매 프레임: view.update_view(session, presentation_state, settings, dt)
##   UI: view.project(월드 위치 Vector2, 높이 칸) → 화면 좌표 (이름표·독백·상호작용 안내)

const PERSON_TTL := 4.0
const BUS_LENGTH := 10.5
const BUS_WIDTH := 2.4
const BUS_BODY := "#6fb48a"
const UMBRELLAS := ["#3b6fb6", "#2f3e46", "#c0392b", "#f2c94c", "#5b7d63", "#e8e2d6", "#6c5b7b"]
const FONT_PATH := "res://game/assets/fonts/NotoSansKR-subset.ttf"
## 바닥 무늬 번호 (tile_floor.gdshader)
const PATTERNS := {"grid": 1, "plank": 2, "stripe": 3, "dots": 4}
const SPECIALS := {"sidewalk": 1, "plaza": 2, "road": 3, "water": 4}
## 층 높이 배율을 받는 구조물 (LayerView3D와 같다)
const STRUCTURE := ["wall", "window", "doorClosed"]
## 빛의 세기 (낮). 그늘이 너무 깊지 않게 하늘빛을 넉넉히, 해는 따뜻하고 약하게
const AMBIENT := 0.42
const SUN := 0.5

var cfg: Dictionary
var world: World
var cfg3: Dictionary
var heights: Dictionary
var camera: Camera3D
## 공유 재질 (층·청크마다 만들지 않는다)
var floor_material: ShaderMaterial
var pot_mat: StandardMaterial3D
var leaf_mat: ShaderMaterial
var trunk_mat: StandardMaterial3D
var canopy_mat: ShaderMaterial
var canopy_ghost: ShaderMaterial
## 지금 벽이 솟은 배율 (가리는 것 계산에 쓴다, 0.1 단위)
var grow_now := 1.0
## 0(낮) ~ 1(밤). 실내 층이면 0
var night := 0.0
## 플레이어가 실내에 있는지
var indoor := false
## 시간대 빛깔 (a = 세기). UI가 쓸 수 있게 둔다
var time_tint := Color(1, 1, 1, 0)
var layer_id := ""

var _font: Font
var _palette: Dictionary
var _tile_index := {}
var _mats := {}
var _layers := {}
var _layer: LayerView3D = null
var _roofs: Roofs
var _sun: DirectionalLight3D
var _glow: OmniLight3D
var _env: Environment
var _overlay_vp: SubViewport
var _overlay: OverlayMarks
var _overlay_plane: MeshInstance3D
var _people := {}
var _buses := {}
var _beacons: Array = []
var _facings := {}
var _looks := {}
var _cam := Vector2.ZERO
var _first := true
var _outdoorness := 1.0
var _time := 0.0
var _rain: CPUParticles3D
var _view_h := 720.0


# ───────────────────────── 준비 ─────────────────────────

func setup(config: Dictionary, w: World) -> void:
	cfg = config
	world = w
	cfg3 = cfg["presentation"]["view3d"]
	heights = cfg["presentation"]["view25d"]["heights"]
	_palette = cfg3.get("palette", {})
	_font = load(FONT_PATH)
	for i in cfg["tiles"].size():
		_tile_index[cfg["tiles"][i]["id"]] = i
	_build_floor_resources()
	_build_shared_materials()
	_build_lights()
	_build_overlay()
	_build_rain()
	camera = Camera3D.new()
	camera.fov = float(cfg3["fov"])
	camera.near = 0.5
	camera.far = 400.0
	add_child(camera)
	camera.current = true
	for l in world.def["layers"]:
		if l["id"] == "ground":
			_roofs = Roofs.new(world.def["areas"], l["rect"], float(cfg["presentation"]["ambient"]["roofFadeSec"]))


## 3D 전용 부드러운 색 (presentation.json view3d.palette), 없으면 기본색
func color_of(key: String, fallback: String) -> Color:
	return Color(_palette.get(key, fallback))


func _tile_def(id: String) -> Dictionary:
	return cfg["tiles"][_tile_index[id]] if _tile_index.has(id) else {}


## 바닥: 맵 전체의 타일 번호 텍스처(1칸 = 1텍셀) + 색표. 나무·화분·가구 밑에는 둘레 바닥을 깐다
func _build_floor_resources() -> void:
	var map: CityGrid = world.map
	var defs: Array = map.defs
	var lift := PackedByteArray()
	lift.resize(defs.size())
	for i in defs.size():
		var id: String = defs[i]["id"]
		lift[i] = 1 if (id == "tree" or id == "plant" or (float(heights.get(id, 0.0)) > 0 and not (id in STRUCTURE))) else 0
	var bytes := PackedByteArray()
	bytes.resize(map.width * map.height)
	var tiles := map.tiles
	var W := map.width
	var H := map.height
	for y in H:
		var row := y * W
		for x in W:
			var t := tiles[row + x]
			if lift[t] == 1:
				# 둥근 나무·화분·가구 밑: 걸을 수 있는 이웃 바닥
				for d in [Vector2i(-1, 0), Vector2i(0, -1), Vector2i(1, 0), Vector2i(0, 1)]:
					var nx: int = x + d.x
					var ny: int = y + d.y
					if nx >= 0 and ny >= 0 and nx < W and ny < H:
						var nt := tiles[ny * W + nx]
						if defs[nt].get("walk", false):
							t = nt
							break
			bytes[row + x] = t
	var img := Image.create_from_data(W, H, false, Image.FORMAT_R8, bytes)
	var ids := ImageTexture.create_from_image(img)
	# 색표: 0줄 = 색 + 무늬, 1줄 = 줄눈 색 + 특수 (sRGB 그대로: 호환 렌더러가 텍스처를 sRGB로 읽는다)
	var pal := Image.create(defs.size(), 2, false, Image.FORMAT_RGBA8)
	for i in defs.size():
		var d: Dictionary = defs[i]
		var c0 := Color(d["color"])
		c0.a8 = PATTERNS.get(d.get("pattern", ""), 0)
		pal.set_pixel(i, 0, c0)
		var c1 := Color(d.get("accent", d["color"]))
		c1.a8 = SPECIALS.get(d["id"], 0)
		pal.set_pixel(i, 1, c1)
	floor_material = ShaderMaterial.new()
	floor_material.shader = load("res://game/presentation/shaders/tile_floor.gdshader")
	floor_material.set_shader_parameter("tile_ids", ids)
	floor_material.set_shader_parameter("palette", ImageTexture.create_from_image(pal))
	floor_material.set_shader_parameter("map_origin", Vector2.ZERO)
	floor_material.set_shader_parameter("tint", color_of("floorTint", "#ffffff"))


func _shader_mat(path: String, color: Color, roughness: float = 0.9) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load(path)
	m.set_shader_parameter("albedo", color)
	m.set_shader_parameter("roughness_v", roughness)
	return m


func _build_shared_materials() -> void:
	var tr_def := _tile_def("tree")
	canopy_mat = _shader_mat("res://game/presentation/shaders/canopy.gdshader", color_of("tree", tr_def.get("color", "#4f7a4b")), 0.95)
	canopy_mat.set_shader_parameter("wind_amp", 0.05)
	canopy_ghost = _shader_mat("res://game/presentation/shaders/canopy_ghost.gdshader", color_of("tree", tr_def.get("color", "#4f7a4b")), 0.95)
	canopy_ghost.set_shader_parameter("wind_amp", 0.05)
	canopy_ghost.set_shader_parameter("opacity", float(cfg3["occluderAlpha"]))
	leaf_mat = _shader_mat("res://game/presentation/shaders/canopy.gdshader", color_of("plant", _tile_def("plant").get("color", "#6a9a5b")), 0.95)
	leaf_mat.set_shader_parameter("wind_amp", 0.015)
	trunk_mat = WorldMeshes.std_mat(color_of("trunk", "#6b4f3a"), 0.95)
	pot_mat = WorldMeshes.std_mat(color_of("pot", "#b5764f"), 0.9)


## 벽·가구 재질 (타일 종류마다 하나, 가리는 것을 비칠 반투명 짝과 함께)
## → { mat, ghost, tall(솟는지), dim(솟으면 어두워지는지), glass }
func mat_for(id: String) -> Dictionary:
	if _mats.has(id):
		return _mats[id]
	var def := _tile_def(id)
	var glass := id == "window"
	var col := color_of(id, "#a9cbd8" if glass else def.get("color", "#cccccc"))
	var mat: ShaderMaterial
	if glass:
		mat = _shader_mat("res://game/presentation/shaders/block_ghost.gdshader", col, 0.2)
		mat.set_shader_parameter("opacity", 0.5)
	else:
		mat = _shader_mat("res://game/presentation/shaders/block.gdshader", col, 0.9)
	var ghost := _shader_mat("res://game/presentation/shaders/block_ghost.gdshader", col, 0.2 if glass else 0.9)
	ghost.set_shader_parameter("opacity", minf(0.5 if glass else 1.0, float(cfg3["occluderAlpha"])))
	var tall: bool = def.get("tall", false)
	var m := {"mat": mat, "ghost": ghost, "tall": tall, "dim": tall and not glass, "glass": glass}
	_mats[id] = m
	return m


func _build_lights() -> void:
	var we := WorldEnvironment.new()
	_env = Environment.new()
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = Color(cfg3["sky"]["day"])
	_env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	_env.ambient_light_color = Color("#fff3e8")
	_env.ambient_light_energy = 1.0
	# 톤 매핑: 밝은 곳이 하얗게 타지 않고 부드럽게 눕는다
	_env.tonemap_mode = Environment.TONE_MAPPER_AGX
	_env.tonemap_exposure = float(cfg3.get("exposure", 1.0))
	# 번지는 빛은 화면 효과(psych_screen의 soft)가 맡는다. 여기서 켜면 흰 벽이 화면 전체로 번진다
	_env.glow_enabled = false
	_env.fog_enabled = true
	_env.fog_mode = Environment.FOG_MODE_DEPTH
	_env.fog_light_color = Color(cfg3["sky"]["day"])
	_env.fog_density = 1.0
	_env.fog_sky_affect = 0.0
	_env.fog_depth_curve = 1.0
	we.environment = _env
	add_child(we)
	# 비스듬한 해 (그림자). 그늘이 너무 깊지 않게 하늘빛을 넉넉히, 해는 따뜻하고 약하게
	_sun = DirectionalLight3D.new()
	_sun.light_color = Color("#ffe7cc")
	_sun.light_energy = 1.0
	_sun.shadow_enabled = bool(cfg3.get("shadows", true))
	_sun.shadow_blur = float(cfg3.get("shadowSoftness", 7)) * 0.25
	_sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	_sun.directional_shadow_max_distance = 70.0
	_sun.shadow_bias = 0.04
	_sun.shadow_normal_bias = 1.0
	add_child(_sun)
	_glow = OmniLight3D.new()
	_glow.light_color = Color("#ffd9a0")
	_glow.omni_range = 7.0
	_glow.omni_attenuation = 1.6
	_glow.light_energy = 0.0
	add_child(_glow)


func _build_overlay() -> void:
	_overlay_vp = SubViewport.new()
	_overlay_vp.size = Vector2i(OverlayMarks.TILES_W * OverlayMarks.PX, OverlayMarks.TILES_H * OverlayMarks.PX)
	_overlay_vp.transparent_bg = true
	_overlay_vp.disable_3d = true
	_overlay_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(_overlay_vp)
	_overlay = OverlayMarks.new()
	_overlay.setup(cfg, world, _font)
	_overlay_vp.add_child(_overlay)
	var pm := PlaneMesh.new()
	pm.size = Vector2(OverlayMarks.TILES_W, OverlayMarks.TILES_H)
	_overlay_plane = MeshInstance3D.new()
	_overlay_plane.mesh = pm
	var m := StandardMaterial3D.new()
	# 바닥 표시는 2D와 같은 색 그대로 (빛·그림자를 받지 않는다)
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	m.albedo_texture = _overlay_vp.get_texture()
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR
	m.disable_fog = true
	m.render_priority = 1
	_overlay_plane.material_override = m
	_overlay_plane.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_overlay_plane)


## 빗줄기: 카메라 둘레에만 떨어진다
func _build_rain() -> void:
	_rain = CPUParticles3D.new()
	_rain.amount = 700
	_rain.lifetime = 0.7
	_rain.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	_rain.emission_box_extents = Vector3(30, 0.5, 22)
	_rain.direction = Vector3(0.12, -1, 0.05)
	_rain.spread = 2.0
	_rain.gravity = Vector3(0, -20, 0)
	_rain.initial_velocity_min = 18.0
	_rain.initial_velocity_max = 24.0
	var q := QuadMesh.new()
	q.size = Vector2(0.03, 0.7)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_color = Color(0.85, 0.9, 1.0, 0.35)
	m.billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y
	m.billboard_keep_scale = true
	q.material = m
	_rain.mesh = q
	_rain.local_coords = false
	_rain.emitting = false
	_rain.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_rain)


# ───────────────────────── 층 ─────────────────────────

func _ensure_layer(target: Vector2) -> void:
	var lid := world.layer_of(target)
	if _layer != null and lid == layer_id:
		return
	layer_id = lid
	var layer: Dictionary = {}
	for l in world.def["layers"]:
		if l["id"] == lid:
			layer = l
	if not _layers.has(lid):
		var r: Array = layer["rect"]
		var labels: Array = []
		for l in world.def.get("labels", []):
			if CityGrid.in_rect(r, l["at"][0], l["at"][1]):
				labels.append({"x": float(l["at"][0]), "y": float(l["at"][1]), "text": DataLoader.t(cfg["text"], l["textKey"]), "color": l.get("color", "")})
		var lamps: Array = []
		for p in world.def.get("props", []):
			if p["kind"] == "lamp" and CityGrid.in_rect(r, p["at"][0], p["at"][1]):
				lamps.append(Vector2(p["at"][0], p["at"][1]))
		var lv := LayerView3D.new(self, world.map, layer, labels, lamps, _roofs if lid == "ground" else null)
		add_child(lv)
		_layers[lid] = lv
	for k in _layers:
		(_layers[k] as Node3D).visible = k == lid
	_layer = _layers[lid]
	# 실내 층: 따뜻한 어둠
	var outdoor := lid == "ground"
	_env.fog_enabled = outdoor
	if not outdoor:
		_env.background_color = Color(cfg3["sky"]["indoor"])


## 간판: 눈높이(또는 지붕 위)에 세운 판. 늘 카메라를 본다
func make_label(l: Dictionary) -> Node3D:
	var g := Node3D.new()
	var fs := 44
	var px := 0.85 / 72.0
	var text: String = l["text"]
	var tw := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x + 40.0
	var colored: bool = l.get("color", "") != ""
	var q := QuadMesh.new()
	q.size = Vector2(tw * px, 0.85)
	var bg := MeshInstance3D.new()
	bg.mesh = q
	var bm := StandardMaterial3D.new()
	bm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	bm.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	bm.albedo_color = Color(l["color"]) if colored else Color(0.157, 0.149, 0.173, 0.82)
	bm.disable_fog = true
	bm.render_priority = 2
	bg.material_override = bm
	bg.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	g.add_child(bg)
	var lab := Label3D.new()
	lab.text = text
	lab.font = _font
	lab.font_size = fs
	lab.pixel_size = px
	lab.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lab.modulate = Color("#fffaf0") if colored else Color("#f3ead8")
	lab.outline_size = 0
	lab.shaded = false
	lab.double_sided = true
	lab.fixed_size = false
	lab.no_depth_test = false
	lab.render_priority = 3
	lab.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	lab.position = Vector3(0, -0.02, 0)
	g.add_child(lab)
	return g


# ───────────────────────── 매 프레임 ─────────────────────────

## 세션 상태로 장면을 맞춘다. s = GameSession, ps = PresentationState, st = Settings
func update_view(s, ps: PresentationState, st: Settings, dt: float) -> void:
	_time = ps.time
	var vp := get_viewport()
	var vsize := vp.get_visible_rect().size if vp else Vector2(1280, 720)
	_view_h = vsize.y
	var pc: Dictionary = cfg["presentation"]
	var p = s.player
	var mode: Dictionary = s.mode
	var kind: String = mode.get("kind", "free")

	# 카메라: 플레이어 (외시경이면 복도)
	var target: Vector2 = s.view_target if s.view_target != null else p.pos
	_ensure_layer(target)
	_follow(target, dt, float(pc["camera"]["followLerp"]), _first or kind == "travel")
	_first = false
	var on_ground := layer_id == "ground"
	var dist_k := st.distortion
	var peep := -0.35 if kind == "peephole" else 0.0
	var zoom := 1.0 + peep - float(pc["camera"]["dangerZoomOut"]) * (ps.danger * 0.7 + ps.critical * 0.3) * dist_k + ps.phone * 0.12 + ps.sanctuary * 0.05
	# 작은 화면은 2D처럼 더 멀리서 (휴대폰 가로 화면에서 주변이 충분히 보이게)
	var small := clampf(minf(vsize.x / 1280.0, vsize.y / 720.0), 0.55, 1.0)
	var zoom3d := clampf(zoom, 0.6, 1.3) * small
	var close_in := minf(1.0, float(pc["fx"]["wallCloseIn"]) * (ps.danger + ps.critical * 0.6) * dist_k * 2.5)
	var pitch := deg_to_rad(float(cfg3["pitchDeg"]))
	var dist := float(cfg3["distance"]) * (1.0 + (float(cfg3["dangerDistance"]) - 1.0) * close_in) / maxf(0.3, zoom3d)
	camera.position = Vector3(_cam.x, sin(pitch) * dist, _cam.y + cos(pitch) * dist)
	camera.look_at(Vector3(_cam.x, 0, _cam.y), Vector3.UP)
	# 기습: 화면 흔들림 (픽셀 → 칸), 진땀이면 미세 떨림
	var unit_px := 2.0 * dist * tan(deg_to_rad(camera.fov) / 2.0) / maxf(1.0, vsize.y)
	var shake := ps.trauma * ps.trauma * float(pc["camera"]["shakePx"]) if st.shake else 0.0
	camera.h_offset = ((randf() * 2.0 - 1.0) * shake + (sin(ps.time * 40.0) * ps.sweat * 0.6 if st.shake else 0.0)) * unit_px
	camera.v_offset = (randf() * 2.0 - 1.0) * shake * unit_px

	night = _night_level(s) if on_ground else 0.0
	var raining: bool = s.raining()
	indoor = not on_ground or not _outdoor_at(p.pos)
	var hide_player: bool = kind == "travel" or kind == "metro" or (kind == "bus" and mode.get("phase", "") == "riding")
	var focus: Variant = null if hide_player else p.pos
	if _roofs:
		_roofs.update(dt, p.pos)

	_light(s, dt, dist, focus)
	var grow := 1.0 + float(cfg3.get("dangerGrow", 0.0)) * close_in * (1.0 + 0.05 * sin(ps.time * 2.0))
	_update_materials(close_in, grow)
	grow_now = snappedf(1.0 + float(cfg3.get("dangerGrow", 0.0)) * close_in, 0.1)
	_layer.stream(_cam)
	_layer.update_cutaway(focus, grow_now)
	_layer.update_roofs(_cam, focus, 1.0 + float(cfg3.get("dangerGrow", 0.0)) * close_in, dt)
	_layer.update_labels(_cam)
	_layer.set_night(night)

	# 바닥 표시: 카메라 둘레를 SubViewport에 그려 바닥 바로 위에
	var origin := Vector2(floorf(_cam.x - OverlayMarks.TILES_W / 2.0), floorf(_cam.y - OverlayMarks.TILES_H / 2.0 + 4.0))
	_overlay_plane.position = Vector3(origin.x + OverlayMarks.TILES_W / 2.0, 0.02, origin.y + OverlayMarks.TILES_H / 2.0)
	_overlay.refresh(s, ps, st, dt, origin, _layer.rect, night)

	_update_people(s, ps, st, dt, hide_player)
	_update_buses(s, dt, on_ground)
	_update_beacons(s, ps, close_in)
	var rain_here := raining and on_ground and not indoor
	_rain.emitting = rain_here
	_rain.global_position = Vector3(_cam.x, 14.0, _cam.y + 4.0)


func _follow(target: Vector2, dt: float, lerp_k: float, snap: bool) -> void:
	if snap or _cam.distance_to(target) > 30.0:
		_cam = target
		return
	_cam += (target - _cam) * (1.0 - exp(-lerp_k * dt))


## 0(낮) ~ 1(밤)
func _night_level(s) -> float:
	var n: Dictionary = cfg["presentation"]["night"]
	var a := DayCycle.parse_time(n["duskStart"])
	var b := DayCycle.parse_time(n["duskEnd"])
	var dusk := clampf((float(s.clock.minutes) - a) / (b - a), 0.0, 1.0)
	return maxf(dusk, float(n["rainOvercast"]) if s.raining() else 0.0)


func _outdoor_at(p: Vector2) -> bool:
	var a: Variant = world.map.area_at(p.x, p.y)
	return a != null and a["kind"] == "outdoor"


## 시간대 빛깔 (아침 푸르스름, 노을빛). presentation.json ambient.timeTint
func _time_tint(minutes: float) -> Color:
	var keys: Array = cfg["presentation"]["ambient"].get("timeTint", [])
	if keys.is_empty():
		return Color(1, 1, 1, 0)
	var at := func(k: Dictionary) -> Color:
		var c := Color(k["color"])
		c.a = float(k["alpha"])
		return c
	if minutes <= DayCycle.parse_time(keys[0]["at"]):
		return at.call(keys[0])
	for i in keys.size() - 1:
		var ta := DayCycle.parse_time(keys[i]["at"])
		var tb := DayCycle.parse_time(keys[i + 1]["at"])
		if minutes <= tb:
			return (at.call(keys[i]) as Color).lerp(at.call(keys[i + 1]), (minutes - ta) / maxf(1.0, tb - ta))
	return at.call(keys[keys.size() - 1])


## 빛: 밤에는 해와 하늘빛이 줄고 창·가로등에 불이 켜진다. 실내에 들어서면 불 켜진 방이라 덜 어둡다.
## 하늘·안개: 지상은 멀수록 하늘색으로 옅어진다 (낮 → 노을 → 밤)
func _light(s, dt: float, dist: float, focus: Variant) -> void:
	var t := _cam
	var sun_pos := Vector3(t.x - 12, 26, t.y - 7)
	_sun.global_transform = Transform3D(Basis(), sun_pos).looking_at(Vector3(t.x, 0, t.y), Vector3.UP)
	var nd := float(cfg3["night"]["dim"]) * night * (0.35 if indoor else 1.0)
	# 시간대 빛깔: 바깥에서는 또렷하게, 실내에서는 약하게
	var outdoor_target := 1.0 if (layer_id == "ground" and not indoor) else 0.35
	_outdoorness += (outdoor_target - _outdoorness) * minf(1.0, dt * 3.0)
	time_tint = _time_tint(float(s.clock.minutes)) if layer_id == "ground" else Color(1, 1, 1, 0)
	var tint_k := time_tint.a * _outdoorness * 2.2
	var tint := Color(time_tint.r, time_tint.g, time_tint.b)
	var amb := Color("#fff6e6").lerp(Color("#9fb0e8"), night * 0.7).lerp(tint, clampf(tint_k, 0.0, 0.6))
	_env.ambient_light_color = amb
	_env.ambient_light_energy = AMBIENT * (1.0 - nd)
	_sun.light_color = Color("#ffe7cc").lerp(tint, clampf(tint_k, 0.0, 0.6))
	_sun.light_energy = SUN * maxf(0.0, 1.0 - nd * 1.3)
	_glow.light_energy = float(cfg3["night"]["playerLight"]) * night * (0.3 if indoor else 1.0) * 1.5
	if focus != null:
		_glow.position = Vector3(focus.x, 1.3, focus.y)
	var win: Variant = _mats.get("window")
	if win != null:
		win["mat"].set_shader_parameter("emission_color", Color("#ffd99a"))
		win["mat"].set_shader_parameter("emission_energy", night * 0.8)
	if layer_id == "ground":
		var sky: Dictionary = cfg3["sky"]
		var col := Color(sky["day"]).lerp(Color(sky["dusk"]), minf(1.0, night * 2.0)).lerp(Color(sky["night"]), maxf(0.0, night * 2.0 - 1.0))
		_env.background_color = col
		_env.fog_light_color = col
		_env.fog_depth_begin = dist * float(sky["fogNear"])
		_env.fog_depth_end = dist * float(sky["fogFar"])
	floor_material.set_shader_parameter("time", _time)
	canopy_mat.set_shader_parameter("wind_time", _time)
	canopy_ghost.set_shader_parameter("wind_time", _time)
	leaf_mat.set_shader_parameter("wind_time", _time)


## Danger 이하: 키 큰 벽·가구가 솟고, 솟은 것은 어두워진다 (짓눌리는 느낌). 비쳐 보이는 짝도 같은 값
func _update_materials(close_in: float, grow: float) -> void:
	for id in _mats:
		var m: Dictionary = _mats[id]
		var g := grow if m["tall"] else 1.0
		var d := 0.4 * close_in if m["dim"] else 0.0
		for k in ["mat", "ghost"]:
			var sm: ShaderMaterial = m[k]
			sm.set_shader_parameter("grow", g)
			sm.set_shader_parameter("dim", d)


# ───────────────────────── 사람 ─────────────────────────

static func player_look(top: String, skin: String) -> Dictionary:
	return {"skin": skin, "hair": "#3a2c25", "hairStyle": "short", "top": top, "accessory": "none", "accent": "#4b5563", "pattern": "hoodie", "shoes": "#f4f1ea", "bottom": "#3d4f6b", "build": 1.0}


## 몸이 향한 방향 기준으로, 이 점을 보려면 고개를 얼마나 돌려야 하는지 (-π~π)
static func head_toward(from: Vector2, facing: float, to: Vector2) -> float:
	var d := atan2(to.y - from.y, to.x - from.x) - facing
	return atan2(sin(d), cos(d))


## 실제 방향을 따라 부드럽게 도는 '보이는 방향'
func _turned(id: String, target: float, dt: float) -> float:
	var next: float = target if not _facings.has(id) else lerp_angle(_facings[id], target, minf(1.0, dt * 12.0))
	_facings[id] = next
	return next


func _look_of(n) -> Dictionary:
	if not _looks.has(n.id):
		var prof: Dictionary = n.profile
		_looks[n.id] = Looks.look_for(n.id, prof.get("color", "#888888"), prof.get("look", {}), Looks.NAMED_ACCESSORIES)
	return _looks[n.id]


## 행인 생김새: 피곤할수록 얼굴 없는 회색 덩어리처럼 보인다. 비 오는 날 바깥 행인은 대부분 우산을 쓴다
func crowd_look(s, ps: PresentationState, a: Dictionary) -> Dictionary:
	var grey := minf(1.0, ps.tired * 0.6 + ps.danger * 0.4)
	var sat := roundf(30.0 * (1.0 - grey))
	var id: int = a["id"]
	var key := "crowd%d" % id
	if not _looks.has(key):
		_looks[key] = Looks.look_for(key, "#000000")
	var base: Dictionary = (_looks[key] as Dictionary).duplicate()
	if s.raining() and id % 5 != 0 and _outdoor_at(a["pos"]):
		base["accessory"] = "umbrella"
		base["accent"] = UMBRELLAS[id % UMBRELLAS.size()]
	var hue := float(a["hue"])
	base["top"] = Looks.hsl_hex(hue, sat, 52.0 - ps.danger * 12.0)
	if grey > 0.5:
		base["skin"] = Looks.hsl_hex(hue, 6, 70.0 - ps.danger * 10.0)
		base["hair"] = Looks.hsl_hex(hue, 6, 34)
		if base["accessory"] != "umbrella":
			base["accessory"] = "none"
	return base


func _update_people(s, ps: PresentationState, st: Settings, dt: float, hide_player: bool) -> void:
	var H := float(cfg3["personHeight"])
	var r: Array = _layer.rect
	var list: Array = []
	var p = s.player
	for n in s.active_npcs():
		if not CityGrid.in_rect(r, n.pos.x, n.pos.y) or absf(n.pos.x - _cam.x) > 40 or absf(n.pos.y - _cam.y) > 30:
			continue
		var pet: bool = n.npc_type == "pet"
		var look: Dictionary = _look_of(n)
		var hsh := Roofs.hash_of(n.id)
		if pet:
			look = look.duplicate()
			look["top"] = n.profile.get("color", "#c49a6c")
		elif s.raining() and _outdoor_at(n.pos):
			look = look.duplicate()
			look["accessory"] = "umbrella"
			look["accent"] = UMBRELLAS[hsh % UMBRELLAS.size()]
		var e := {
			"id": n.id, "x": n.pos.x, "y": n.pos.y, "facing": _turned(n.id, n.facing, dt), "look": look,
			"walking": n.speed > 0.1, "walkPhase": ps.time * 9.0 + (hsh % 100), "height": H * (0.94 + (hsh % 10) * 0.012),
			"kind": "cat" if pet else "person", "seated": n.state == "seated", "ally": n.npc_type == "ally",
			"running": n.speed > 2.6, "shadow": true,
			"gesture": "laugh" if (n.state == "dialogue" and n.gesture == "none") else n.gesture,
		}
		# 나를 알아챈 사람은 고개를 나에게 (대화 중엔 몸이 이미 나를 본다)
		if n.notice > 0.3 and n.state != "dialogue":
			e["headTurn"] = head_toward(n.pos, n.facing, p.pos)
		list.append(e)
	for a in s.crowd.agents:
		var ap: Vector2 = a["pos"]
		if not a["active"] or not CityGrid.in_rect(r, ap.x, ap.y) or absf(ap.x - _cam.x) > 34 or absf(ap.y - _cam.y) > 26:
			continue
		var dir: Vector2 = a["dir"]
		var id := "c%d" % a["id"]
		list.append({
			"id": id, "x": ap.x, "y": ap.y, "facing": _turned(id, atan2(dir.y, dir.x), dt), "look": crowd_look(s, ps, a),
			"walking": true, "walkPhase": a["phase"], "height": H * (1.08 if a["large"] else 0.92 + (int(a["id"]) % 10) * 0.014),
			"kind": "person", "crowd": true, "faceless": ps.danger > 0.3, "shadow": false,
		})
	if not hide_player:
		var look := player_look("#567a8f" if p.hidden else "#6c8fb2", "#f0dac4")
		if s.raining() and _outdoor_at(p.pos) and not p.biking:
			look["accessory"] = "umbrella"
			look["accent"] = "#3b6fb6"
		list.append({
			"id": "player", "x": p.pos.x, "y": p.pos.y, "facing": _turned("player", p.facing, dt), "look": look,
			"walking": p.moving and ps.cover < 0.3, "walkPhase": p.walk_phase, "height": H, "kind": "person",
			"blush": ps.flush, "sink": minf(1.0, ps.burnout_time / 1.5) if ps.burnout_time >= 0 else 0.0,
			"phone": ps.phone > 0.4, "bike": p.biking, "running": p.running,
			"tension": minf(1.0, ps.stress), "tired": minf(1.0, ps.tired * 0.6 + ps.danger * 0.6 + ps.critical * 0.4),
			"tremble": ps.sweat if st.shake else 0.0, "relax": ps.sanctuary, "shadow": true,
		})
	for e in list:
		var id: String = e["id"]
		var entry: Variant = _people.get(id)
		if entry == null:
			var rig := PersonRig.new()
			if e["kind"] == "cat":
				rig.build_cat(e["look"]["top"])
			else:
				rig.build_person(e["look"], e["height"], e["shadow"])
			_layer.add_child(rig)
			entry = {"rig": rig, "seen": _time, "layer": layer_id}
			_people[id] = entry
		elif entry["layer"] != layer_id:
			(entry["rig"] as Node3D).reparent(_layer, false)
			entry["layer"] = layer_id
		entry["seen"] = _time
		var g: PersonRig = entry["rig"]
		g.visible = true
		g.position.x = e["x"]
		g.position.z = e["y"]
		# 모형의 정면은 +x. 월드 방향 (cos f, sin f) → Godot (x, z)
		g.rotation.y = -float(e["facing"])
		var sink: float = e.get("sink", 0.0)
		g.scale = Vector3(1.0 + sink * 0.3, 1.0 - sink * 0.45, 1.0 + sink * 0.3)
		if e["kind"] == "cat":
			g.pose_cat(e, _time)
		else:
			g.pose(e, _time)
	# 안 보이는 사람은 숨기고, 한동안 안 보이면 버린다 (행인은 계속 바뀐다)
	for id in _people.keys():
		var entry: Dictionary = _people[id]
		if entry["seen"] == _time:
			continue
		(entry["rig"] as Node3D).visible = false
		if _time - entry["seen"] > PERSON_TTL:
			(entry["rig"] as Node3D).queue_free()
			_people.erase(id)
			_facings.erase(id)


# ───────────────────────── 버스·목표 표식 ─────────────────────────

func _update_buses(s, dt: float, on_ground: bool) -> void:
	var seen := {}
	if on_ground:
		for b in s.buses_on_road():
			var bx := float(b["x"])
			var by := float(b["y"])
			if absf(bx - _cam.x) > 50 or absf(by - _cam.y) > 35:
				continue
			var key := "%d:%s" % [int(b["dir"]), str(b["depart"])]
			seen[key] = true
			var e: Variant = _buses.get(key)
			if e == null:
				var g := WorldMeshes.make_bus(color_of("bus", BUS_BODY), BUS_LENGTH, BUS_WIDTH)
				add_child(g)
				e = {"node": g, "last_x": null, "spin": 0.0, "dip": 0.0}
				_buses[key] = e
			var node: Node3D = e["node"]
			# 바퀴는 달린 만큼 굴러가고, 차체는 달릴 때 살짝 흔들리며 설 때 앞으로 꾸벅
			var moved := 0.0 if e["last_x"] == null else absf(bx - float(e["last_x"]))
			e["last_x"] = bx
			e["spin"] -= moved / 0.45
			e["dip"] += ((1.0 if b["stopped"] else 0.0) - e["dip"]) * minf(1.0, dt * 3.0)
			for c in node.get_children():
				if String(c.name).begins_with("wheel"):
					(c as Node3D).rotation.z = e["spin"]
			var chassis: Node3D = node.get_node("chassis")
			chassis.position.y = sin(_time * 7.0 + bx * 0.3) * 0.02 if moved > 0.001 else 0.0
			chassis.rotation.z = -0.02 * sin(minf(1.0, e["dip"]) * PI)
			node.position = Vector3(bx, 0, by)
			node.rotation.y = PI if int(b["dir"]) == -1 else 0.0
			(chassis.get_node("brake") as Node3D).visible = b["stopped"]
			var glass: MeshInstance3D = chassis.get_node("glass")
			(glass.material_override as StandardMaterial3D).emission_energy_multiplier = night * 0.6
	for k in _buses.keys():
		if not seen.has(k):
			(_buses[k]["node"] as Node3D).queue_free()
			_buses.erase(k)


## 목표 지점: 떠 있는 금빛 화살표 (지붕 아래면 지붕 위에)
func _update_beacons(s, ps: PresentationState, close_in: float) -> void:
	var markers := {}
	for o in s.objectives.visible():
		var m: String = o["def"].get("marker", "")
		if m != "":
			markers[m] = true
	var pts: Array = []
	var r: Array = _layer.rect
	for it in world.interactables:
		var x := float(it["at"][0])
		var y := float(it["at"][1])
		if markers.has(it["id"]) and CityGrid.in_rect(r, x, y) and absf(x - _cam.x) < 45 and absf(y - _cam.y) < 32:
			pts.append(Vector2(x, y))
	while _beacons.size() < pts.size():
		var g := WorldMeshes.make_beacon()
		add_child(g)
		_beacons.append(g)
	var grow := 1.0 + float(cfg3.get("dangerGrow", 0.0)) * close_in
	for i in _beacons.size():
		var g: Node3D = _beacons[i]
		g.visible = i < pts.size()
		if not g.visible:
			continue
		var b: Vector2 = pts[i]
		var covered := _layer.roof_covers(b)
		var base := _layer.roof_height * grow + 0.9 if covered else 2.4
		g.position = Vector3(b.x, base + absf(sin(ps.time * 3.0)) * 0.3, b.y)
		g.rotation.y = ps.time * 1.2
		g.scale = Vector3.ONE * (1.0 + sin(ps.time * 4.0) * 0.07)


# ───────────────────────── 화면 좌표 ─────────────────────────

## 월드 점(높이 h칸) → 화면 좌표 (뷰포트 2D 좌표: 이름표·독백·상호작용 안내)
func project(world_pos: Vector2, height: float = 0.0) -> Vector2:
	if camera == null:
		return Vector2.ZERO
	return camera.unproject_position(Vector3(world_pos.x, height, world_pos.y))


## 이 월드 점이 카메라 앞에 있는지 (뒤에 있으면 project 값이 뒤집힌다)
func in_front(world_pos: Vector2, height: float = 0.0) -> bool:
	return camera != null and not camera.is_position_behind(Vector3(world_pos.x, height, world_pos.y))


## 디버그: 올라 있는 청크·사람·버스 수
func stats() -> Dictionary:
	return {"layer": layer_id, "chunks": _layer.chunk_count() if _layer else 0, "people": _people.size(), "buses": _buses.size()}
