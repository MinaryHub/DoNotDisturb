class_name WorldMeshes
extends RefCounted

## 3D 시점에서 여러 번 나눠 쓰는 도형 (웹 판 three/Scene3D.ts의 공유 도형·shadeByHeight·makeBus·makeBeacon).
## 모두 한 번만 만들어 청크·인스턴스끼리 나눠 쓴다. 좌표: 월드 (x, y) → Godot (x, 0, y), 높이는 Godot y.

static var _cache := {}


## 아래로 갈수록 어두운 정점색: 바닥에 닿는 곳의 은은한 그늘 (윗면은 그대로 밝게)
static func _shade(y: float, up: float) -> Color:
	var k := 1.0 if up > 0.6 else 0.74 + 0.26 * pow(clampf(y, 0.0, 1.0), 0.6)
	return Color(k, k, k)


## 단위 상자: x·z는 -0.5~0.5, y는 0~1. 모서리는 반듯하게 (이어진 벽에 홈이 생기지 않게)
static func unit_box() -> ArrayMesh:
	if _cache.has("box"):
		return _cache["box"]
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var faces := [
		[Vector3(0, 1, 0), Vector3(1, 0, 0), Vector3(0, 0, 1)],
		[Vector3(0, -1, 0), Vector3(1, 0, 0), Vector3(0, 0, -1)],
		[Vector3(1, 0, 0), Vector3(0, 0, -1), Vector3(0, 1, 0)],
		[Vector3(-1, 0, 0), Vector3(0, 0, 1), Vector3(0, 1, 0)],
		[Vector3(0, 0, 1), Vector3(1, 0, 0), Vector3(0, 1, 0)],
		[Vector3(0, 0, -1), Vector3(-1, 0, 0), Vector3(0, 1, 0)],
	]
	for f in faces:
		var n: Vector3 = f[0]
		var u: Vector3 = f[1]
		var v: Vector3 = f[2]
		# 앞면은 시계 방향 (Godot): u × v가 바깥을 보게 맞춘다
		if u.cross(v).dot(n) < 0:
			var tmp := u
			u = v
			v = tmp
		var c := n * 0.5 + Vector3(0, 0.5, 0)
		var corners := [c - u * 0.5 - v * 0.5, c + u * 0.5 - v * 0.5, c + u * 0.5 + v * 0.5, c - u * 0.5 + v * 0.5]
		# 옆면은 위아래로 나눠 정점색 그늘이 부드럽게 (한 면을 4줄로)
		var rows := 1 if absf(n.y) > 0.5 else 4
		for r in rows:
			var a := float(r) / rows
			var b := float(r + 1) / rows
			var p0: Vector3 = corners[0].lerp(corners[3], a)
			var p1: Vector3 = corners[1].lerp(corners[2], a)
			var p2: Vector3 = corners[1].lerp(corners[2], b)
			var p3: Vector3 = corners[0].lerp(corners[3], b)
			for p in [p0, p2, p1, p0, p3, p2]:
				st.set_normal(n)
				st.set_color(_shade(p.y, n.y))
				st.add_vertex(p)
	var m := st.commit()
	_cache["box"] = m
	return m


## 둥근 단위 상자 (가구 한 덩어리). 붙은 칸을 묶은 직사각형만큼 늘려 쓴다 (모서리 반지름은 단위 기준)
static func rounded_box(r: float) -> ArrayMesh:
	var key := "rbox%.3f" % r
	if _cache.has(key):
		return _cache[key]
	r = clampf(r, 0.001, 0.49)
	var cs := [-0.5, -0.5 + r * 0.29, -0.5 + r, 0.5 - r, 0.5 - r * 0.29, 0.5]
	var lo := -0.5 + r
	var hi := 0.5 - r
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var faces := [
		[Vector3(0, 1, 0), Vector3(1, 0, 0), Vector3(0, 0, 1)],
		[Vector3(0, -1, 0), Vector3(1, 0, 0), Vector3(0, 0, -1)],
		[Vector3(1, 0, 0), Vector3(0, 0, -1), Vector3(0, 1, 0)],
		[Vector3(-1, 0, 0), Vector3(0, 0, 1), Vector3(0, 1, 0)],
		[Vector3(0, 0, 1), Vector3(1, 0, 0), Vector3(0, 1, 0)],
		[Vector3(0, 0, -1), Vector3(-1, 0, 0), Vector3(0, 1, 0)],
	]
	var vert := func(p: Vector3) -> Array:
		var inner := Vector3(clampf(p.x, lo, hi), clampf(p.y, lo, hi), clampf(p.z, lo, hi))
		var d := p - inner
		if d.length() < 0.00001:
			return [p, Vector3.ZERO]
		var nn := d.normalized()
		return [inner + nn * r, nn]
	for f in faces:
		var n: Vector3 = f[0]
		var u: Vector3 = f[1]
		var v: Vector3 = f[2]
		# 앞면은 시계 방향 (Godot): u × v가 바깥을 보게 맞춘다
		if u.cross(v).dot(n) < 0:
			var tmp := u
			u = v
			v = tmp
		for i in cs.size() - 1:
			for j in cs.size() - 1:
				var q := []
				for ij in [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]:
					var p: Vector3 = n * 0.5 + u * float(cs[ij[0]]) + v * float(cs[ij[1]])
					var e: Array = vert.call(p)
					q.append(e)
				for k in [0, 2, 1, 0, 3, 2]:
					var e: Array = q[k]
					var pos: Vector3 = e[0]
					var nrm: Vector3 = e[1] if e[1] != Vector3.ZERO else n
					st.set_normal(nrm)
					st.set_color(_shade(pos.y + 0.5, nrm.y))
					st.add_vertex(pos + Vector3(0, 0.5, 0))
	var m := st.commit()
	_cache[key] = m
	return m


## 여러 도형을 변환해 하나로 합친다
static func merged(parts: Array) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for p in parts:
		var mesh: Mesh = p[0]
		var xf: Transform3D = p[1]
		for s in mesh.get_surface_count():
			st.append_from(mesh, s, xf)
	return st.commit()


static func sphere(radius: float, segs: int = 14) -> SphereMesh:
	var s := SphereMesh.new()
	s.radius = radius
	s.height = radius * 2.0
	s.radial_segments = segs
	s.rings = segs / 2
	return s


static func cylinder(top: float, bottom: float, height: float, segs: int = 8) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = top
	c.bottom_radius = bottom
	c.height = height
	c.radial_segments = segs
	c.rings = 1
	return c


## 나무 줄기 (바닥에서 위로)
static func trunk(h: float) -> ArrayMesh:
	var key := "trunk%.2f" % h
	if not _cache.has(key):
		_cache[key] = merged([[cylinder(0.09, 0.14, h), Transform3D(Basis(), Vector3(0, h / 2.0, 0))]])
	return _cache[key]


## 수관: 둥근 덩어리 넷을 겹쳐 몽글몽글하게
static func canopy(c: float) -> ArrayMesh:
	var key := "canopy%.2f" % c
	if not _cache.has(key):
		_cache[key] = merged([
			[sphere(c * 0.8, 16), Transform3D()],
			[sphere(c * 0.62, 14), Transform3D(Basis(), Vector3(c * 0.5, -c * 0.15, c * 0.2))],
			[sphere(c * 0.58, 14), Transform3D(Basis(), Vector3(-c * 0.42, -c * 0.1, -c * 0.3))],
			[sphere(c * 0.5, 12), Transform3D(Basis(), Vector3(c * 0.05, c * 0.38, -c * 0.1))],
		])
	return _cache[key]


static func pot() -> ArrayMesh:
	if not _cache.has("pot"):
		_cache["pot"] = merged([[cylinder(0.22, 0.16, 0.38, 10), Transform3D(Basis(), Vector3(0, 0.19, 0))]])
	return _cache["pot"]


static func leaf() -> ArrayMesh:
	if not _cache.has("leaf"):
		_cache["leaf"] = merged([[sphere(0.42, 14), Transform3D()]])
	return _cache["leaf"]


static func lamp_post(h: float) -> ArrayMesh:
	return merged([[cylinder(0.05, 0.07, h, 6), Transform3D(Basis(), Vector3(0, h / 2.0, 0))]])


static func lamp_head(h: float) -> ArrayMesh:
	return merged([[sphere(0.18, 10), Transform3D(Basis(), Vector3(0, h + 0.05, 0))]])


static func std_mat(color: Variant, roughness: float = 0.92) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color if color is Color else Color(color)
	m.roughness = roughness
	m.diffuse_mode = BaseMaterial3D.DIFFUSE_BURLEY
	return m


static func box(size: Vector3) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = size
	return b


static func _part(parent: Node3D, mesh: Mesh, m: Material, pos: Vector3, node_name: String = "", shadow: bool = true) -> MeshInstance3D:
	var o := MeshInstance3D.new()
	o.mesh = mesh
	o.material_override = m
	o.position = pos
	o.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if node_name != "":
		o.name = node_name
	parent.add_child(o)
	return o


## 마을버스: 둥근 차체, 흰 띠, 창 띠, 바퀴. 앞이 +x (웹 판 makeBus)
## 이름 붙은 자식: chassis(흔들림), glass(밤에 불), brake(정차 브레이크등), wheel*(굴러감)
static func make_bus(body_color: Color, length: float, width: float) -> Node3D:
	var g := Node3D.new()
	var chassis := Node3D.new()
	chassis.name = "chassis"
	g.add_child(chassis)
	var body := _part(chassis, rounded_box(0.15), std_mat(body_color), Vector3(0, 0.35, 0))
	body.scale = Vector3(length, 2.3, width)
	_part(chassis, box(Vector3(length + 0.02, 0.18, width + 0.02)), std_mat("#fbf6ee"), Vector3(0, 1.05, 0))
	var glass_m := std_mat("#4a5a6c", 0.25)
	glass_m.emission_enabled = true
	glass_m.emission = Color("#ffe7a8")
	glass_m.emission_energy_multiplier = 0.0
	_part(chassis, box(Vector3(length - 0.7, 0.8, width + 0.03)), glass_m, Vector3(-0.1, 1.75, 0), "glass")
	_part(chassis, box(Vector3(0.06, 1.2, width - 0.3)), glass_m, Vector3(length / 2.0 + 0.01, 1.6, 0))
	_part(chassis, box(Vector3(2.2, 0.25, 1.4)), std_mat("#f0ece4"), Vector3(-1.5, 2.77, 0))
	var brake_m := std_mat("#f07a70")
	brake_m.emission_enabled = true
	brake_m.emission = Color("#f07a70")
	var brake := _part(chassis, box(Vector3(0.04, 0.25, width - 0.4)), brake_m, Vector3(-length / 2.0 - 0.02, 0.85, 0), "brake", false)
	brake.visible = false
	# 바퀴: 바퀴살 무늬가 있어야 굴러가는 게 보인다
	var wheel := cylinder(0.45, 0.45, 0.3, 16)
	var hub := box(Vector3(0.62, 0.1, 0.32))
	var tire_m := std_mat("#3a3c42")
	var hub_m := std_mat("#8a8c92")
	var i := 0
	for x in [-length / 2.0 + 1.8, length / 2.0 - 1.8]:
		for z in [-width / 2.0, width / 2.0]:
			var w := Node3D.new()
			w.name = "wheel%d" % i
			i += 1
			w.position = Vector3(x, 0.45, z)
			g.add_child(w)
			var t := _part(w, wheel, tire_m, Vector3.ZERO)
			t.rotation.x = PI / 2.0
			_part(w, hub, hub_m, Vector3.ZERO)
	return g


## 목표 표식: 아래를 가리키는 금빛 화살표 (어두운 테두리)
static func make_beacon() -> Node3D:
	var g := Node3D.new()
	var cone := cylinder(0.34, 0.0, 0.6, 4)
	var m := std_mat("#ffcf4a", 0.4)
	m.emission_enabled = true
	m.emission = Color("#ffb020")
	m.emission_energy_multiplier = 0.55
	_part(g, cone, m, Vector3.ZERO, "", false)
	var rim := cylinder(0.4, 0.0, 0.68, 4)
	var rm := StandardMaterial3D.new()
	rm.albedo_color = Color("#19161e")
	rm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	rm.cull_mode = BaseMaterial3D.CULL_FRONT
	_part(g, rim, rm, Vector3.ZERO, "", false)
	return g
