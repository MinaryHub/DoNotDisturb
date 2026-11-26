class_name PersonRig
extends Node3D

## 사람 모형과 움직임 (웹 판 three/Scene3D.ts makePerson·posePerson에서 옮김).
## 엉덩이에 매달린 다리(허벅지 → 무릎 → 정강이·신발), 엉덩이를 축으로 기우는 몸(몸통·목 → 머리, 어깨 → 위팔 → 팔꿈치 → 아래팔·손).
## 정면은 +x, 모든 관절은 z축으로 앞뒤로 접힌다. 월드 (x, y) → Godot (x, 0, y).
## 걷기·달리기는 서서히 섞이고, 서 있으면 숨쉬고 체중을 옮기고 두리번거리고 깜빡인다.
## 마음이 몸에: 긴장(어깨·움츠림·보폭·숨), 지침(고개), 집(풀린 어깨), 진땀(떨림)

const BLUSH := Color("#ee7a6c")

var is_cat := false
var hip_y := 0.0
var shoulder_y := 0.0
var look_key := ""
var seen_at := 0.0

var _top_mat: StandardMaterial3D
var _hair_mat: StandardMaterial3D
var _head_mat: StandardMaterial3D
var _cheek_mat: StandardMaterial3D
var _umbrella_mat: StandardMaterial3D
var _skin := Color.WHITE
var _nodes := {}
var _eyes: Array = []
var _hair_back: Node3D = null

# 부드러운 상태 (매 프레임 조금씩 따라간다)
var _last := -1.0
var _seed := 0.0
var _walk := 0.0
var _run := 0.0
var _tension := 0.0
var _tired := 0.0
var _relax := 0.0
var _phone := 0.0
var _head_yaw := 0.0
var _look_target := 0.0
var _look_timer := 2.0
var _blink := 0.0
var _blink_timer := 2.0


static func mat(color: Variant, roughness: float = 0.92) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color if color is Color else Color(color)
	m.roughness = roughness
	return m


func _mesh(mesh: Mesh, m: Material, parent: Node3D, pos: Vector3 = Vector3.ZERO, shadow: bool = true, node_name: String = "") -> MeshInstance3D:
	var o := MeshInstance3D.new()
	o.mesh = mesh
	o.material_override = m
	o.position = pos
	o.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(o)
	if node_name != "":
		_nodes[node_name] = o
	return o


func _group(node_name: String, parent: Node3D, pos: Vector3) -> Node3D:
	var g := Node3D.new()
	g.position = pos
	parent.add_child(g)
	_nodes[node_name] = g
	return g


static func capsule(radius: float, length: float) -> CapsuleMesh:
	var c := CapsuleMesh.new()
	c.radius = radius
	c.height = length + radius * 2.0
	c.radial_segments = 12
	c.rings = 4
	return c


static func sphere(radius: float, segs: int = 16) -> SphereMesh:
	var s := SphereMesh.new()
	s.radius = radius
	s.height = radius * 2.0
	s.radial_segments = segs
	s.rings = segs / 2
	return s


## 발밑의 번진 그림자 (해 그림자와 별개로 늘 깔려 바닥에 붙어 보인다)
static var _blob_tex: GradientTexture2D = null


static func blob_material() -> StandardMaterial3D:
	if _blob_tex == null:
		var g := Gradient.new()
		g.set_color(0, Color(0.24, 0.16, 0.2, 0.42))
		g.add_point(0.6, Color(0.24, 0.16, 0.2, 0.16))
		g.set_color(g.get_point_count() - 1, Color(0.24, 0.16, 0.2, 0.0))
		_blob_tex = GradientTexture2D.new()
		_blob_tex.gradient = g
		_blob_tex.fill = GradientTexture2D.FILL_RADIAL
		_blob_tex.fill_from = Vector2(0.5, 0.5)
		_blob_tex.fill_to = Vector2(1.0, 0.5)
		_blob_tex.width = 64
		_blob_tex.height = 64
	var m := StandardMaterial3D.new()
	m.albedo_texture = _blob_tex
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	return m


func _add_blob(size: float) -> void:
	var q := PlaneMesh.new()
	q.size = Vector2(size, size)
	_mesh(q, blob_material(), self, Vector3(0, 0.015, 0), false)


func build_person(look: Dictionary, height: float, shadow: bool) -> void:
	is_cat = false
	_seed = randf() * 100.0
	var H := height
	_top_mat = mat(look["top"])
	var skin_mat := mat(look["skin"])
	var W := 0.34 * float(look["build"])
	hip_y = H * 0.47
	var knee_drop := H * 0.23
	var bottom := mat(look["bottom"])
	var shoes := mat(look["shoes"])
	# 다리
	for side in [-1, 1]:
		var leg := _group("legL" if side < 0 else "legR", self, Vector3(0, hip_y, side * 0.085))
		_mesh(capsule(0.068, knee_drop - 0.1 - 0.136 + 0.136), bottom, leg, Vector3(0, -knee_drop / 2.0, 0), shadow)
		var knee := _group("kneeL" if side < 0 else "kneeR", leg, Vector3(0, -knee_drop, 0))
		var shin := hip_y - knee_drop - 0.05
		_mesh(capsule(0.06, shin - 0.1), bottom, knee, Vector3(0, -shin / 2.0, 0), shadow)
		var shoe := _mesh(sphere(0.075, 12), shoes, knee, Vector3(0.035, -shin - 0.012, 0), shadow)
		shoe.scale = Vector3(1.45, 0.62, 1.0)
	# 몸
	var body := _group("body", self, Vector3(0, hip_y, 0))
	var torso := _mesh(capsule(0.16, H * 0.17), _top_mat, body, Vector3(0, H * 0.66 - hip_y, 0), shadow, "torso")
	torso.scale = Vector3(0.78, 1.0, W / 0.32)
	shoulder_y = H * 0.79 - hip_y
	var upper := H * 0.155
	var fore := H * 0.15
	for side in [-1, 1]:
		var arm := _group("armL" if side < 0 else "armR", body, Vector3(0, shoulder_y, side * (W / 2.0 + 0.035)))
		_mesh(capsule(0.05, upper - 0.06), _top_mat, arm, Vector3(0, -upper / 2.0, 0), shadow)
		var elbow := _group("elbowL" if side < 0 else "elbowR", arm, Vector3(0, -upper, 0))
		_mesh(capsule(0.045, fore - 0.06), _top_mat, elbow, Vector3(0, -fore / 2.0, 0), shadow)
		_mesh(sphere(0.052, 10), skin_mat, elbow, Vector3(0, -fore - 0.02, 0), shadow)
	# 목 → 머리
	var neck := _group("neck", body, Vector3(0, H * 0.84 - hip_y, 0))
	_skin = Color(look["skin"])
	_head_mat = mat(look["skin"])
	var head := _mesh(sphere(0.178, 22), _head_mat, neck, Vector3(0.01, H * 0.065, 0), shadow, "head")
	var style: String = look["hairStyle"]
	if style != "bald":
		_hair_mat = mat(look["accent"] if style == "cap" else look["hair"])
		var cap := SphereMesh.new()
		cap.radius = 0.186
		cap.height = 0.186
		cap.is_hemisphere = true
		cap.radial_segments = 20
		cap.rings = 8
		var hair := _mesh(cap, _hair_mat, head, Vector3(-0.025, 0.01, 0), shadow)
		hair.rotation.z = 0.38
		if style in ["long", "ponytail", "bun"]:
			var back := _mesh(sphere(0.08 if style == "bun" else 0.11, 12), _hair_mat, head, Vector3(-0.14, 0.12 if style == "bun" else -0.04, 0), shadow)
			if style == "long":
				back.scale = Vector3(1, 1.6, 1)
			_hair_back = back
	# 눈(깜빡인다)과 볼의 옅은 분홍
	for side in [-1, 1]:
		_eyes.append(_mesh(sphere(0.021, 8), mat("#3a3038"), head, Vector3(0.165, 0.02, side * 0.06), false))
	_cheek_mat = mat("#f2918a", 1.0)
	_cheek_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_cheek_mat.albedo_color.a = 0.28
	for side in [-1, 1]:
		var cheek := _mesh(sphere(0.036, 10), _cheek_mat, head, Vector3(0.158, -0.04, side * 0.095), false)
		cheek.scale = Vector3(0.35, 0.65, 1)
	# 폰: 가슴 앞 (두 손으로 든다)
	var phone_m := mat("#2a2d36")
	phone_m.emission_enabled = true
	phone_m.emission = Color("#6a9fd8")
	var pb := BoxMesh.new()
	pb.size = Vector3(0.03, 0.14, 0.09)
	var phone := _mesh(pb, phone_m, body, Vector3(0.24, H * 0.62 - hip_y, 0), false, "phone")
	phone.rotation.z = 0.5
	phone.visible = false
	# 우산
	var umbrella := _group("umbrella", body, Vector3.ZERO)
	_umbrella_mat = mat(look["accent"], 0.8)
	_umbrella_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	var dome := SphereMesh.new()
	dome.radius = 0.66
	dome.height = 0.3
	dome.is_hemisphere = true
	_mesh(dome, _umbrella_mat, umbrella, Vector3(0.05, H * 1.0 - hip_y, 0), shadow)
	var stick := CylinderMesh.new()
	stick.top_radius = 0.012
	stick.bottom_radius = 0.012
	stick.height = H * 0.42
	_mesh(stick, mat("#4a4a4a"), umbrella, Vector3(0.12, H * 0.92 - hip_y, 0.12), false)
	umbrella.visible = false
	# 공유 자전거 (앞이 +x)
	var bike := _group("bike", self, Vector3.ZERO)
	var wheel := TorusMesh.new()
	wheel.inner_radius = 0.26
	wheel.outer_radius = 0.34
	for x in [-0.5, 0.5]:
		var w := _mesh(wheel, mat("#3a3c42"), bike, Vector3(x, 0.3, 0), shadow)
		w.rotation.x = PI / 2.0
	var frame := _mesh(capsule(0.03, 0.95), mat("#8fcc84"), bike, Vector3(0, 0.55, 0), shadow)
	frame.rotation.z = PI / 2.0 + 0.12
	var bar := _mesh(capsule(0.022, 0.45), mat("#4a4a4a"), bike, Vector3(0.45, 0.85, 0), shadow)
	bar.rotation.x = PI / 2.0
	bike.visible = false
	# 내 사람: 노란 빛
	var disc := CylinderMesh.new()
	disc.top_radius = 1.4
	disc.bottom_radius = 1.4
	disc.height = 0.01
	var aura_m := StandardMaterial3D.new()
	aura_m.albedo_color = Color(1.0, 0.85, 0.47, 0.22)
	aura_m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	aura_m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	aura_m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	var aura := _mesh(disc, aura_m, self, Vector3(0, 0.03, 0), false, "aura")
	aura.visible = false
	_add_blob(0.95)
	look_key = key_of(look)


static func key_of(look: Dictionary) -> String:
	return "%s|%s|%s|%s" % [look["top"], look["skin"], look["hair"], look["accent"]]


static func _approach(cur: float, target: float, rate: float, dt: float) -> float:
	return cur + (target - cur) * minf(1.0, rate * dt)


## p = Person3D { x, y, facing, look, walking, walkPhase, running?, tension?, tired?, tremble?, relax?, headTurn?, gesture?,
##                seated?, bike?, phone?, blush?, sink?, ally?, faceless? }
func pose(p: Dictionary, time: float) -> void:
	var dt := 1.0 / 60.0 if _last < 0 else clampf(time - _last, 0.0, 0.1)
	_last = time
	var look: Dictionary = p["look"]
	var key := key_of(look)
	if key != look_key:
		# 행인은 지칠수록 회색 덩어리로: 색만 갈아 끼운다
		look_key = key
		_top_mat.albedo_color = Color(look["top"])
		_skin = Color(look["skin"])
		if _hair_mat:
			_hair_mat.albedo_color = Color(look["accent"] if look["hairStyle"] == "cap" else look["hair"])
		_umbrella_mat.albedo_color = Color(look["accent"])
	_walk = _approach(_walk, 1.0 if p.get("walking", false) else 0.0, 7, dt)
	_run = _approach(_run, 1.0 if p.get("running", false) else 0.0, 5, dt)
	_tension = _approach(_tension, p.get("tension", 0.0), 2.5, dt)
	_tired = _approach(_tired, p.get("tired", 0.0), 1.5, dt)
	_relax = _approach(_relax, p.get("relax", 0.0), 1.5, dt)
	_phone = _approach(_phone, 1.0 if p.get("phone", false) else 0.0, 8, dt)
	var T := _tension
	var idle := 1.0 - _walk
	var t := time + _seed
	var phi: float = p.get("walkPhase", 0.0)
	var s := sin(phi)
	var c := cos(phi)
	var bike: bool = p.get("bike", false)
	var umbrella: bool = look.get("accessory", "") == "umbrella"
	var seated: bool = p.get("seated", false)

	# 다리: 허벅지가 흔들리고 앞으로 나오는 다리의 무릎이 접힌다. 긴장하면 보폭이 줄어든다
	var stride := (0.48 + _run * 0.38) * _walk * (1.0 - T * 0.3) * (1.0 - _tired * 0.2)
	var knee_amt := (0.55 + _run * 0.6) * _walk
	var legL: Node3D = _nodes["legL"]
	var legR: Node3D = _nodes["legR"]
	var kneeL: Node3D = _nodes["kneeL"]
	var kneeR: Node3D = _nodes["kneeR"]
	if seated:
		legL.rotation.z = 1.45
		legR.rotation.z = 1.45
		kneeL.rotation.z = -1.45
		kneeR.rotation.z = -1.45
	elif bike:
		legL.rotation.z = 0.75 + s * 0.35
		legR.rotation.z = 0.75 - s * 0.35
		kneeL.rotation.z = -1.0 - maxf(0.0, c) * 0.5
		kneeR.rotation.z = -1.0 - maxf(0.0, -c) * 0.5
	else:
		legL.rotation.z = stride * s
		legR.rotation.z = -stride * s
		kneeL.rotation.z = -(0.06 * _walk + knee_amt * maxf(0.0, c))
		kneeR.rotation.z = -(0.06 * _walk + knee_amt * maxf(0.0, -c))
		# 서 있을 때 한쪽 무릎을 살짝 풀고 체중을 옮긴다
		var shift := sin(t * 0.45) * idle
		kneeL.rotation.z -= maxf(0.0, shift) * 0.12
		kneeR.rotation.z -= maxf(0.0, -shift) * 0.12

	# 몸: 걸음마다 엇갈려 비틀리고, 달리면 앞으로 기운다
	var body: Node3D = _nodes["body"]
	body.rotation.y = _walk * 0.12 * s
	body.rotation.x = _walk * 0.035 * c + idle * sin(t * 0.45) * 0.03
	body.rotation.z = -(_run * _walk * 0.24 + T * 0.13 + _tired * 0.09) + _relax * 0.04 - _phone * 0.06
	var tremble: float = p.get("tremble", 0.0)
	body.position.z = (randf() - 0.5) * (tremble - 0.3) * 0.012 if tremble > 0.3 else 0.0
	# 숨: 긴장하면 빠르고 얕게, 집에서는 느리고 깊게
	var breath_rate := 2.0 + T * 2.2 - _relax * 0.7
	(_nodes["torso"] as Node3D).scale.y = 1.0 + sin(t * breath_rate) * (0.014 + _relax * 0.008)

	# 팔: 다리와 반대로 흔들고 팔꿈치는 살짝 접는다. 긴장하면 어깨가 오르고 팔이 몸에 붙는다
	var armL: Node3D = _nodes["armL"]
	var armR: Node3D = _nodes["armR"]
	var lift := T * 0.04 - _relax * 0.015
	armL.position.y = shoulder_y + lift
	armR.position.y = shoulder_y + lift
	var swing := stride * 0.95
	var idle_arm := idle * sin(t * 1.1) * 0.03
	var aL := -swing * s + idle_arm
	var aR := swing * s - idle_arm
	var eL := 0.12 + _walk * (0.15 + _run * 1.0) + T * 0.15
	var eR := eL
	var spread := 0.08 - T * 0.06
	# Three의 rotation.x는 Godot에서도 같은 축 (오른손 좌표계, y 위)
	armL.rotation.x = spread
	armR.rotation.x = -spread
	if _phone > 0.01:
		aL = aL * (1.0 - _phone) + 0.55 * _phone
		aR = aR * (1.0 - _phone) + 0.55 * _phone
		eL = eL * (1.0 - _phone) + 1.35 * _phone
		eR = eR * (1.0 - _phone) + 1.35 * _phone
		armL.rotation.x = spread * (1.0 - _phone) - 0.25 * _phone
		armR.rotation.x = -spread * (1.0 - _phone) + 0.25 * _phone
	if umbrella:
		aR = 0.9
		eR = 1.25
	if bike:
		aL = 0.85
		aR = 0.85
		eL = 0.5
		eR = 0.5
	match p.get("gesture", "none"):
		"reach":
			aR = 1.35 + sin(t * 3) * 0.05
			eR = 0.12
		"wave":
			aR = 2.6
			armR.rotation.x = -0.35
			eR = 0.5 + sin(t * 9) * 0.35
		"laugh":
			body.rotation.z += absf(sin(t * 11)) * 0.05
	armL.rotation.z = aL
	armR.rotation.z = aR
	(_nodes["elbowL"] as Node3D).rotation.z = eL
	(_nodes["elbowR"] as Node3D).rotation.z = eR
	(_nodes["phone"] as Node3D).visible = _phone > 0.5
	(_nodes["umbrella"] as Node3D).visible = umbrella
	(_nodes["bike"] as Node3D).visible = bike

	# 머리: 나를 알아챈 사람은 나를 보고, 한가하면 두리번. 긴장·지침·폰은 고개를 숙이게 한다
	_look_timer -= dt
	if _look_timer <= 0:
		_look_timer = 2.5 + randf() * 4.5
		_look_target = (randf() - 0.5) * (0.5 if _walk > 0.5 else 1.2) * (1.0 - T * 0.6)
	var head_turn: Variant = p.get("headTurn", null)
	var yaw_target: float = -clampf(head_turn, -1.1, 1.1) if head_turn != null else _look_target
	_head_yaw = _approach(_head_yaw, yaw_target, 5.0 if head_turn != null else 2.2, dt)
	var neck: Node3D = _nodes["neck"]
	neck.rotation.y = _head_yaw
	neck.rotation.z = -(_phone * 0.5 + T * 0.14 + _tired * 0.18) + _walk * 0.03 * sin(phi * 2.0) + _relax * 0.04
	neck.rotation.x = idle * sin(t * 0.5) * 0.04
	# 깜빡임
	_blink_timer -= dt
	if _blink_timer <= 0:
		_blink = 0.13
		_blink_timer = 2.0 + randf() * 4.0 - T * 1.2
	_blink -= dt
	for eye in _eyes:
		eye.visible = not p.get("faceless", false)
		eye.scale.y = 0.15 if _blink > 0 else 1.0
	if _hair_back:
		_hair_back.rotation.z = -_walk * 0.08 * sin(phi * 2.0) - _run * 0.2
	# 홍조: 얼굴이 붉어지고 볼의 분홍이 짙어진다
	var blush: float = p.get("blush", 0.0)
	_head_mat.albedo_color = _skin.lerp(BLUSH, minf(0.5, blush * 0.5))
	_cheek_mat.albedo_color.a = 0.28 + minf(0.6, blush * 0.6)
	(_nodes["aura"] as Node3D).visible = p.get("ally", false)
	# 걸음마다 통통
	var bob := _walk * (0.03 + _run * 0.035) * absf(s)
	position.y = -0.25 if seated else (0.12 if bike else bob)
	(_nodes["bike"] as Node3D).position.y = -0.12 if bike else 0.0


# ── 고양이: 꼬리가 느리게 살랑이고, 숨쉬고, 귀가 가끔 쫑긋

func build_cat(color: String) -> void:
	is_cat = true
	_seed = randf() * 100.0
	var m := mat(color, 0.95)
	var body := _mesh(capsule(0.12, 0.28), m, self, Vector3(0, 0.17, 0), true, "catBody")
	body.rotation.z = PI / 2.0
	var head := _group("catHead", self, Vector3(0.24, 0.28, 0))
	_mesh(sphere(0.11, 16), m, head)
	for side in [-1, 1]:
		var cone := CylinderMesh.new()
		cone.top_radius = 0.0
		cone.bottom_radius = 0.038
		cone.height = 0.08
		var ear := _mesh(cone, m, head, Vector3(0, 0.11, side * 0.055), false)
		_nodes["catEar%d" % side] = ear
	var tail := _group("catTail", self, Vector3(-0.2, 0.2, 0))
	_mesh(capsule(0.025, 0.3), m, tail, Vector3(0, 0.17, 0))
	tail.rotation.z = 0.8
	_add_blob(0.7)


func pose_cat(p: Dictionary, time: float) -> void:
	var t := time + _seed
	(_nodes["catTail"] as Node3D).rotation.x = sin(t * 1.6) * 0.45
	(_nodes["catBody"] as Node3D).scale.y = 1.0 + sin(t * 2.4) * 0.025
	var head: Node3D = _nodes["catHead"]
	head.rotation.y = sin(t * 0.4) * 0.35
	head.rotation.z = sin(float(p.get("walkPhase", 0.0)) * 2.0) * 0.05 if p.get("walking", false) else 0.0
	var twitch := 0.4 if sin(t * 0.9) > 0.97 else 0.0
	(_nodes["catEar-1"] as Node3D).rotation.x = -twitch
	(_nodes["catEar1"] as Node3D).rotation.x = twitch
	position.y = absf(sin(float(p.get("walkPhase", 0.0)))) * 0.02 if p.get("walking", false) else 0.0
