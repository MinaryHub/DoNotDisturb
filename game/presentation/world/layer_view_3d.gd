class_name LayerView3D
extends Node3D

## 한 층(지상·지하·아파트)의 3D 장면 (웹 판 three/Scene3D.ts의 바닥·청크·지붕·간판·가로등).
## 넓은 도시(1100×450칸)는 한 번에 만들 수 없어 카메라 둘레의 16×16 청크만 만들고, 멀어진 청크는 버린다.
## 바닥은 층 전체를 덮는 평면 하나 (타일 번호 텍스처 + 색표 셰이더), 벽·가구는 높이만큼 세운 상자(MultiMesh).
## 플레이어 앞(카메라 쪽)을 가리는 벽·가구·수관은 높이 그대로 반투명한 짝으로 옮겨 그린다.
## 좌표: 월드 (x, y) → Godot (x, 0, y). 높이는 Godot y.

const CHUNK := 16
## 층 높이 배율을 받는 구조물 (벽·창·닫힌 문). 가구는 그대로
const STRUCTURE := ["wall", "window", "doorClosed"]

var layer_id: String
var rect: Array
## 지상 건물 벽 높이 = 지붕 높이
var roof_height := 1.35

var _view  # WorldView3D (순환 참조를 피하려고 타입을 적지 않는다)
var _map: CityGrid
var _cfg3: Dictionary
var _heights: Dictionary
var _wall_scale := 1.0
## "cx,cy" → { cx, cy, node, groups: [{ solid, ghost, boxes, mat }], trees }
var _chunks := {}
var _roofs: Roofs = null
## 건물(Dictionary) 순번 → { node, mat, occl }
var _roof3d := {}
var _labels: Array = []
## 간판 순번 → Node3D
var _label3d := {}
var _lamp_heads: MultiMeshInstance3D = null
var _lamp_mat: StandardMaterial3D = null
var _floor: MeshInstance3D
## 마지막으로 반투명 처리한 기준 (플레이어 위치·높이 배율)
var _focus_key := ""
var _last_focus: Variant = null


func _init(view, map: CityGrid, layer: Dictionary, labels: Array, lamps: Array, roofs: Roofs) -> void:
	_view = view
	_map = map
	layer_id = layer["id"]
	rect = layer["rect"]
	name = "Layer_" + layer_id
	_cfg3 = view.cfg3
	_heights = view.heights
	_wall_scale = float(_cfg3["wallScale"].get(layer_id, 1.0))
	roof_height = float(_heights.get("wall", 1.35)) * _wall_scale
	_roofs = roofs
	_labels = labels
	_build_floor()
	_build_lamps(lamps)


# ───────────────────────── 바닥 ─────────────────────────

func _build_floor() -> void:
	var pm := PlaneMesh.new()
	pm.size = Vector2(float(rect[2]), float(rect[3]))
	_floor = MeshInstance3D.new()
	_floor.mesh = pm
	_floor.position = Vector3(float(rect[0]) + float(rect[2]) / 2.0, 0.0, float(rect[1]) + float(rect[3]) / 2.0)
	_floor.material_override = _view.floor_material
	_floor.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_floor)


# ───────────────────────── 가로등 ─────────────────────────

func _build_lamps(lamps: Array) -> void:
	if lamps.is_empty():
		return
	var H := 3.2
	var posts := MultiMesh.new()
	posts.transform_format = MultiMesh.TRANSFORM_3D
	posts.mesh = WorldMeshes.lamp_post(H)
	posts.instance_count = lamps.size()
	var heads := MultiMesh.new()
	heads.transform_format = MultiMesh.TRANSFORM_3D
	heads.mesh = WorldMeshes.lamp_head(H)
	heads.instance_count = lamps.size()
	for i in lamps.size():
		var p: Vector2 = lamps[i]
		var xf := Transform3D(Basis(), Vector3(p.x, 0, p.y - 0.6))
		posts.set_instance_transform(i, xf)
		heads.set_instance_transform(i, xf)
	var pi := MultiMeshInstance3D.new()
	pi.multimesh = posts
	pi.material_override = WorldMeshes.std_mat("#4a4f57", 0.6)
	add_child(pi)
	_lamp_heads = MultiMeshInstance3D.new()
	_lamp_heads.multimesh = heads
	_lamp_mat = WorldMeshes.std_mat("#fff4dc", 0.5)
	_lamp_mat.emission_enabled = true
	_lamp_mat.emission = Color("#ffcf8a")
	_lamp_mat.emission_energy_multiplier = 0.15
	_lamp_heads.material_override = _lamp_mat
	_lamp_heads.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_lamp_heads)


## 밤: 가로등 머리가 켜진다
func set_night(night: float) -> void:
	if _lamp_mat:
		_lamp_mat.emission_energy_multiplier = 0.15 + night * 2.2


# ───────────────────────── 청크 (가까운 곳만 만든다) ─────────────────────────

func chunk_count() -> int:
	return _chunks.size()


## 카메라 둘레 청크를 만들고 먼 청크를 버린다. 새로 만든 게 있으면 true
func stream(t: Vector2) -> bool:
	var S := CHUNK
	var R := float(_cfg3["streamRadius"])
	var lx := int(rect[0])
	var ly := int(rect[1])
	var lw := int(rect[2])
	var lh := int(rect[3])
	var cx0 := maxi(floori(lx / float(S)), floori((t.x - R) / S))
	var cx1 := mini(floori((lx + lw - 1) / float(S)), floori((t.x + R) / S))
	var cy0 := maxi(floori(ly / float(S)), floori((t.y - R) / S))
	var cy1 := mini(floori((ly + lh - 1) / float(S)), floori((t.y + R) / S))
	var missing: Array = []
	for cy in range(cy0, cy1 + 1):
		for cx in range(cx0, cx1 + 1):
			var d := _chunk_dist(cx, cy, t)
			if d <= R and not _chunks.has("%d,%d" % [cx, cy]):
				missing.append([d, cx, cy])
	# 처음에는 보이는 곳을 한꺼번에, 이후에는 프레임마다 조금씩 (가까운 것부터)
	missing.sort_custom(func(a, b): return a[0] < b[0])
	var first := _chunks.is_empty()
	var budget := int(_cfg3["buildPerFrame"])
	var built := false
	for m in missing:
		if not (first and m[0] < R * 0.6):
			if budget <= 0:
				break
			budget -= 1
		_load(m[1], m[2])
		built = true
	for k in _chunks.keys():
		var ch: Dictionary = _chunks[k]
		if _chunk_dist(ch["cx"], ch["cy"], t) > R + S:
			_unload(k)
	return built


func _chunk_dist(cx: int, cy: int, t: Vector2) -> float:
	var S := float(CHUNK)
	var dx := maxf(maxf(cx * S - t.x, 0.0), t.x - (cx + 1) * S)
	var dy := maxf(maxf(cy * S - t.y, 0.0), t.y - (cy + 1) * S)
	return sqrt(dx * dx + dy * dy)


func _load(cx: int, cy: int) -> void:
	var S := CHUNK
	var node := Node3D.new()
	node.name = "c%d_%d" % [cx, cy]
	add_child(node)
	var ch := {"cx": cx, "cy": cy, "node": node, "groups": [], "trees": null}
	var by_tile := {}
	var trees: Array = []
	for y in range(cy * S, (cy + 1) * S):
		for x in range(cx * S, (cx + 1) * S):
			if not CityGrid.in_rect(rect, x, y) or not _map.in_bounds(x, y):
				continue
			var d: Dictionary = _map.def(x, y)
			var id: String = d["id"]
			if id == "tree":
				trees.append(Vector2i(x, y))
				continue
			var h := float(_heights.get(id, 0.0))
			if h <= 0:
				continue
			if id in STRUCTURE:
				h *= _wall_scale
			if not by_tile.has(id):
				by_tile[id] = []
			by_tile[id].append({"x": x, "y": y, "h": h, "tall": d.get("tall", false)})
	var round_r := float(_cfg3.get("roundness", 0.0))
	for id in by_tile:
		var tiles: Array = by_tile[id]
		if id == "plant":
			_plants(node, tiles)
			continue
		var m: Dictionary = _view.mat_for(id)
		var boxes: Array
		var mesh: Mesh
		if not (id in STRUCTURE) and round_r > 0:
			# 가구: 붙어 있는 같은 칸을 직사각형으로 묶어 둥근 상자 하나로 (침대·책상이 칸마다 쪼개져 보이지 않게)
			boxes = _pieces(tiles)
			mesh = WorldMeshes.rounded_box(round_r)
		else:
			boxes = []
			for t in tiles:
				boxes.append({"x": float(t["x"]), "y": float(t["y"]), "w": 1.0, "d": 1.0, "h": t["h"], "tall": t["tall"], "gap": 0.0})
			mesh = WorldMeshes.unit_box()
		var solid := _multimesh(node, mesh, m["mat"], boxes.size(), not m["glass"])
		# 비쳐 보여도 그림자는 그대로 (빛이 갑자기 바뀌지 않게)
		var ghost := _multimesh(node, mesh, m["ghost"], boxes.size(), not m["glass"])
		ghost.multimesh.visible_instance_count = 0
		for i in boxes.size():
			solid.multimesh.set_instance_transform(i, _box_xf(boxes[i]))
		ch["groups"].append({"solid": solid, "ghost": ghost, "boxes": boxes})
	if not trees.is_empty():
		ch["trees"] = _trees_for(node, trees)
	_chunks["%d,%d" % [cx, cy]] = ch
	_apply_cutaway(ch, _last_focus, _view.grow_now)


func _multimesh(parent: Node3D, mesh: Mesh, mat: Material, count: int, shadow: bool, colors: bool = false) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = colors
	mm.mesh = mesh
	mm.instance_count = count
	var inst := MultiMeshInstance3D.new()
	inst.multimesh = mm
	inst.material_override = mat
	inst.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(inst)
	return inst


static func _box_xf(b: Dictionary) -> Transform3D:
	var gap: float = b["gap"]
	return Transform3D(Basis.from_scale(Vector3(b["w"] - gap, b["h"], b["d"] - gap)), Vector3(b["x"] + b["w"] / 2.0, 0, b["y"] + b["d"] / 2.0))


## 붙어 있는 같은 높이의 칸을 직사각형으로 묶는다 (가로로 늘린 뒤 아래로)
func _pieces(tiles: Array) -> Array:
	var at := {}
	for t in tiles:
		at[Vector2i(t["x"], t["y"])] = t
	var used := {}
	var out: Array = []
	var sorted := tiles.duplicate()
	sorted.sort_custom(func(a, b): return a["y"] < b["y"] or (a["y"] == b["y"] and a["x"] < b["x"]))
	var same := func(x: int, y: int, h: float) -> bool:
		var k := Vector2i(x, y)
		return at.has(k) and at[k]["h"] == h and not used.has(k)
	for t in sorted:
		var tx: int = t["x"]
		var ty: int = t["y"]
		if used.has(Vector2i(tx, ty)):
			continue
		var w := 1
		while same.call(tx + w, ty, t["h"]):
			w += 1
		var d := 1
		while true:
			var ok := true
			for i in w:
				if not same.call(tx + i, ty + d, t["h"]):
					ok = false
					break
			if not ok:
				break
			d += 1
		for j in d:
			for i in w:
				used[Vector2i(tx + i, ty + j)] = true
		out.append({"x": float(tx), "y": float(ty), "w": float(w), "d": float(d), "h": t["h"], "tall": t["tall"], "gap": 0.06})
	return out


func _plants(parent: Node3D, tiles: Array) -> void:
	var pot := _multimesh(parent, WorldMeshes.pot(), _view.pot_mat, tiles.size(), true)
	var leaf := _multimesh(parent, WorldMeshes.leaf(), _view.leaf_mat, tiles.size(), true)
	for i in tiles.size():
		var t: Dictionary = tiles[i]
		pot.multimesh.set_instance_transform(i, Transform3D(Basis(), Vector3(t["x"] + 0.5, 0, t["y"] + 0.5)))
		leaf.multimesh.set_instance_transform(i, Transform3D(Basis(), Vector3(t["x"] + 0.5, 0.38 + t["h"] * 0.45, t["y"] + 0.5)))


static func _tile_hash(x: int, y: int) -> int:
	return ((x * 73856093) & 0xFFFFFFFF) ^ ((y * 19349663) & 0xFFFFFFFF)


## 나무: 줄기 + 둥근 수관. 칸마다 조금씩 크기·색이 다르다
func _trees_for(parent: Node3D, tiles: Array) -> Dictionary:
	var tr: Dictionary = _cfg3["tree"]
	var trunk := _multimesh(parent, WorldMeshes.trunk(tr["trunk"]), _view.trunk_mat, tiles.size(), true)
	var canopy := _multimesh(parent, WorldMeshes.canopy(tr["canopy"]), _view.canopy_mat, tiles.size(), true, true)
	var ghost := _multimesh(parent, WorldMeshes.canopy(tr["canopy"]), _view.canopy_ghost, tiles.size(), true, true)
	ghost.multimesh.visible_instance_count = 0
	var xfs: Array = []
	for i in tiles.size():
		var t: Vector2i = tiles[i]
		var hsh := _tile_hash(t.x, t.y)
		var v := 0.8 + (hsh % 6) * 0.04
		canopy.multimesh.set_instance_color(i, Color(v, v, v))
		var s := 0.85 + (hsh % 5) * 0.08
		trunk.multimesh.set_instance_transform(i, Transform3D(Basis.from_scale(Vector3(1, s, 1)), Vector3(t.x + 0.5, 0, t.y + 0.5)))
		var cxf := Transform3D(Basis.from_scale(Vector3(s, s * 0.85, s)), Vector3(t.x + 0.5 + ((hsh >> 4) % 5) * 0.06 - 0.12, float(tr["trunk"]) * s + float(tr["canopy"]) * 0.55 * s, t.y + 0.5))
		xfs.append(cxf)
		canopy.multimesh.set_instance_transform(i, cxf)
	return {"canopy": canopy, "ghost": ghost, "tiles": tiles, "xfs": xfs}


func _unload(key: String) -> void:
	var ch: Dictionary = _chunks[key]
	(ch["node"] as Node3D).queue_free()
	_chunks.erase(key)


# ───────────────────────── 가리는 것 비치기 ─────────────────────────

## 플레이어 앞(카메라 쪽)을 가리는 벽·가구·수관은 높이 그대로 반투명하게.
## 플레이어 둘레 청크만 다시 계산한다 (예전 자리와 새 자리)
func update_cutaway(focus: Variant, grow: float) -> void:
	var key := "-" if focus == null else "%d,%d" % [roundi(focus.x * 4), roundi(focus.y * 4)]
	key += "|%.1f" % grow
	if key == _focus_key:
		return
	_focus_key = key
	var touched := {}
	for f in [_last_focus, focus]:
		if f == null:
			continue
		var p: Vector2 = f
		var cw := float(_cfg3["cutawayWidth"]) + 1.0
		var depth := float(_cfg3["cutawayDepth"]) + 8.0
		for cy in range(floori((p.y - 2) / CHUNK), floori((p.y + depth) / CHUNK) + 1):
			for cx in range(floori((p.x - cw) / CHUNK), floori((p.x + cw) / CHUNK) + 1):
				touched["%d,%d" % [cx, cy]] = true
	_last_focus = focus
	for k in touched:
		if _chunks.has(k):
			_apply_cutaway(_chunks[k], focus, grow)


func _apply_cutaway(ch: Dictionary, focus: Variant, grow: float) -> void:
	var c := _cfg3
	var cw := float(c["cutawayWidth"])
	var cd := float(c["cutawayDepth"])
	var has := focus != null
	var p: Vector2 = focus if has else Vector2.ZERO
	var hidden := Transform3D(Basis.from_scale(Vector3.ZERO), Vector3.ZERO)
	for g in ch["groups"]:
		var boxes: Array = g["boxes"]
		var solid: MultiMesh = g["solid"].multimesh
		var ghost: MultiMesh = g["ghost"].multimesh
		var n := 0
		for i in boxes.size():
			var b: Dictionary = boxes[i]
			var h: float = b["h"] * grow if b["tall"] else b["h"]
			var xf := _box_xf(b)
			# 사람 키를 넘는 것만 가린다고 본다 (낮은 책상·침대는 그대로)
			var hides_me: bool = has and h > 0.8 and b["y"] + b["d"] > p.y and b["y"] < p.y + cd + maxf(0.0, h - 1.35) * 0.7 \
				and b["x"] + b["w"] > p.x - cw + 0.5 and b["x"] < p.x + cw - 0.5
			if hides_me:
				ghost.set_instance_transform(n, xf)
				n += 1
				solid.set_instance_transform(i, hidden)
			else:
				solid.set_instance_transform(i, xf)
		ghost.visible_instance_count = n
	var tr: Variant = ch["trees"]
	if tr != null:
		var tc: Dictionary = c["tree"]
		var depth := (float(tc["trunk"]) + float(tc["canopy"]) * 2.0) * 0.75
		var canopy: MultiMesh = tr["canopy"].multimesh
		var ghost: MultiMesh = tr["ghost"].multimesh
		var n := 0
		var tiles: Array = tr["tiles"]
		for i in tiles.size():
			var t: Vector2i = tiles[i]
			var xf: Transform3D = tr["xfs"][i]
			# 플레이어를 가리는 수관은 비쳐 보이게 (밑을 지나도 내가 보인다)
			if has and t.y + 1 > p.y and t.y < p.y + depth and absf(t.x + 0.5 - p.x) < cw:
				ghost.set_instance_transform(n, xf)
				ghost.set_instance_color(n, canopy.get_instance_color(i))
				n += 1
				canopy.set_instance_transform(i, hidden)
			else:
				canopy.set_instance_transform(i, xf)
		ghost.visible_instance_count = n


# ───────────────────────── 지붕 ─────────────────────────

## 바깥에선 건물 안이 보이지 않게 지붕을 덮는다. 들어서면 걷히고, 플레이어를 가리면 비친다
func update_roofs(t: Vector2, focus: Variant, grow: float, dt: float) -> void:
	if _roofs == null:
		return
	var R := float(_cfg3["streamRadius"])
	var H := roof_height
	var reach := H * 0.8 + 1.5
	var k := minf(1.0, dt * 5.0)
	var occluded_alpha := float(_cfg3["roof"]["occludedAlpha"])
	var bs: Array = _roofs.buildings
	for i in bs.size():
		var b: Dictionary = bs[i]
		var near := false
		for r in b["outer"]:
			if r[0] - R < t.x and r[0] + r[2] + R > t.x and r[1] - R < t.y and r[1] + r[3] + R > t.y:
				near = true
				break
		if not near:
			if _roof3d.has(i):
				(_roof3d[i]["node"] as Node3D).queue_free()
				_roof3d.erase(i)
			continue
		if not _roof3d.has(i):
			_roof3d[i] = _make_roof(b)
		var roof: Dictionary = _roof3d[i]
		var occludes := false
		if focus != null:
			var p: Vector2 = focus
			for r in b["outer"]:
				if p.x > r[0] - 0.5 and p.x < r[0] + r[2] + 0.5 and r[1] > p.y - 1 and r[1] < p.y + reach:
					occludes = true
					break
		roof["occl"] += ((1.0 if occludes else 0.0) - roof["occl"]) * k
		var a: float = b["alpha"] * (1.0 - roof["occl"] * (1.0 - occluded_alpha))
		var node: Node3D = roof["node"]
		node.visible = a > 0.02
		var m: StandardMaterial3D = roof["mat"]
		var opaque := a >= 0.98
		m.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED if opaque else BaseMaterial3D.TRANSPARENCY_ALPHA
		m.albedo_color.a = a
		for c in node.get_children():
			(c as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if a > 0.9 else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		node.position.y = H * (grow - 1.0)


func _make_roof(b: Dictionary) -> Dictionary:
	var th := float(_cfg3["roof"]["thickness"])
	# 지붕: 2D 지붕 색을 조금 밝게 (파스텔)
	var col: Color = (b["color"] as Color).lerp(Color("#fff4ea"), 0.3)
	var m := WorldMeshes.std_mat(col, 0.95)
	var node := Node3D.new()
	add_child(node)
	for r in b["outer"]:
		var mi := MeshInstance3D.new()
		mi.mesh = WorldMeshes.box(Vector3(r[2] + 0.2, th, r[3] + 0.2))
		mi.material_override = m
		mi.position = Vector3(r[0] + r[2] / 2.0, roof_height + th / 2.0, r[1] + r[3] / 2.0)
		node.add_child(mi)
	return {"node": node, "mat": m, "occl": 0.0}


## 이 지점이 지금 지붕 아래인지 (목표 표식을 지붕 위로 올린다)
func roof_covers(p: Vector2) -> bool:
	return _roofs != null and _roofs.covers(p)


# ───────────────────────── 간판 ─────────────────────────

## 간판: 지붕 위(건물 안이면) 또는 눈높이에 세운 판. 늘 카메라를 본다
func update_labels(t: Vector2) -> void:
	var R := float(_cfg3["streamRadius"])
	for i in _labels.size():
		var l: Dictionary = _labels[i]
		var near := absf(l["x"] - t.x) < R and absf(l["y"] - t.y) < R
		if not near:
			if _label3d.has(i):
				(_label3d[i] as Node3D).queue_free()
				_label3d.erase(i)
			continue
		if _label3d.has(i):
			continue
		var on_roof := false
		if _roofs:
			for b in _roofs.buildings:
				for r in b["outer"]:
					if CityGrid.in_rect(r, l["x"], l["y"]):
						on_roof = true
		var s: Node3D = _view.make_label(l)
		s.position = Vector3(l["x"], roof_height + 0.7 if on_roof else 2.3, l["y"])
		add_child(s)
		_label3d[i] = s
