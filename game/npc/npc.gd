class_name Npc
extends RefCounted

## NPC 행동 상태 머신 (CLAUDE.md 5.9). 경량 행동 트리 대신 유형별 분기가 있는 상태 머신. 웹 판 src/npc/Npc.ts
##   Idle/Patrol → Notice → Approach → AttemptTalk → Dialogue / GiveUp
##   Hunter: 알아채면 직선 돌진 / Stalker: 같은 매장 안에서 3m 거리 유지, 3초 응시 시 순간 접근
##   Ally: 다가오지 않고 곁에 있으면 회복 / Pet: 집 안을 어슬렁거림
## 사람은 적이 아니다. 이 코드는 '말을 걸고 싶어 하는 평범한 사람'의 동선을 흉내 낼 뿐이다.
##
## 상태(state): "idle" | "patrol" | "notice" | "approach" | "attemptTalk" | "dialogue" | "giveUp" | "stalk" | "seated"
## NpcSpawn = { id, profileId, profile: Dictionary, pos: Vector2, path?: { points: Array[Vector2], loop: bool },
##              seated?: bool, areaId: String|null (이 NPC가 머무는 영역. Stalker는 이 영역 안에서만 따라온다) }
## NpcContext = { map: CityGrid, player: PlayerPercept(perception.gd), playerAreaId: String|null,
##                talkBlocked: bool (지금은 누구도 말을 걸 수 없는 상황: 대화 중, 미니게임 중 등), rng: Callable }
## 이벤트: { type: "talk", npc: Npc, fromBehind: bool } | { type: "noticed", npc: Npc }
##
## 이식 메모: 웹 판의 pos는 객체라 moveCircle이 직접 고쳤다. 여기서는 Vector2라 pos = map.move_circle(...)로 바꾼다.
## 웹 판은 플레이어 쪽으로 곧장 갈 때 경로에 플레이어 위치 '참조'를 넣어 두어, 다음 경로 계산 전까지도
## 움직이는 플레이어를 따라갔다. 같은 동작을 위해 그 칸은 _route_live로 표시하고 읽을 때 지금의 플레이어 위치를 쓴다.

var id: String
var profile_id: String
var profile: Dictionary
var pos: Vector2
var home: Vector2
var radius: float
## 머무는 영역 id (없으면 null)
var area_id: Variant = null
var facing := PI / 2.0
var state: String
var notice := 0.0
## 이번 스텝 지각 결과
var percept := {"dist": INF, "inView": false, "heard": false, "eyeContact": false}
## 플레이어를 바라보고 있는지 (시선 수 집계·홍조 연출)
var gazing := false
var speed := 0.0
## 몸짓 애니메이션용 (끄덕임, 손 내밀기): "none" | "reach" | "wave" | "laugh"
var gesture := "none"
var cooldown := 0.0
## 나에 대한 인상이 좋을수록 잘 알아보고 말을 건다 (알아챔 배율, Reputation.warmth)
var warmth := 1.0
## 플레이어가 이 NPC를 응시한 누적 시간 (Stalker)
var stared_at := 0.0

## { points: Array[Vector2], loop: bool } 또는 null
var _path: Variant = null
var _path_index := 0
var _path_dir := 1
var _wait := 0.0
var _state_time := 0.0
var _route: Array = []
## _route[0]이 '움직이는 플레이어 위치'인지 (웹 판의 참조 동작)
var _route_live := false
var _repath := 0.0
var _lost_sight := 0.0
var _stare := 0.0
var _events: Array = []


func _init(spawn: Dictionary) -> void:
	id = spawn["id"]
	profile_id = spawn["profileId"]
	profile = spawn["profile"]
	pos = spawn["pos"]
	home = spawn["pos"]
	_path = spawn.get("path")
	area_id = spawn.get("areaId")
	radius = float(profile.get("radius", 0.33))
	if spawn.get("seated", false):
		state = "seated"
	elif _path != null:
		state = "patrol"
	else:
		state = "idle"


## 프로필 유형 ("passerby", "acquaintance", "hunter", "stalker", "boss", "ally", "pet" …)
var npc_type: String:
	get:
		return profile["type"]


## 다가오는 중인지 (위협 태그 강조·발소리)
var pursuing: bool:
	get:
		return state == "approach" or state == "attemptTalk" or state == "notice"


func update(dt: float, ctx: Dictionary) -> void:
	_state_time += dt
	cooldown = maxf(0.0, cooldown - dt)
	gesture = "none"
	speed = 0.0
	var p := profile
	var player: Dictionary = ctx["player"]
	var ppos: Vector2 = player["pos"]

	percept = Perception.perceive(ctx["map"], pos, facing, p, player)
	var in_view: bool = percept["inView"]
	var heard: bool = percept["heard"]
	var eye_contact: bool = percept["eyeContact"]
	var reachable: bool = not player["unreachable"]

	# 알아챔 게이지
	if (in_view or heard) and reachable:
		# 가까울수록 빨리 알아챈다
		var near := 1.2 - minf(1.0, percept["dist"] / float(p["viewDistance"])) * 0.8
		var mul := (near if in_view else 0.5) * (float(p["eyeContactMultiplier"]) if eye_contact else 1.0) * (0.25 if player["hidden"] else 1.0)
		notice = minf(1.0, notice + float(p["noticeFillPerSec"]) * mul * warmth * dt)
	else:
		notice = maxf(0.0, notice - float(p["noticeDecayPerSec"]) * dt)
	gazing = in_view and reachable and notice >= 0.35 and state != "dialogue"
	if gazing and state != "approach":
		_turn_toward(Perception.angle_to(pos, ppos), dt, 3)

	# Stalker: 플레이어가 이쪽을 응시하는 시간 누적
	if npc_type == "stalker":
		var player_looks: bool = Perception.angle_diff(Perception.angle_to(ppos, pos), float(player["facing"])) < 0.35 and not player["phonePretend"] and percept["dist"] < 10
		stared_at = stared_at + dt if player_looks else maxf(0.0, stared_at - dt * 0.5)

	match state:
		"seated":
			if gazing:
				gesture = "none"
		"idle", "patrol":
			_wander(dt, ctx)
			_consider_approach(ctx)
		"stalk":
			_update_stalk(dt, ctx)
		"notice":
			# 잠깐 멈칫 → 다가옴 (Hunter는 바로 돌진)
			if _state_time >= (0.15 if npc_type == "hunter" else 0.6):
				_set_state("approach")
		"approach":
			_update_approach(dt, ctx)
		"attemptTalk":
			_update_attempt(dt, ctx)
		"dialogue":
			_turn_toward(Perception.angle_to(pos, ppos), dt, 6)
			if npc_type == "hunter":
				gesture = "reach"
		"giveUp":
			_walk_home(dt, ctx)


## 대화 시작 (세션이 호출)
func begin_dialogue() -> void:
	_set_state("dialogue")


## 대화 종료: 쿨다운 후 원래 자리로. grace_sec < 0이면 프로필의 cooldownSec
func end_dialogue(grace_sec: float = -1.0) -> void:
	notice = 0.0
	cooldown = grace_sec if grace_sec >= 0 else float(profile["cooldownSec"])
	stared_at = 0.0
	_set_state("giveUp")


## 플레이어를 놓침 (세이프 존 잠금 = 추적 초기화)
func lose_track() -> void:
	if state == "approach" or state == "attemptTalk" or state == "notice" or state == "stalk":
		notice = 0.0
		cooldown = maxf(cooldown, float(profile["cooldownSec"]) * 0.5)
		_set_state("giveUp")


func drain_events() -> Array:
	var out := _events
	_events = []
	return out


## 지금 따라가는 경로 (그리기·디버그용 복사본)
func route() -> Array:
	return _route.duplicate()


func _consider_approach(ctx: Dictionary) -> void:
	var p := profile
	var player: Dictionary = ctx["player"]
	if not p["approaches"] or cooldown > 0 or player["unreachable"] or ctx["talkBlocked"]:
		return
	if npc_type == "stalker":
		var pa: Variant = ctx.get("playerAreaId")
		if pa != null and pa != "" and _same(pa, area_id):
			_set_state("stalk")
		return
	if notice >= 1 and _within_leash(player["pos"]):
		_events.append({"type": "noticed", "npc": self})
		_set_state("notice")


func _update_stalk(dt: float, ctx: Dictionary) -> void:
	var p := profile
	var player: Dictionary = ctx["player"]
	var ppos: Vector2 = player["pos"]
	if not _same(ctx.get("playerAreaId"), area_id) or player["unreachable"]:
		_set_state("giveUp")
		return
	var d := CityGrid.dist(pos, ppos)
	var keep := float(p.get("stalkDistance", 3))
	_turn_toward(Perception.angle_to(pos, ppos), dt, 4)
	if d > keep + 0.6:
		_move_toward(ppos, float(p["walkSpeed"]) * 1.2, dt, ctx, true)
	# 3초 응시하면 순간 접근 / 오래 따라다니면 결국 말을 건다
	if not ctx["talkBlocked"] and cooldown <= 0 and (stared_at >= float(p.get("stareTriggerSec", 3)) or _state_time > 25):
		_events.append({"type": "noticed", "npc": self})
		_set_state("approach")


func _update_approach(dt: float, ctx: Dictionary) -> void:
	var p := profile
	var player: Dictionary = ctx["player"]
	var ppos: Vector2 = player["pos"]
	if player["unreachable"] or ctx["talkBlocked"]:
		lose_track()
		return
	var d := CityGrid.dist(pos, ppos)
	_lost_sight = 0.0 if (percept["inView"] or percept["heard"]) else _lost_sight + dt
	if _lost_sight >= float(p["giveUpSec"]) or not _within_leash(ppos):
		notice *= 0.3
		cooldown = float(p["cooldownSec"]) * 0.4
		_set_state("giveUp")
		return
	if d <= float(p["talkRange"]):
		_set_state("attemptTalk")
		return
	if npc_type == "hunter":
		gesture = "reach"
	_move_toward(ppos, float(p["approachSpeed"]), dt, ctx, true)


func _update_attempt(dt: float, ctx: Dictionary) -> void:
	var p := profile
	var player: Dictionary = ctx["player"]
	var ppos: Vector2 = player["pos"]
	var d := CityGrid.dist(pos, ppos)
	_turn_toward(Perception.angle_to(pos, ppos), dt, 8)
	gesture = "reach" if npc_type == "hunter" else "wave"
	if player["unreachable"] or ctx["talkBlocked"]:
		lose_track()
		return
	if d > float(p["talkRange"]) * 1.7:
		_stare = 0.0
		_set_state("approach")
		return
	# 1초 응시(또는 붙잡힘) → 대화. 뒤에서 다가온 경우 어깨 톡톡
	var player_faces_me := Perception.angle_diff(Perception.angle_to(ppos, pos), float(player["facing"])) < PI / 2.0
	_stare += dt
	if _stare >= float(p["stareSec"]) or d < 0.9:
		_stare = 0.0
		_events.append({"type": "talk", "npc": self, "fromBehind": not player_faces_me})
		_set_state("dialogue")


func _wander(dt: float, ctx: Dictionary) -> void:
	if npc_type == "pet":
		_pet_wander(dt, ctx)
		return
	if _path == null or _path["points"].size() < 2:
		if CityGrid.dist(pos, home) > 0.3:
			_move_toward(home, float(profile["walkSpeed"]), dt, ctx, false)
		return
	if _wait > 0:
		_wait -= dt
		return
	var points: Array = _path["points"]
	var target: Vector2 = points[_path_index]
	if CityGrid.dist(pos, target) < 0.3:
		_wait = float(profile["waypointWaitSec"]) * (0.6 + ctx["rng"].call() * 0.8)
		var n := points.size()
		if _path["loop"]:
			_path_index = (_path_index + 1) % n
		else:
			if _path_index + _path_dir >= n or _path_index + _path_dir < 0:
				_path_dir *= -1
			_path_index += _path_dir
		return
	_move_toward(target, float(profile["walkSpeed"]), dt, ctx, false)


func _pet_wander(dt: float, ctx: Dictionary) -> void:
	var ppos: Vector2 = ctx["player"]["pos"]
	var d := CityGrid.dist(pos, ppos)
	if d < 6 and d > 1.4 and _same(ctx.get("playerAreaId"), area_id):
		_move_toward(ppos, float(profile["walkSpeed"]), dt, ctx, true)
		return
	if _wait > 0:
		_wait -= dt
		return
	var rng: Callable = ctx["rng"]
	if _route.is_empty():
		_wait = 2 + rng.call() * 4
		var tx: float = float(home.x) + (rng.call() - 0.5) * 6
		var ty: float = float(home.y) + (rng.call() - 0.5) * 4
		if ctx["map"].walkable(floori(tx), floori(ty)):
			_set_route([Vector2(tx, ty)], false)
		return
	var t := _route_head(ctx)
	if CityGrid.dist(pos, t) < 0.3:
		_route_shift()
	else:
		_step(t, float(profile["walkSpeed"]), dt, ctx)


func _walk_home(dt: float, ctx: Dictionary) -> void:
	var goal: Vector2 = _path["points"][_path_index] if _path != null else home
	if CityGrid.dist(pos, goal) < 0.4 or _state_time > 30:
		_set_route([], false)
		_set_state("patrol" if _path != null else "idle")
		return
	_move_toward(goal, float(profile["walkSpeed"]), dt, ctx, false)


func _within_leash(target: Vector2) -> bool:
	if not profile.has("leash"):
		return true
	return CityGrid.dist(home, target) <= float(profile["leash"])


## A* 경로를 따라 이동 (0.5초마다 재계산). live: goal이 움직이는 플레이어 위치인지
func _move_toward(goal: Vector2, spd: float, dt: float, ctx: Dictionary, live: bool) -> void:
	var map: CityGrid = ctx["map"]
	_repath -= dt
	if _repath <= 0 or _route.is_empty():
		_repath = 0.5 + ctx["rng"].call() * 0.2
		if map.line_of_sight(pos, goal) and CityGrid.dist(pos, goal) < 4:
			_set_route([goal], live)
		else:
			var found: Variant = map.find_path(pos, goal, 6000)
			_set_route(found.slice(1) if found != null else [], false)
	if _route.is_empty():
		return
	var next := _route_head(ctx)
	while CityGrid.dist(pos, next) < 0.25 and _route.size() > 1:
		_route_shift()
		next = _route_head(ctx)
	_step(next, spd, dt, ctx)


func _step(target: Vector2, spd: float, dt: float, ctx: Dictionary) -> void:
	var dx := float(target.x) - float(pos.x)
	var dy := float(target.y) - float(pos.y)
	var d := sqrt(dx * dx + dy * dy)
	if d < 1e-3:
		return
	var s := minf(d, spd * dt)
	pos = ctx["map"].move_circle(pos, (dx / d) * s, (dy / d) * s, radius * 0.8)
	speed = spd
	_turn_toward(atan2(dy, dx), dt, 8)


func _turn_toward(target: float, dt: float, rate: float) -> void:
	var d := fmod(target - facing, PI * 2.0)
	if d > PI:
		d -= PI * 2.0
	if d < -PI:
		d += PI * 2.0
	facing += d * minf(1.0, rate * dt)


func _set_state(s: String) -> void:
	state = s
	_state_time = 0.0
	_stare = 0.0
	_lost_sight = 0.0
	_set_route([], false)


func _set_route(r: Array, live: bool) -> void:
	_route = r
	_route_live = live and r.size() > 0


## 경로의 첫 점 (움직이는 플레이어를 따라가는 칸이면 지금의 플레이어 위치)
func _route_head(ctx: Dictionary) -> Vector2:
	if _route_live:
		return ctx["player"]["pos"]
	return _route[0]


func _route_shift() -> void:
	_route.pop_front()
	_route_live = false


## null과 문자열을 섞어 비교 (TS ===)
static func _same(a: Variant, b: Variant) -> bool:
	if a == null or b == null:
		return a == null and b == null
	return a == b
