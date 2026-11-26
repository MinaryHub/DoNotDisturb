class_name Crowd
extends RefCounted

## 군중 (CLAUDE.md 5.3 지속형, 6-3 번화가·환승 통로). 웹 판 src/npc/Crowd.ts
## 이름 없는 행인들이 동선(lane)을 따라 흐른다. 개별 AI 대신 가벼운 입자처럼 움직이며
## 플레이어 주변 밀도가 '군중' 지속 자극의 강도가 된다.
## CrowdAgent = {
##   id: int, lane: String, zone: String, pos: Vector2, dir: Vector2, speed: float,
##   offset: float  동선 중심에서의 옆 오프셋
##   large: bool    덩치 큰 행인 (뒤에 붙으면 슬립스트림)
##   hue: int, phase: float,
##   active: bool   화면 표시 여부 (밀도 조절로 숨김)
## }
## lane(city.json crowdLanes 한 항목) = { id, zone, from: [x, y], to: [x, y], width, count, speed }

## 이만큼(맨해튼 거리, 칸)보다 먼 행인은 갱신하지 않는다
const FAR := 80.0

var agents: Array = []
var _lanes := {}
var _density := -1.0


func _init(lanes: Array, rng: Callable) -> void:
	var id := 0
	# 밀도 배율(러시아워)을 위해 최대 1.6배까지 만들어 두고 active로 조절한다
	for lane in lanes:
		_lanes[lane["id"]] = lane
		var fx := float(lane["from"][0])
		var fy := float(lane["from"][1])
		var lane_len := _lane_len(lane)
		var dx := (float(lane["to"][0]) - fx) / lane_len
		var dy := (float(lane["to"][1]) - fy) / lane_len
		var dir := Vector2(dx, dy)
		var count := float(lane["count"])
		var max_n := ceili(count * 1.6)
		for i in max_n:
			var t: float = rng.call()
			var offset: float = (rng.call() - 0.5) * float(lane["width"])
			var a := {
				"id": id,
				"lane": lane["id"],
				"zone": lane["zone"],
				"pos": Vector2(fx + dx * lane_len * t - dy * offset, fy + dy * lane_len * t + dx * offset),
				"dir": dir,
				"speed": float(lane["speed"]) * (0.8 + rng.call() * 0.4),
				"offset": offset,
				"large": rng.call() < 0.15,
				"hue": int(floor(rng.call() * 360)),
				"phase": rng.call() * PI * 2.0,
				"active": i < count,
			}
			id += 1
			agents.append(a)


static func _lane_len(lane: Dictionary) -> float:
	var ddx := float(lane["to"][0]) - float(lane["from"][0])
	var ddy := float(lane["to"][1]) - float(lane["from"][1])
	return sqrt(ddx * ddx + ddy * ddy)


## 러시아워 등 밀도 배율 적용 (바뀔 때만)
func set_density(multiplier: float) -> void:
	if multiplier == _density:
		return
	_density = multiplier
	var per_lane := {}
	for a in agents:
		var n: int = per_lane.get(a["lane"], 0)
		per_lane[a["lane"]] = n + 1
		a["active"] = n < floor(float(_lanes[a["lane"]]["count"]) * multiplier + 0.5)


func update(dt: float, player: Vector2, player_radius: float) -> void:
	var px := float(player.x)
	var py := float(player.y)
	for a in agents:
		if not a["active"]:
			continue
		var pos: Vector2 = a["pos"]
		# 멀리(화면 밖) 있는 행인은 멈춰 둔다 (넓은 도시 성능). 다가가면 다시 걷는다
		if absf(pos.x - px) + absf(pos.y - py) > FAR:
			continue
		var spd: float = a["speed"]
		a["phase"] += dt * spd * 5
		var lane: Dictionary = _lanes[a["lane"]]
		var dir: Vector2 = a["dir"]
		var dx := float(dir.x)
		var dy := float(dir.y)
		var ax := float(pos.x)
		var ay := float(pos.y)
		# 플레이어를 비켜 간다 (멀리서부터 옆으로 한 걸음)
		var rx := px - ax
		var ry := py - ay
		var along := rx * dx + ry * dy
		var side := -rx * dy + ry * dx
		var offset: float = a["offset"]
		var target := offset
		if along > -0.5 and along < 3.5 and absf(side) < player_radius + 0.9:
			target = offset + (-1.0 if side > 0 else 1.0)
		var fx0 := float(lane["from"][0])
		var fy0 := float(lane["from"][1])
		var cur_side := -(ax - fx0) * dy + (ay - fy0) * dx
		var lateral := (target - cur_side) * minf(1.0, dt * 3)
		ax += dx * spd * dt - dy * lateral
		ay += dy * spd * dt + dx * lateral
		# 동선 끝에 닿으면 처음으로
		var fx := ax - fx0
		var fy := ay - fy0
		var lane_len := _lane_len(lane)
		if fx * dx + fy * dy > lane_len:
			ax -= dx * lane_len
			ay -= dy * lane_len
		a["pos"] = Vector2(ax, ay)


## 플레이어 주변 반경 안 행인 수
func count_near(p: Vector2, radius: float) -> int:
	var n := 0
	var r2 := radius * radius
	for a in agents:
		if a["active"] and (a["pos"] as Vector2).distance_squared_to(p) < r2:
			n += 1
	return n


## 개인 공간(반경) 안으로 들어온 행인 (없으면 null)
func touching(p: Vector2, radius: float) -> Variant:
	var r2 := radius * radius
	for a in agents:
		if a["active"] and (a["pos"] as Vector2).distance_squared_to(p) < r2:
			return a
	return null


## 같은 방향으로 걷는 덩치 큰 행인 바로 뒤인지 (슬립스트림). move_dir: Vector2 또는 null
func slipstream(p: Vector2, move_dir: Variant, behind_dist: float, lateral: float) -> bool:
	if move_dir == null:
		return false
	var md: Vector2 = move_dir
	for a in agents:
		if not a["active"] or not a["large"]:
			continue
		var dir: Vector2 = a["dir"]
		if dir.x * md.x + dir.y * md.y < 0.7:
			continue
		var pos: Vector2 = a["pos"]
		var rx := pos.x - p.x
		var ry := pos.y - p.y
		var along := rx * dir.x + ry * dir.y
		var side := absf(-rx * dir.y + ry * dir.x)
		if along > 0.3 and along < behind_dist and side < lateral:
			return true
	return false
