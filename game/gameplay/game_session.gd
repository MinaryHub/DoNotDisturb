class_name GameSession
extends RefCounted

## 하루 단위 게임 진행 (노드·렌더링 없음). 입력(Controls)을 받아 시뮬레이션과 월드를 진행하고,
## 연출 계층은 이 객체의 상태를 읽기만 한다 (CLAUDE.md 8: 연출은 sim을 수정하지 않는다).
## 웹 판 src/gameplay/GameSession.ts. API 약속은 game/PORTING.md 'GameSession API 약속'.
##
## 표현 (이식 메모)
## - Controls: TS와 같은 camelCase 키의 Dictionary (NO_CONTROLS, controls(over))
## - mode: { "kind": ..., TS 판 Mode의 필드 } Dictionary. qte: { kind, timer, window } 또는 null
## - 집합(Set)은 Dictionary(키 → true), Map은 Dictionary. 이야기 표지는 { 이름: 수(float) }
## - fx: { "type": "toast", "key", "vars" } · { "type": "sound", "id", "note"? } · { "type": "ambush", "stimulusId" } · { "type": "rumble" } · { "type": "warp" }
## - 저장(SaveState)은 TS와 같은 camelCase 키의 Dictionary. 빈 Dictionary = 새 게임

# 컨트롤 (Controls). move: Vector2, aim: float 또는 null, useItem·note·slot: 없으면 -1, reply: 없으면 "", menuNav: -1·0·1
const NO_CONTROLS := {
	"move": Vector2.ZERO,
	"sprint": false,
	# 마우스 방향 (라디안). null이면 이동 방향을 본다
	"aim": null,
	"interactPressed": false,
	"interactHeld": false,
	"earphonesPressed": false,
	"phonePretend": false,
	"cover": false,
	"eyesClosed": false,
	"maskPressed": false,
	# 소모품 단축키 (0부터, 가방 칸 순서)
	"useItem": -1,
	"reply": "",
	"smile": false,
	"spacePressed": false,
	"sos": false,
	"confirm": false,
	"accept": false,
	"decline": false,
	"textInstead": false,
	"phoneToggle": false,
	# 폰·상점 목록 위아래
	"menuNav": 0,
	"phoneReply": false,
	"phoneIgnore": false,
	"note": -1,
	"slot": -1,
	"retry": false,
	# 하루 시작 화면에서 연차 쓰기
	"leave": false,
	# 미니게임·휴식 그만두기 (Esc)
	"cancel": false,
}

## 대화 중 선택지 (UI가 표시)
const REPLIES := DialogueBattle.REPLIES

const INTERACT_RANGE_EXTRA := 0.2
const MASK32 := 0xFFFFFFFF


## NO_CONTROLS에 덮은 컨트롤
static func controls(over: Dictionary = {}) -> Dictionary:
	var c: Dictionary = NO_CONTROLS.duplicate()
	c.merge(over, true)
	return c


var cfg: Dictionary
var world: World
var sim: Simulation
var phone: Phone
var monologue: MonologueDirector
## 사람들이 나를 보는 인상과 사회적 평판
var reputation: Reputation
## 마을버스 시간표 (city.json에 노선이 없으면 null)
var bus_route: BusRoute = null
var crowd: Crowd
var clock: GameClock
## 오늘의 하루 (기본 하루 + 작은 사건, DayComposer)
var day: Dictionary = {}
## 오늘 일어나는 작은 사건
var happenings: Array = []
## 조급함 0~1: 달리면 차오르고 걸으면 가라앉는다
var hurry := 0.0
## 지금 주변 군중 밀도 (0~crowdDensity.max)
var crowd_level := 0.0
var day_index := 0
var objectives: Objectives
var npcs: Array = []
## NPC 활동 시간 (분): id → [from, to]
var _npc_hours := {}
var mode: Dictionary = {"kind": "dayIntro"}
var qte: Variant = null
var player: PlayerState
var home_locked := false
## 외시경으로 보는 지점 (연출 카메라)
var view_target: Variant = null
var area: Variant = null
var phone_open := false
var phone_cursor := 0
var _soaked_today := false
## 오늘 이미 한 생활 행동
var _chores_done := {}
## 이번 프레임 상호작용 안내 { labelKey, at: Vector2 } 또는 null
var prompt: Variant = null
var rehearsed := false
var hobby_done := false
var calm_buff := false
var sos_used := false
var sanctuary_broken := 0.0
var reports: Array = []
var fx: Array = []
## 이야기 표지·셈: 지난 날들의 선택이 남긴 것 (data/story.json)
var story := {}
## 이번 주에 쓴 연차
var leave_used := 0
## 오늘 연차를 냈는지
var on_leave := false
## 생활 지표 변화 중 이미 알린 것 (알림 토스트)
var _ledger_seen := 0
var _last_why_toast := {}
## 오늘 이미 적용한 하루 한 번 규칙 (story.json marks의 순번)
var _marks_today := {}
## 오늘 눈인사를 나눈 사람
var _nodded := {}
## 오늘 "늘 드시던 걸로요?"를 들은 가게
var _regular_greeted := {}

var _next_max: float
var _day_start: Dictionary = {}
var _rng_state := 12345
var _hurry_noted := false
## 가진 장비: 하루가 바뀌어도, 다시 해도 남는다
var _owned_gear := {}
## 오늘 상점별로 챙긴 개수 (탕비실 perDay)
var _shop_taken := {}
## 위안 물건을 오늘 쓴 횟수
var _item_uses := {}
## 아이템 효과 지속: 차분함(마음이 더 가라앉음), 스트레스 내성(자극 × scale). 남은 초
var buffs := _no_buffs()
## 혼자만의 틈: 멈춰 서서 천천히 먹거나 쓰는 중 { id, time, dur, paused }. paused면 누가 보고 있어 손이 멈췄다
var item_break: Variant = null
## 첫 대화는 연습 (규칙을 하나씩 알려 준다)
var _practiced := false
## 휴가 모드: 해야 할 일 없이 날마다 같은 휴가 하루를 되풀이한다 (정산·저장 없음)
var vacation := false
## 휴가 며칠째
var vacation_day_count := 1
## 익힌 내향인의 기술 (data/perks.json): id → true
var perks := {}
## 난이도 '나는 이만큼 지친다' (balance.difficulty 항목)
var difficulty: Dictionary
## 이번 주의 조건 (새 캠페인마다). 없으면 null
var week_condition: Variant = null
## 얻은 작은 승리: id → true
var achieved := {}
## 한 주 동안 센 이벤트 (작은 승리 판정)
var _week_events := {}
## 오늘 새로 찾은 조용한 곳 수 (기술 고르기)
var _quiet_today := 0
## 조용한 곳 도감: 찾은 곳 (날이 바뀌어도, 다시 해도 남는다)
var quiet_found := {}
## 지금 머무는 (찾은) 조용한 곳 { id, nameKey }: 아무도 보지 않으면 회복 중
var quiet_here: Variant = null
var _quiet_timer := 0.0
var _quiet_spot_id: Variant = null
## 오늘 온 부탁과 받아들인 부탁
var _favors_offered: Array = []
var _favors_accepted := {}
## 변화 씨앗. 없으면(테스트) 매번 같은 기본 하루
var _seed := 0
var _has_seed := false
## 같은 날을 다시 할 때마다 다른 하루가 되도록
var _attempt := 0
var _fired_phone := {}
var _pending_escalations: Array = []
var _personal_space_cd := 0.0
## 화장실 칸·피팅룸: 칸마다 마지막으로 쉬기 시작한 시각 (게임 분). 같은 칸은 balance.safe.reuseMin이 지나야 다시 쉬어진다
var _safe_used_at := {}
## 지금 잠근 칸에서 쉬어지는지 (방금 쉰 칸이면 숨기만 한다)
var _safe_rests := false
## 근무 시간에 자리를 비운 시간 (게임 분)
var _desk_away_min := 0.0
var _ignored_boss_messages := 0
var _mandatory_retry: Variant = null
var _dinner_seat_timer := -1.0
var _last_tier := ""
var _tracked_cache: Variant = null
## 독백 조건 중 '보이는' 사람을 보는 것의 가장 먼 거리 (그보다 먼 사람은 시선 검사를 하지 않는다. 결과는 같다)
var _mono_los_range := -1.0


## options: seed(int, 없으면 -1)·practiced·vacation·difficulty. save: save_state()의 Dictionary (빈 값 = 새 게임)
func _init(config: Dictionary, save: Dictionary = {}, options: Dictionary = {}) -> void:
	cfg = config
	var sv: Variant = options.get("seed")
	_has_seed = sv != null and int(sv) >= 0
	_seed = int(sv) if _has_seed else 0
	vacation = bool(options.get("vacation", false)) and cfg.get("vacationDay") != null
	var want: Variant = save.get("difficulty")
	if want == null:
		want = options.get("difficulty")
	var diffs: Array = cfg["balance"]["difficulty"]
	difficulty = _find_by_id(diffs, want if want != null else "")
	if difficulty.is_empty():
		difficulty = _find_by_id(diffs, "normal")
	if difficulty.is_empty():
		difficulty = diffs[0]
	if options.get("practiced", false):
		_practiced = true
	world = World.build_world(cfg["world"], cfg["tiles"])
	sim = Simulation.new(DataLoader.sim_config_of(cfg), cfg["stimuli"])
	phone = Phone.new({"ringSec": 12.0, "replyWaitSec": 25.0, "maxVisible": 4})
	monologue = MonologueDirector.new(cfg["monologueTriggers"], cfg["monologue"], rng)
	for tr in cfg["monologueTriggers"]:
		var w: Dictionary = tr["when"]
		if w.get("visible", false) and not w.has("event") and not w.has("area") and (w.has("npcProfile") or w.has("npcType")):
			_mono_los_range = maxf(_mono_los_range, float(w.get("distMax", INF)))
	crowd = Crowd.new(cfg["world"]["crowdLanes"], rng)
	if cfg["world"].get("bus") != null:
		bus_route = BusRoute.new(cfg["world"]["bus"], cfg["balance"]["bus"])
	reputation = Reputation.new(cfg["reputation"])
	clock = GameClock.new(0.0)
	_next_max = float(difficulty["batteryStart"])
	if not save.is_empty():
		day_index = mini(int(save["dayIndex"]), cfg["days"].size() - 1)
		sim.life.restore(save["life"])
		_next_max = float(save["nextMax"])
		reports = save.get("reports", []).duplicate()
		for g in save.get("gear", []):
			_owned_gear[g] = true
		var pr: Variant = save.get("practiced")
		_practiced = bool(pr) if pr != null else int(save["dayIndex"]) > 0
		story = Story.from_save(save.get("story"))
		leave_used = int(save.get("leaveUsed", 0))
		reputation.restore(save.get("reputation"))
		for q in save.get("quiet", []):
			quiet_found[q] = true
		for k in save.get("perks", []):
			perks[k] = true
		for a in save.get("achievements", []):
			achieved[a] = true
		_week_events = (save.get("weekEvents", {}) as Dictionary).duplicate()
		var wc: Dictionary = _find_by_id(cfg["weekConditions"]["list"], save.get("weekCondition", ""))
		week_condition = null if wc.is_empty() else wc
	# 새 캠페인: 이번 주의 조건을 뽑는다 (씨앗이 있을 때만, 휴가 모드는 없음)
	if save.is_empty() and _has_seed and not vacation:
		week_condition = _roll_week_condition()
	start_day(day_index)


static func _find_by_id(list: Array, id: Variant) -> Dictionary:
	if id == null:
		return {}
	for x in list:
		if x["id"] == id:
			return x
	return {}


static func _no_buffs() -> Dictionary:
	return {"soothe": {"perSec": 0.0, "left": 0.0}, "resist": {"scale": 1.0, "left": 0.0}}


## 이번 주의 조건을 오늘에 얹는다: 비 오는 날, 막힌 시설, 추가 연락, 시작 화면 한 줄
func _apply_week_condition() -> void:
	var w: Variant = week_condition
	if w == null or vacation:
		return
	var d: Dictionary = day.duplicate()
	if (w.get("rainDays", []) as Array).has(day["id"]):
		d["weather"] = "rain"
	var blocked: Array = _arr(day, "blocked").duplicate()
	blocked.append_array(w.get("blocked", []))
	d["blocked"] = blocked
	var ph: Array = (day["phone"] as Array).duplicate()
	ph.append_array(w.get("phone", []))
	d["phone"] = ph
	var notes: Array = [{"textKey": w["noteKey"]}]
	notes.append_array(_arr(day, "notes"))
	d["notes"] = notes
	day = d


## 이번 주의 조건: 가중치로 하나
func _roll_week_condition() -> Variant:
	var list: Array = cfg["weekConditions"]["list"]
	var total := 0.0
	for w in list:
		total += float(w["weight"])
	var x := _mix_random(_seed) * total
	for w in list:
		x -= float(w["weight"])
		if x <= 0:
			return w
	return null


## 결정적 난수 (테스트 재현성)
func rng() -> float:
	_rng_state = (_rng_state * 1664525 + 1013904223) & MASK32
	return float(_rng_state) / 4294967296.0


## 지금 시뮬레이션 상태 (SimSnapshot)
func snapshot() -> Dictionary:
	return sim.snapshot()


func sanctuary() -> bool:
	return home_locked and area != null and area["kind"] == "home" and sanctuary_broken <= 0


func at_home() -> bool:
	return area != null and area["kind"] == "home"


func returning() -> bool:
	return objectives.can_end_day


func raining() -> bool:
	return day.get("weather") == "rain"


func save_state() -> Dictionary:
	return {
		"dayIndex": day_index,
		"life": _day_start["life"],
		"nextMax": _day_start["max"],
		"reports": reports,
		"gear": _owned_gear.keys(),
		"practiced": _practiced,
		"story": _day_start["story"],
		"leaveUsed": _day_start["leaveUsed"],
		"reputation": _day_start["reputation"],
		"quiet": quiet_found.keys(),
		"perks": perks.keys(),
		"difficulty": difficulty["id"],
		"weekCondition": week_condition["id"] if week_condition != null else null,
		"achievements": (_day_start["achieved"] as Array).duplicate(),
		"weekEvents": (_day_start["weekEvents"] as Dictionary).duplicate(),
	}


# ───────────────────────── 하루 시작·재시작 ─────────────────────────

func start_day(index: int) -> void:
	day_index = index
	if _has_seed:
		_rng_state = _mix(_seed, index, _attempt)
		_attempt += 1
	var def: Dictionary = cfg["vacationDay"] if vacation else cfg["days"][index]
	var composed := DayComposer.compose_day(def, cfg["happenings"], rng if _has_seed else null, story)
	# 넓은 도시의 동네 사람들: 날마다 길을 오간다 (확률이 있으면 씨앗으로, 테스트는 확률 없는 사람만)
	var ambient: Array = []
	for a in cfg["world"].get("ambient", []):
		var keep := true
		if a.has("chance"):
			keep = rng() < float(a["chance"]) if _has_seed else float(a["chance"]) >= 1
		if keep:
			var b: Dictionary = a.duplicate()
			b.erase("chance")
			ambient.append(b)
	var cd: Dictionary = composed["day"]
	day = cd.duplicate()
	var all_npcs: Array = (cd["npcs"] as Array).duplicate()
	all_npcs.append_array(ambient)
	day["npcs"] = all_npcs
	happenings = composed["happenings"]
	_apply_week_condition()
	_quiet_today = 0
	_offer_favors()
	sim.life.clear_ledger()
	_ledger_seen = 0
	_last_why_toast.clear()
	_day_start = {
		"life": sim.life.snapshot(),
		"max": _next_max,
		"story": story.duplicate(),
		"leaveUsed": leave_used,
		"reputation": reputation.snapshot(),
		"achieved": achieved.keys(),
		"weekEvents": _week_events.duplicate(),
	}
	reputation.new_day()
	on_leave = false
	sim.start_day(_next_max)
	clock = GameClock.new(DayCycle.parse_time(day["start"]))
	objectives = Objectives.new(day)
	phone.end_day()
	phone.drain_events()
	# 그날만 생기는 군중 동선까지 포함해 다시 만든다
	var lanes: Array = (cfg["world"]["crowdLanes"] as Array).duplicate()
	lanes.append_array(_arr(day, "crowdLanes"))
	crowd = Crowd.new(lanes, rng)
	monologue.reset(day["id"], story.duplicate())
	_marks_today.clear()
	_nodded.clear()
	_safe_used_at.clear()
	_desk_away_min = 0.0
	_regular_greeted.clear()
	_fired_phone = {}
	_pending_escalations = []
	home_locked = true
	rehearsed = false
	_chores_done.clear()
	_shop_taken.clear()
	_item_uses.clear()
	item_break = null
	buffs = _no_buffs()
	_soaked_today = false
	hurry = 0.0
	_hurry_noted = false
	hobby_done = false
	calm_buff = false
	sos_used = false
	sanctuary_broken = 0.0
	phone_open = false
	qte = null
	view_target = null
	_ignored_boss_messages = 0
	_mandatory_retry = null
	_dinner_seat_timer = -1.0
	var spawn: Vector2 = world.spawns[day["spawn"]]
	player = PlayerState.new()
	player.pos = spawn
	player.inventory = {"consumables": {}, "gear": _owned_gear.keys(), "clothes": false, "items": []}
	_spawn_npcs()
	# 지난 날의 일이 오늘 아침 가방에 남긴 것 (옆집 반찬 등)
	for n in _arr(day, "notes"):
		if n.get("give", "") != "":
			_add_item(n["give"])
	area = world.map.area_at(spawn.x, spawn.y)
	mode = {"kind": "dayIntro"}
	_last_tier = "stable"


## 작은 승리에 쓰이는 이벤트 이름 (그것만 센다)
func _tracked_events() -> Dictionary:
	if _tracked_cache == null:
		var d := {}
		for a in cfg["achievements"]["list"]:
			var m: String = a["metric"]
			if m.begins_with("event."):
				d[m.substr(6)] = true
		_tracked_cache = d
	return _tracked_cache


## 작은 승리의 값: 한 주 기록·이벤트·이야기 셈·도감·연차·평판
func achievement_value(metric: String) -> float:
	if metric.begins_with("report."):
		var key := metric.substr(7)
		var sum := 0.0
		for r in reports:
			var v: Variant = r.get(key)
			if v is float or v is int:
				sum += float(v)
			elif v is Array:
				sum += (v as Array).size()
		return sum
	if metric.begins_with("event."):
		return float(_week_events.get(metric.substr(6), 0))
	if metric.begins_with("story."):
		return float(story.get(metric.substr(6), 0))
	if metric == "quiet":
		return float(quiet_found.size())
	if metric == "leave":
		return float(leave_used)
	if metric == "rep.overall":
		return reputation.overall()
	return 0.0


## 밤마다 조건을 채운 작은 승리를 얻는다. weekEnd·max 조건은 주간 리포트에서만
func _check_achievements(week_end: bool) -> void:
	for a in cfg["achievements"]["list"]:
		if achieved.has(a["id"]):
			continue
		if (a.get("weekEnd", false) or a.has("max")) and not week_end:
			continue
		var v := achievement_value(a["metric"])
		if a.has("min") and v < float(a["min"]):
			continue
		if a.has("max") and v > float(a["max"]):
			continue
		achieved[a["id"]] = true
		toast("ach.toast", {"name": _text(a["nameKey"], a["id"])})


## 익힌 기술과 가진 물건(items.gear)의 효과 목록
func _effect_sources() -> Array:
	var out := []
	for k in cfg["perks"]["list"]:
		if perks.has(k["id"]):
			out.append(k["effects"])
	for g in cfg["items"]["gear"]:
		if g.get("effects") != null and _owned_gear.has(g["id"]):
			out.append(g["effects"])
	return out


## 익힌 기술·가진 물건의 효과: 배율은 곱하고
func perk_mul(key: String) -> float:
	var v := 1.0
	for e in _effect_sources():
		v *= float(e.get(key, 1.0))
	return v


## 익힌 기술·가진 물건의 효과: 더하기
func perk_add(key: String) -> float:
	var v := 0.0
	for e in _effect_sources():
		v += float(e.get(key, 0.0))
	return v


## 오늘 밤 고를 기술: 오늘 한 일(피함·견딤·쉼·돌아다님·부탁)에 맞춰 가중치를 두고, 아직 없는 것 중에서
func _perk_choices() -> Array:
	var r: Dictionary = sim.report
	var score := {
		"avoid": 1.0 + float(r["smalltalkAvoided"]) + float(r["parried"]) + float(r["callsAvoided"]) * 0.5,
		"endure": 1.0 + float(r["smalltalkEndured"]) + float(r["silenceSec"]) / 15.0 + (r["mandatoryDone"] as Array).size(),
		"rest": 1.0 + float(r["recoveredBattery"]) / 15.0 + (r["hobbies"] as Array).size(),
		"explore": 1.0 + _quiet_today * 2.0,
		"favor": 1.0 + float(r.get("favorsDone", 0)) * 3.0,
	}
	var pool: Array = cfg["perks"]["list"].filter(func(k): return not perks.has(k["id"]))
	var out: Array = []
	while out.size() < int(cfg["perks"]["offer"]) and pool.size() > 0:
		var total := 0.0
		for k in pool:
			total += float(score[k["tag"]])
		var x := rng() * total
		var i := -1
		for j in pool.size():
			x -= float(score[pool[j]["tag"]])
			if x <= 0:
				i = j
				break
		i = maxi(0, i)
		out.append(pool[i]["id"])
		pool.remove_at(i)
	return out


## 오늘의 부탁: 씨앗이 있을 때만 (테스트는 기본 하루). 문자로 오고, 답장하면 목표가 생긴다
func _offer_favors() -> void:
	_favors_offered = []
	_favors_accepted.clear()
	if not _has_seed:
		return
	var fc: Dictionary = cfg["favors"]
	var pool: Array = fc["list"].filter(func(f): return (not vacation and (f["days"] as Array).has(day["id"])) if f.get("days") != null else true)
	var n := int(fc["vacationPerDay"] if vacation else fc["perDay"])
	var a := DayCycle.parse_time(fc["window"][0])
	var b := DayCycle.parse_time(fc["window"][1])
	var i := 0
	while i < n and pool.size() > 0:
		i += 1
		var k := int(floor(rng() * pool.size()))
		var f: Dictionary = pool[k]
		pool.remove_at(k)
		if rng() >= float(fc["chance"]):
			continue
		_favors_offered.append(f)
		(day["phone"] as Array).append({"at": DayCycle.format_time(_js_round(a + rng() * (b - a))), "kind": "message", "contact": f["contact"], "textKey": f["offerKey"]})


func _accept_favor(text_key: String) -> void:
	var f: Variant = null
	for x in _favors_offered:
		if x["offerKey"] == text_key:
			f = x
			break
	if f == null or _favors_accepted.has(f["id"]):
		return
	_favors_accepted[f["id"]] = true
	var def := {"id": "favor_%s" % f["id"], "textKey": f["textKey"], "on": f["on"], "optional": true}
	if f.get("marker") != null:
		def["marker"] = f["marker"]
	objectives.add(def)
	toast("favor.accepted", {"obj": _text(f["textKey"], f["id"])})


func _complete_favor(objective_id: String) -> void:
	var f: Variant = null
	for x in _favors_offered:
		if "favor_%s" % x["id"] == objective_id:
			f = x
			break
	if f == null:
		return
	var fs := perk_mul("favorScale")
	if f.get("life") != null:
		var delta := {}
		for k in f["life"]:
			delta[k] = _js_round(float(f["life"][k]) * fs)
		sim.life.apply(delta, "favor", f["contact"])
	var rep: Dictionary = f.get("reputation", {})
	for person in rep:
		reputation.change(person, _js_round(float(rep[person]) * fs))
	sim.report["favorsDone"] = float(sim.report.get("favorsDone", 0)) + 1
	var contact: Variant = cfg["life"]["contacts"].get(f["contact"])
	toast("favor.done", {"who": _text(contact["nameKey"] if contact != null else "", f["contact"])})
	game_event("favor:done")


## 조용한 곳: 머무는 동안 아무도 보지 않으면 시간이 쌓이고, 처음이면 도감에 오른다. 찾은 곳은 회복
func _update_quiet(dt: float) -> void:
	var qc: Dictionary = cfg["quietSpots"]
	var p := player.pos
	var now := clock.minutes
	var spot: Variant = null
	if mode["kind"] == "free":
		for q in qc["spots"]:
			if Vector2(float(q["at"][0]) - p.x, float(q["at"][1]) - p.y).length() <= float(q["radius"]) \
					and (q.get("from", "") == "" or now >= DayCycle.parse_time(q["from"])) \
					and (q.get("to", "") == "" or now < DayCycle.parse_time(q["to"])):
				spot = q
				break
	var spot_id: Variant = spot["id"] if spot != null else null
	if spot == null or spot_id != _quiet_spot_id:
		_quiet_timer = 0.0
	_quiet_spot_id = spot_id
	quiet_here = null
	if spot == null or gaze_count() > 0:
		return
	_quiet_timer += dt
	if not quiet_found.has(spot["id"]):
		if _quiet_timer < float(qc["discoverSec"]):
			return
		quiet_found[spot["id"]] = true
		_quiet_today += 1
		toast("quiet.found", {"name": _text(spot["nameKey"], spot["id"]), "n": quiet_found.size(), "max": (qc["spots"] as Array).size()})
		fx.append({"type": "sound", "id": "chime"})
		game_event("quiet:found")
	quiet_here = {"id": spot["id"], "nameKey": spot["nameKey"]}
	var rs := perk_mul("restScale")
	sim.energy.calm(float(qc["recovery"]["calmPerSec"]) * rs * dt)
	sim.energy.recover(float(qc["recovery"]["batteryPerSec"]) * rs * dt)


## 오늘 연차를 쓸 수 있는지 (그날 허용 + 이번 주 남은 연차)
func can_take_leave() -> bool:
	var lv: Variant = day.get("leave")
	return lv != null and lv.get("allowed", false) and not on_leave and leave_used < int(cfg["balance"]["leave"]["perWeek"])


## 연차: 회사 일 목표가 빠지고 쉬는 날이 된다. 그만큼 소득·평판이 조금 깎인다 (그날을 다시 하면 아침으로 돌아간다)
func take_leave() -> void:
	if not can_take_leave() or mode["kind"] != "dayIntro":
		return
	var lv: Dictionary = day["leave"]
	on_leave = true
	leave_used += 1
	if lv.get("cost") != null:
		sim.life.apply(lv["cost"], "leave")
	var objs: Array = day["objectives"].filter(func(o): return not o.get("workday", false))
	var ids := {}
	for o in objs:
		ids[o["id"]] = true
	var out := []
	for o in objs:
		if o.has("requires"):
			var c: Dictionary = o.duplicate()
			c["requires"] = o["requires"].filter(func(r): return ids.has(r))
			out.append(c)
		else:
			out.append(o)
	day = day.duplicate()
	day["objectives"] = out
	objectives = Objectives.new(day)
	toast(lv["noteKey"])
	game_event("leave")


## 주저앉은 뒤 집 침대에서 다시 일어난다: 시간이 흐르고(respawn.hours), 에너지는 일부만(respawn.battery),
## 심리 상태·증상은 가라앉은 채로. 목표·생활 지표·소지품은 그대로 이어진다.
## 일어난 시각이 respawn.latestTime을 넘으면 오늘은 그대로 끝난다 (못 한 필수 목표는 생활 지표 감소).
func respawn_home() -> void:
	var r: Dictionary = cfg["balance"]["respawn"]
	var wake := clock.minutes + float(r["hours"]) * 60.0
	for n in npcs:
		if n.state == "dialogue":
			n.end_dialogue()
	sim.revive(float(r["battery"]))
	phone_open = false
	qte = null
	item_break = null
	buffs = _no_buffs()
	view_target = null
	hurry = 0.0
	var p := player
	p.frozen = 0.0
	p.winded = 0.0
	p.locked_safe = null
	p.hidden = false
	p.phone_pretend = false
	p.cover = false
	p.eyes_closed = false
	p.moving = false
	p.running = false
	p.move_dir = null
	p.biking = false
	_teleport(_home_point())
	area = world.map.area_at(p.pos.x, p.pos.y)
	home_locked = true
	mode = {"kind": "free"}
	var latest := DayCycle.parse_time(r["latestTime"])
	if wake >= latest:
		clock.skip_to(latest)
		for o in objectives.list:
			if o["def"].get("mandatory", false) and not o["done"] and not o["missed"]:
				sim.life.apply(cfg["life"]["rewards"]["mandatorySkipped"], "mandatorySkipped", o["def"]["textKey"])
		toast("respawn.late")
		end_day()
		return
	clock.skip_to(wake)
	toast("respawn.home")
	game_event("respawn")


## 침대 옆 (다시 일어나는 자리, 순간 이동 도착지)
func _home_point() -> Vector2:
	for i in world.interactables:
		if i["kind"] == "bed":
			return Vector2(float(i["at"][0]), float(i["at"][1]) + 1.2)
	return world.spawns[day["spawn"]]


## 실패 후 오늘 다시
func retry_day() -> void:
	sim.life.restore(_day_start["life"])
	_next_max = _day_start["max"]
	story = Story.from_save(_day_start["story"])
	leave_used = _day_start["leaveUsed"]
	reputation.restore(_day_start["reputation"])
	achieved.clear()
	for a in _day_start["achieved"]:
		achieved[a] = true
	_week_events = (_day_start["weekEvents"] as Dictionary).duplicate()
	start_day(day_index)


## 처음부터
static func new_game(config: Dictionary) -> GameSession:
	return GameSession.new(config)


func _spawn_npcs() -> void:
	npcs = []
	_npc_hours = {}
	for n in day["npcs"]:
		_npc_hours[n["id"]] = [DayCycle.parse_time(n["from"]) if n.get("from", "") != "" else -INF, DayCycle.parse_time(n["to"]) if n.get("to", "") != "" else INF]
	var notice := perk_mul("noticeScale")
	for n in day["npcs"]:
		var base: Dictionary = cfg["npcProfiles"][n["profile"]]
		var profile := base
		if n.get("dialogue", "") != "":
			profile = base.duplicate()
			profile["dialogue"] = n["dialogue"]
		var pos: Vector2 = world.spawns[n["at"]]
		var a: Variant = world.map.area_at(pos.x, pos.y)
		var spawn := {"id": n["id"], "profileId": n["profile"], "profile": profile, "pos": pos, "areaId": a["id"] if a != null else null}
		if n.get("path", "") != "":
			spawn["path"] = world.paths[n["path"]]
		if n.get("seated", false):
			spawn["seated"] = true
		var npc := Npc.new(spawn)
		npc.warmth = reputation.warmth(reputation.person_of_npc(n["id"])) * notice
		npcs.append(npc)


## NPC가 지금 시각에 활동 중인지 (활동 시간은 하루 시작 때 분으로 바꿔 둔다)
func npc_active(npc: Npc) -> bool:
	var w: Variant = _npc_hours.get(npc.id)
	if w == null:
		return false
	var m := clock.minutes
	if m < w[0]:
		return false
	if m >= w[1] and npc.state != "dialogue":
		return false
	return true


func active_npcs() -> Array:
	var out := []
	var m := clock.minutes
	for n in npcs:
		var w: Variant = _npc_hours.get(n.id)
		if w != null and m >= w[0] and (m < w[1] or n.state == "dialogue"):
			out.append(n)
	return out


# ───────────────────────── 메인 스텝 ─────────────────────────

func step(dt: float, c: Dictionary) -> void:
	if c.size() < NO_CONTROLS.size():
		c = controls(c)
	match mode["kind"]:
		"dayIntro":
			if c["leave"]:
				take_leave()
			if c["confirm"]:
				mode = {"kind": "free"}
				game_event("dayStart:%s" % day["id"])
				# 월급날: 아침에 급여가 들어온다. 토요일 월세를 남겨 두고 한 주 동안 나눠 써야 한다
				if day.get("flags", {}).get("payday", false) and not vacation:
					var salary := DayCycle.salary_of(cfg["life"]["settlement"], sim.life)
					sim.life.add_money(salary)
					toast("payday", {"money": fmt_num(salary), "rent": fmt_num(float(cfg["life"]["settlement"]["monthEnd"]["rent"]))})
				for h in happenings:
					game_event("happening:%s" % h["id"])
					if h.get("expense") != null:
						var paid := minf(float(h["expense"]["money"]), sim.life.money)
						sim.life.add_money(-paid)
						toast(h["expense"]["toastKey"], {"money": fmt_num(paid)})
			return
		"night":
			var m := mode
			# [1]~[3] 오늘 밤 익힐 기술 고르기 (한 번만, 건너뛰어도 된다)
			var ui: int = c["useItem"]
			if ui >= 0 and m["perkChosen"] == null and ui < (m["perkChoices"] as Array).size():
				m["perkChosen"] = m["perkChoices"][ui]
				perks[m["perkChosen"]] = true
				var pdef: Dictionary = _find_by_id(cfg["perks"]["list"], m["perkChosen"])
				toast("perk.chosen", {"name": _text(pdef["nameKey"], pdef["id"])})
			if c["confirm"]:
				_advance_day()
			return
		"final":
			if c["retry"]:
				sim.life.restore({"values": (cfg["life"]["stats"]["start"] as Dictionary).duplicate(), "money": cfg["life"]["stats"]["startMoney"], "avoidCounts": {}})
				reports = []
				story.clear()
				leave_used = 0
				reputation.reset()
				perks.clear()
				achieved.clear()
				_week_events = {}
				if _has_seed:
					week_condition = _roll_week_condition()
				_next_max = float(difficulty["batteryStart"])
				start_day(0)
			return
		"burnout":
			# 에너지 0: 흐물흐물 주저앉은 뒤, 집에서 다시 일어난다
			mode["time"] += dt
			if (c["confirm"] or c["retry"]) and mode["time"] > 2:
				respawn_home()
			return
		"collapse":
			mode["time"] += dt
			if c["retry"] and mode["time"] > 1:
				retry_day()
			return

	var minutes_per_sec: float = float(day["dinner"]["minutesPerSecond"]) if mode["kind"] == "seated" and day.get("dinner") != null else float(cfg["balance"]["clock"]["minutesPerSecond"])
	clock.advance(dt, minutes_per_sec)
	sanctuary_broken = maxf(0.0, sanctuary_broken - dt)
	_personal_space_cd = maxf(0.0, _personal_space_cd - dt)

	_update_player_toggles(c)
	_update_mode(dt, c)
	if _stopped():
		return
	_update_item_break(dt, c)
	_update_buffs(dt)
	_update_quiet(dt)
	_update_phone(dt, c)
	_update_world(dt)
	_update_sim(dt)
	_update_desk_away(dt, minutes_per_sec)
	_update_monologue(dt)
	_announce_life_changes()


## 생활 지표가 바뀐 이유 한 줄 (화면·밤 정산에서 쓴다). change = LifeStats.ledger 항목
func life_why_text(change: Dictionary) -> String:
	var who := ""
	var w: String = change.get("who", "")
	if w != "":
		var contact: Variant = cfg["life"]["contacts"].get(w)
		var t: Variant = cfg["text"].get(contact["nameKey"]) if contact != null else cfg["text"].get(w)
		who = t if t != null else w
	var tx: Variant = cfg["text"].get("why.%s" % change["why"])
	if tx == null:
		tx = cfg["text"].get("why.other")
	if tx == null:
		tx = change["why"]
	return String(tx).replace("{who}", who)


## 생활 지표가 바뀌면 그 자리에서 이유를 알린다: 깎이면 늘, 오르면 크게 오를 때만. 같은 이유는 잠깐 묶는다
func _announce_life_changes() -> void:
	var ledger: Array = sim.life.ledger
	if _ledger_seen >= ledger.size():
		return
	var now: float = sim.snapshot()["time"]
	while _ledger_seen < ledger.size():
		var c: Dictionary = ledger[_ledger_seen]
		_ledger_seen += 1
		var d: float = c["delta"]
		if d > -1 and d < 4:
			continue
		var key := "%s:%s:%s" % [c["stat"], c["why"], c.get("who", "")]
		if now - float(_last_why_toast.get(key, -99.0)) < 3:
			continue
		_last_why_toast[key] = now
		toast("why.toast.down" if d < 0 else "why.toast.up", {"stat": _text("life.%s" % c["stat"], c["stat"]), "why": life_why_text(c)})


## 실패·밤 화면으로 넘어가 하루 진행이 멈췄는지 (_update_mode 안에서 모드가 바뀔 수 있다)
func _stopped() -> bool:
	var k: String = mode["kind"]
	return k == "burnout" or k == "night" or k == "collapse"


# ───────────────────────── 플레이어 ─────────────────────────

func _update_player_toggles(c: Dictionary) -> void:
	var p := player
	var modal := is_modal()
	if c["earphonesPressed"]:
		p.earphones = not p.earphones
	if c["maskPressed"]:
		p.mask = not p.mask
	p.phone_pretend = c["phonePretend"] and not modal and not c["cover"]
	p.cover = c["cover"] and mode["kind"] != "speech"
	p.eyes_closed = c["eyesClosed"] and not modal
	if c["phoneToggle"] and p.biking:
		toast("bike.noPhone")
	elif c["phoneToggle"] and not p.cover and mode["kind"] != "speech":
		phone_open = not phone_open
		phone_cursor = 0
	if p.cover:
		phone_open = false
	if not modal and not p.biking:
		# 단축키 1~8 = 가방 칸 순서
		var ui: int = c["useItem"]
		if ui >= 0:
			var slots := bag_slots()
			if ui < slots.size():
				var def: Variant = _consumable(slots[ui])
				if def != null:
					_use_item(def)


## 이동이 막히는 모드
func is_modal() -> bool:
	var k: String = mode["kind"]
	return k != "free" and k != "peephole"


func _move_player(dt: float, c: Dictionary) -> void:
	var p := player
	var sk: Dictionary = cfg["skills"]
	p.frozen = maxf(0.0, p.frozen - dt)
	p.winded = maxf(0.0, p.winded - dt)
	var mv: Vector2 = c["move"]
	var mx := float(mv.x)
	var my := float(mv.y)
	var length := sqrt(mx * mx + my * my)
	if length > 1:
		mx /= length
		my /= length
	var can_move: bool = p.frozen <= 0 and not phone_open and p.locked_safe == null and mode["kind"] == "free"
	p.moving = can_move and length > 0.01
	p.running = p.moving and c["sprint"] and p.winded <= 0 and not p.phone_pretend and not p.biking
	var pc: Dictionary = cfg["player"]
	var speed := float(pc["runSpeed"]) if p.running else float(pc["walkSpeed"])
	if p.biking:
		speed *= float(cfg["balance"]["bike"]["speedMultiplier"])
	speed *= perk_mul("walkScale")
	if p.phone_pretend:
		speed *= float(sk["phonePretend"]["moveMultiplier"])
	if p.cover:
		speed *= float(sk["coverCheeks"]["moveMultiplier"])
	if p.eyes_closed:
		speed *= float(sk["closeEyes"]["moveMultiplier"])
	# 바닥이 미는 힘 (무빙워크)
	var tile: Dictionary = world.map.def(floori(p.pos.x), floori(p.pos.y))
	var push: Variant = tile.get("push")
	var radius := float(pc["radius"])
	if p.moving:
		p.pos = world.map.move_circle(p.pos, mx * speed * dt, my * speed * dt, radius)
		p.move_dir = Vector2(mx, my)
		p.walk_phase += dt * speed * 2.2
	else:
		p.move_dir = null
	# 조급함: 서두를수록 마음도 급해진다. 멈춰도 바로 풀리지 않는다
	var hc: Dictionary = cfg["balance"]["hurry"]
	hurry = minf(1.0, hurry + dt / float(hc["fullAfterSec"])) if p.running else maxf(0.0, hurry - dt / float(hc["calmSec"]))
	# 서두르는 동안(조급함 절반 이상)은 긴장이 가라앉지 않는다
	if hurry > 0:
		sim.energy.add_mood("tension", hurry * float(hc["stressPerSec"]) * dt, hurry > 0.5)
	if hurry >= 1 and not _hurry_noted:
		_hurry_noted = true
		game_event("hurry:full")
	elif hurry <= 0:
		_hurry_noted = false
	if push != null and p.locked_safe == null and mode["kind"] == "free":
		p.pos = world.map.move_circle(p.pos, float(push[0]) * dt, float(push[1]) * dt, radius)

	# 바라보는 방향: 마우스, 없으면 이동 방향. 편두통이면 시선이 흔들린다
	var aim: Variant = c["aim"]
	var target: float = float(aim) if aim != null else (atan2(my, mx) if p.moving else p.facing)
	var migraine := sim.somatic.intensity("migraine")
	if migraine > 0.2:
		target += sin(float(sim.snapshot()["time"]) * 3.1) * migraine * 0.35
	p.facing = target


# ───────────────────────── 모드별 ─────────────────────────

func _update_mode(dt: float, c: Dictionary) -> void:
	var m := mode
	match m["kind"]:
		"free", "peephole":
			_move_player(dt, c)
			_update_free(dt, c)
		"dialogue":
			_update_dialogue(dt, c, m)
		"speech":
			_update_speech(dt, c, m)
		"work":
			_update_work(dt, c, m)
		"piano":
			var g: PianoGame = m["game"]
			if g.done:
				m["doneTime"] += dt
				if m["doneTime"] > 1.6 or c["interactPressed"]:
					_finish_piano()
			elif c["cancel"]:
				mode = {"kind": "free"}
			elif int(c["note"]) >= 0:
				var note: int = c["note"]
				var hit := g.press(note)
				fx.append({"type": "sound", "id": "piano", "note": note + (0.0 if hit else 0.5)})
		"travel":
			m["timer"] += dt
			if m["timer"] >= m["total"]:
				_teleport(Vector2(float(m["target"]["arrive"][0]), float(m["target"]["arrive"][1])))
				if m["portal"]["kind"] == "stairs":
					player.winded = 10.0
				mode = {"kind": "free"}
		"elevator":
			_update_elevator(dt, c, m)
		"bus":
			_update_bus(dt, c, m)
		"metroMenu":
			_update_metro_menu(c, m)
		"metro":
			_update_metro(dt, m)
		"selfCheckout":
			m["timer"] += dt
			if floori(m["timer"] * 2) != floori((m["timer"] - dt) * 2):
				fx.append({"type": "sound", "id": "beep"})
			if m["timer"] >= m["total"]:
				_complete_checkout()
				mode = {"kind": "free"}
		"rest":
			m["time"] += dt
			var r: Dictionary = cfg["balance"]["recovery"]
			var per: float = float(r["benchPerSec"]) if m["what"] == "bench" else (float(r["booksPerSec"]) if m["what"] == "books" else float(r["windowPerSec"]))
			sim.energy.recover(per * perk_mul("restScale") * dt)
			if m["what"] == "books":
				sim.energy.calm(float(r["booksStressPerSec"]) * dt)
			if m["what"] == "window" and m["time"] > 4:
				calm_buff = true
			if c["interactPressed"] or c["cancel"] or (c["move"] as Vector2).length() > 0.1:
				mode = {"kind": "free"}
		"priceTag":
			var clerk: Variant = null
			for n in npcs:
				if n.npc_type == "stalker" and npc_active(n):
					clerk = n
					break
			var watched: bool = (clerk.gazing or clerk.pursuing) if clerk != null else false
			if c["smile"] and not watched:
				m["progress"] += dt / 2.5
			if c["smile"] and watched and clerk != null:
				toast("priceTag.caught")
				start_dialogue(clerk, false)
				return
			if m["progress"] >= 1:
				toast("priceTag.done")
				mode = {"kind": "free"}
			elif c["interactPressed"] or c["cancel"] or (c["move"] as Vector2).length() > 0.1:
				mode = {"kind": "free"}
		"seated":
			_update_seated(dt, c, m)
		"shop":
			_update_shop(c, m)
		"laundry":
			# 세탁이 끝날 때까지 기다린다. 자리를 뜨면 처음부터
			m["time"] += dt
			var l: Dictionary = cfg["balance"]["laundry"]
			if m["time"] >= float(l["waitSec"]):
				sim.life.apply({"essentials": l["essentials"]}, "laundry")
				clock.advance(float(l["minutes"]), 1.0)
				toast("laundry.done")
				game_event("done:laundry")
				mode = {"kind": "free"}
			elif c["cancel"] or (c["move"] as Vector2).length() > 0.1:
				toast("laundry.cancel")
				mode = {"kind": "free"}


func _update_free(dt: float, c: Dictionary) -> void:
	var p := player
	# 외시경: 누르고 있는 동안만
	if mode["kind"] == "peephole":
		if not c["interactHeld"]:
			mode = {"kind": "free"}
			view_target = null
		return
	_update_qte(dt, c)

	# 세이프 존 (화장실 칸·피팅룸)
	var safe: Variant = world.safe_at(p.pos)
	if p.locked_safe != null:
		p.safe_time += dt
		var s: Dictionary = p.locked_safe
		if s["kind"] == "fitting" and not objectives.is_done("tryOn") and p.inventory["clothes"] and p.safe_time > 3:
			game_event("tryOn")
		var after := float(s["noiseAfterSec"])
		if p.safe_time >= after:
			if p.safe_time - dt < after and _safe_rests:
				toast("safe.waiting")
			p.knock_timer -= dt
			if p.knock_timer <= 0:
				p.knock_timer = float(cfg["balance"]["safe"]["knockRepeatSec"])
				sim.bus.emit("knock")
				fx.append({"type": "sound", "id": "knock"})
				game_event("safe:knock")
				if s["kind"] == "fitting":
					qte = {"kind": "knock", "timer": 0.0, "window": float(cfg["balance"]["safe"]["fittingAnswerSec"])}
		if c["interactPressed"]:
			p.locked_safe = null
			toast("interact.unlockStall")
		prompt = {"labelKey": "interact.unlockStall", "at": p.pos}
		return

	# 상호작용 대상
	var target: Variant = _nearest_interactable()
	prompt = {"labelKey": target["labelKey"], "at": target["at"]} if target != null else null
	if safe != null and p.locked_safe == null and target == null:
		prompt = {"labelKey": "interact.lockStall", "at": p.pos}
	# 자전거: 주변에 할 게 없으면 [F]로 그 자리에서 내린다
	if p.biking and target == null:
		prompt = {"labelKey": "interact.bikeOff", "at": p.pos}
	if not c["interactPressed"]:
		return
	if p.biking and target == null:
		_park_bike("bike.parked")
		return
	if sim.somatic.slips(rng()):
		toast("slip")
		return
	if target != null:
		_interact(target)
	elif safe != null:
		p.locked_safe = safe
		p.safe_time = 0.0
		p.knock_timer = 0.0
		for n in npcs:
			n.lose_track()
		# 같은 칸에서 방금 쉬었다면 숨을 수는 있어도 쉬어지지 않는다
		var last: Variant = _safe_used_at.get(safe["id"])
		_safe_rests = last == null or clock.minutes - float(last) >= float(cfg["balance"]["safe"]["reuseMin"])
		if _safe_rests:
			_safe_used_at[safe["id"]] = clock.minutes
		toast("safe.locked" if _safe_rests else "safe.tooSoon")
		game_event("safe:lock")


# ───────────────────────── 상호작용 ─────────────────────────

## 가장 가까운 상호작용 대상 { kind, labelKey, at: Vector2, def?, portal?, npc? } 또는 null
func _nearest_interactable() -> Variant:
	var p := player.pos
	var rng_r := float(cfg["player"]["interactRange"]) + INTERACT_RANGE_EXTRA
	var best: Variant = null
	var best_d := rng_r
	var home := at_home()
	for it in world.interactables:
		var at := Vector2(float(it["at"][0]), float(it["at"][1]))
		var d := at.distance_to(p)
		if d >= best_d:
			continue
		if it["kind"] == "doorLock" and not home:
			continue
		best_d = d
		var label: String = it["labelKey"]
		if it["kind"] == "doorLock" and home_locked:
			label = "interact.doorUnlock"
		else:
			var ia := _interact_at(it["id"])
			if ia.get("labelKey", "") != "":
				label = ia["labelKey"]
		best = {"kind": it["kind"], "labelKey": label, "at": at, "def": it}
	for portal in world.portals:
		var at := Vector2(float(portal["at"][0]), float(portal["at"][1]))
		var d := at.distance_to(p)
		if d < best_d:
			best_d = d
			best = {"kind": "flavor", "labelKey": portal["labelKey"], "at": at, "portal": portal}
	for npc in active_npcs():
		var t: String = npc.npc_type
		if t != "ally" and t != "pet":
			continue
		var d: float = npc.pos.distance_to(p)
		if d < best_d + 0.4:
			best_d = d
			best = {"kind": "flavor", "labelKey": "interact.pet" if t == "pet" else "interact.talkAlly", "at": npc.pos, "npc": npc}
	return best


## 오늘의 하루 데이터가 이 상호작용에 덧씌운 것 (interactAt). 없으면 빈 Dictionary
func _interact_at(id: String) -> Dictionary:
	var ia: Variant = day.get("interactAt")
	if ia is Dictionary and ia.has(id):
		return ia[id]
	return {}


func _interact(target: Dictionary) -> void:
	var def: Variant = target.get("def")
	# 자전거는 대여소에 반납하거나, 다른 걸 하려면 그 자리에 세운다
	if player.biking and (def == null or def["kind"] != "bikeDock"):
		_park_bike("bike.parked")
	if target.has("portal"):
		_start_travel(target["portal"])
		return
	if target.has("npc"):
		var npc: Npc = target["npc"]
		if npc.npc_type == "pet":
			_pet_cat()
		else:
			start_dialogue(npc, false)
		return
	var it: Dictionary = def
	for b in _arr(day, "blocked"):
		if b.get("interactable") == it["id"]:
			toast(b["toastKey"])
			return
	var r: Dictionary = cfg["balance"]["recovery"]
	var life := sim.life
	var can_end := objectives.can_end_day
	game_event("interact:%s" % it["id"])
	match it["kind"]:
		"bed":
			if can_end:
				end_day()
			else:
				toast("interact.bed.notYet")
		"piano":
			mode = {"kind": "piano", "game": PianoGame.new(PianoGame.PIANO_MELODY), "doneTime": 0.0}
		"window":
			mode = {"kind": "rest", "what": "window", "time": 0.0}
			toast("window.done")
		"bench":
			mode = {"kind": "rest", "what": "bench", "time": 0.0}
			toast("bench.done")
		"drip":
			_add_item("coffee")
			clock.advance(10.0, 1.0)
			toast("drip.done")
		"fridge":
			if life.get_stat("essentials") > 10:
				sim.energy.recover(float(r["homeMeal"]))
				life.apply({"essentials": cfg["life"]["rewards"]["homeMealEssentials"]}, "homeMeal")
				toast("fridge.done")
			else:
				toast("fridge.empty")
		"sink":
			sim.somatic.clear_all()
			sim.energy.calm(float(r["washStressRelief"]))
			toast("sink.done")
		"mirror":
			rehearsed = true
			toast("mirror.done")
		"doorLock":
			home_locked = not home_locked
			fx.append({"type": "sound", "id": "doorLock" if home_locked else "doorUnlock"})
			toast("doorLock.locked" if home_locked else "doorLock.unlocked")
			if home_locked:
				game_event("home:lock")
		"peephole":
			mode = {"kind": "peephole"}
			var hall: Dictionary = world.map.area("apt3f")
			var rect: Array = hall["rect"]
			view_target = Vector2(float(rect[0]) + 10, float(rect[1]) + 2.5)
			var busy := false
			for n in active_npcs():
				if CityGrid.in_rect(rect, n.pos.x, n.pos.y) and n.npc_type != "pet":
					busy = true
					break
			game_event("peephole:busy" if busy else "peephole:clear")
		"elevator":
			_call_elevator(it)
		"busStop":
			_wait_bus(it)
		"metroGate":
			var metro: Variant = cfg["world"].get("metro")
			if it.get("target", "") != "" and metro != null and metro["stations"].has(it["target"]):
				mode = {"kind": "metroMenu", "from": it["target"], "cursor": 0}
		"bikeDock":
			if player.biking:
				_park_bike("bike.returned")
			else:
				# 정기권이 있으면 요금 없이
				var fare := 0.0 if perk_add("bikeFree") > 0 else float(cfg["balance"]["bike"]["fare"])
				if _pay(fare):
					player.biking = true
					toast("bike.rent" if fare > 0 else "bike.rentPass", {"fare": fmt_num(fare)})
					game_event("bike:ride")
		"flavor":
			var mono: String = _interact_at(it["id"]).get("monologue", it.get("monologue", ""))
			if mono != "":
				monologue.say(mono)
		"desk":
			if _objective_available("done:work") and day.get("work") != null:
				var w: Dictionary = day["work"]
				mode = {"kind": "work", "game": WorkGame.new(int(w["tasks"]), float(w["focusPerSec"]), w["pingEverySec"], float(w["pingTimeoutSec"]), rng), "idle": 0.0, "ledgerFrom": sim.life.ledger.size()}
			else:
				toast("interact.bed.notYet")
		"speech":
			var speech_id: String = _interact_at(it["id"]).get("speech", it.get("speech", ""))
			var sp: Dictionary = cfg["speeches"][speech_id]
			# 값을 치러야 하는 말(약국·선물 포장)은 돈이 모자라면 말을 꺼내지 않는다
			if sp.get("grant") != null and float(sp["grant"]["price"]) > sim.life.money:
				toast("noMoney")
			elif _objective_available(sp["objectiveEvent"]) or sp.get("anytime", false):
				_start_speech(speech_id)
			else:
				toast("interact.bed.notYet")
		"coldDrink":
			var price := float(it.get("price", 0))
			if _pay(price):
				# 무료(탕비실 정수기)는 그 자리에서 마시고, 사 온 것은 들고 다닌다
				if price == 0:
					_apply_effects(_consumable("coldDrink")["effects"])
				else:
					_add_item("coldDrink")
				toast("coldDrink.done")
		"shop":
			mode = {"kind": "shop", "shopId": it["shop"], "cursor": 0}
		"chore":
			var chore_id: String = it["chore"]
			var ch: Dictionary = cfg["chores"][chore_id]
			if _chores_done.has(chore_id):
				toast("chore.already")
			else:
				_chores_done[chore_id] = true
				_apply_effects(ch["effects"])
				if ch.get("life") != null:
					sim.life.apply(ch["life"], "chore", ch["toastKey"])
				clock.advance(float(ch["minutes"]), 1.0)
				toast(ch["toastKey"])
				game_event("chore:%s" % chore_id)
		"laundry":
			mode = {"kind": "laundry", "time": 0.0}
			toast("laundry.start")
		"browse":
			mode = {"kind": "rest", "what": "books", "time": 0.0}
			toast("browse.start")
		"soloMeal":
			if _pay(float(it.get("price", 0))):
				sim.energy.recover(float(r["soloMeal"]))
				clock.advance(30.0, 1.0)
				toast("soloMeal.done")
		"martItem":
			var inv: Array = player.inventory["items"]
			if inv.has(it["item"]):
				toast("martItem.already")
			else:
				inv.append(it["item"])
				toast("martItem.done", {"item": _text("martItem.%s" % it["item"], it["item"]), "n": inv.size()})
				game_event("pick:martItem")
		"checkout":
			if not _objective_available("done:checkout"):
				toast("interact.bed.notYet")
			elif it.get("mode") == "self":
				mode = {"kind": "selfCheckout", "timer": 0.0, "total": 22.0}
				toast("checkout.self.waiting")
			else:
				_start_speech("checkoutNormal")
		"priceTag":
			mode = {"kind": "priceTag", "progress": 0.0}
			toast("priceTag.hint")
		"clothesPick":
			player.inventory["clothes"] = true
			toast("clothesPick.done")
		"seat":
			_take_seat(it.get("seat", "middle"))


func _objective_available(event: String) -> bool:
	for o in objectives.list:
		if o["def"].get("on", "") == event and objectives.available(o):
			return true
	return false


func _pay(price: float) -> bool:
	if price <= 0:
		return true
	if sim.life.spend(price):
		return true
	toast("noMoney")
	return false


## 소모품 정의 (없으면 null)
func _consumable(id: String) -> Variant:
	for d in cfg["items"]["consumables"]:
		if d["id"] == id:
			return d
	return null


## 가방에 넣는다. 가득 차면 false (소모품은 합쳐서 items.bagMax개까지)
func _add_item(id: String) -> bool:
	var inv: Dictionary = player.inventory["consumables"]
	if bag_count() >= int(cfg["items"]["bagMax"]):
		toast("bag.full")
		return false
	inv[id] = int(inv.get(id, 0)) + 1
	return true


## 가방 칸: 든 순서대로 소모품 id (단축키 1~8, 메모 표시)
func bag_slots() -> Array:
	var out := []
	var inv: Dictionary = player.inventory["consumables"]
	for id in inv:
		if int(inv[id]) > 0:
			out.append(id)
	return out


## 상점 품목을 오늘 몇 개 더 챙길 수 있는지 (perDay 없으면 INF)
func shop_left(shop_id: String, item: String) -> float:
	var shop: Variant = cfg["items"]["shops"].get(shop_id)
	if shop == null:
		return INF
	for e in shop["stock"]:
		if e["item"] == item:
			if not e.get("perDay", 0):
				return INF
			return float(e["perDay"]) - float(_shop_taken.get("%s:%s" % [shop_id, item], 0))
	return INF


func bag_count() -> int:
	var n := 0
	var inv: Dictionary = player.inventory["consumables"]
	for id in inv:
		n += int(inv[id])
	return n


func _use_item(def: Dictionary) -> void:
	var inv: Dictionary = player.inventory["consumables"]
	if int(inv.get(def["id"], 0)) <= 0:
		toast("use.none")
		return
	if item_break != null:
		return
	var per_day := bool(def.get("usesPerDay", 0))
	if per_day and uses_left(def["id"]) <= 0:
		toast("use.enoughToday")
		return
	if per_day:
		_item_uses[def["id"]] = int(_item_uses.get(def["id"], 0)) + 1
	else:
		inv[def["id"]] = int(inv[def["id"]]) - 1
	if not def.get("breakSec", 0):
		_apply_effects(def["effects"])
		toast(def["useKey"])
		_apply_lasting(def["effects"])
		return
	# 혼자만의 틈: 멈춰 서서 천천히. 효과는 그동안 나눠 찬다
	item_break = {"id": def["id"], "time": 0.0, "dur": float(def["breakSec"]) * perk_mul("breakScale"), "paused": false}
	toast("break.startComfort" if per_day else "break.startFood", {"item": _text(def["nameKey"], def["id"])})


## 위안 물건을 오늘 몇 번 더 쓸 수 있는지 (소모품은 INF)
func uses_left(id: String) -> float:
	var def: Variant = _consumable(id)
	var per: float = float(def.get("usesPerDay", 0)) if def != null else 0.0
	return per - float(_item_uses.get(id, 0)) if per > 0 else INF


func _update_item_break(dt: float, c: Dictionary) -> void:
	var b: Variant = item_break
	if b == null:
		return
	var def: Dictionary = _consumable(b["id"])
	# 움직이거나, 말을 걸려 오거나, 폰을 열면 그만둔다 (먹던 만큼만 남는다)
	if mode["kind"] != "free" or phone_open or (c["move"] as Vector2).length() > 0.1:
		item_break = null
		toast("break.interrupted" if mode["kind"] == "dialogue" else "break.stopped")
		return
	var watched: bool = def.get("quiet", false) and (gaze_count() > 0 or crowd.count_near(player.pos, 3) > 0)
	if watched and not b["paused"]:
		toast("break.watched")
	b["paused"] = watched
	if watched:
		return
	var k := minf(dt, b["dur"] - b["time"]) / float(b["dur"])
	b["time"] += dt
	var e: Dictionary = def["effects"]
	_apply_effects({"battery": float(e.get("battery", 0)) * k, "stress": float(e.get("stress", 0)) * k, "flush": float(e.get("flush", 0)) * k, "migraine": float(e.get("migraine", 0)) * k})
	if b["time"] >= b["dur"]:
		item_break = null
		toast(def["useKey"])
		_apply_lasting(def["effects"])


## 지속 효과와 순간 이동 (먹기를 마쳤을 때)
func _apply_lasting(e: Dictionary) -> void:
	if e.get("soothe") != null:
		buffs["soothe"] = {"perSec": float(e["soothe"]["perSec"]), "left": float(e["soothe"]["sec"])}
	if e.get("resist") != null:
		buffs["resist"] = {"scale": float(e["resist"]["scale"]), "left": float(e["resist"]["sec"])}
	if e.get("warpHome", false):
		_warp_home()


## "모두 사라져 버려~": 주변의 자극에서 곧장 집으로. 문은 잠겨 있고, 시간은 그대로
func _warp_home() -> void:
	for n in npcs:
		if n.state == "dialogue":
			n.end_dialogue()
	var home := _home_point()
	var p := player
	p.frozen = 0.0
	p.locked_safe = null
	p.hidden = false
	p.phone_pretend = false
	p.cover = false
	p.eyes_closed = false
	p.moving = false
	p.running = false
	p.move_dir = null
	p.biking = false
	phone_open = false
	hurry = 0.0
	# 피팅룸 노크·외시경 같은 그 자리의 일은 두고 온다
	qte = null
	view_target = null
	item_break = null
	_teleport(home)
	# 영역(area)은 그대로 두어 다음 _update_world가 '집에 들어옴'(enter:home, 미뤄 둔 초인종)을 처리하게 한다
	home_locked = true
	mode = {"kind": "free"}
	fx.append({"type": "warp"})
	fx.append({"type": "sound", "id": "doorLock"})
	game_event("home:lock")
	game_event("warp:home")


## 아이템 지속 효과의 시간 흐름
func _update_buffs(dt: float) -> void:
	var so: Dictionary = buffs["soothe"]
	if so["left"] > 0:
		so["left"] = maxf(0.0, so["left"] - dt)
		sim.energy.calm(float(so["perSec"]) * dt)
	var re: Dictionary = buffs["resist"]
	if re["left"] > 0:
		re["left"] = maxf(0.0, re["left"] - dt)
		if re["left"] == 0:
			toast("buff.resist.end")


func _apply_effects(e: Dictionary) -> void:
	if e.get("battery", 0):
		sim.energy.recover(float(e["battery"]))
	if e.get("stress", 0):
		sim.energy.calm(float(e["stress"]))
	if e.get("flush", 0):
		sim.somatic.relieve("flush", float(e["flush"]))
	if e.get("migraine", 0):
		sim.somatic.relieve("migraine", float(e["migraine"]))


## 주문: 단골이 되기 전엔 짧은 주문 대화가 자극, 단골이면 "늘 드시던 걸로요?" (그날 처음 한 번)
func _order_at(shop_id: String) -> void:
	var shop: Variant = cfg["items"]["shops"].get(shop_id)
	var reg: Variant = shop.get("regular") if shop != null else null
	if reg != null:
		if float(story.get(reg["counter"], 0)) < float(reg["minVisits"]):
			if not perk_add("orderFree"):
				sim.bus.emit(reg["orderStimulus"], shop_id)
		elif not _regular_greeted.has(shop_id):
			_regular_greeted[shop_id] = true
			toast(reg["greetKey"])
	game_event("bought:%s" % shop_id)


func _update_shop(c: Dictionary, m: Dictionary) -> void:
	var stock: Array = cfg["items"]["shops"][m["shopId"]]["stock"]
	if int(c["menuNav"]) != 0:
		m["cursor"] = (int(m["cursor"]) + int(c["menuNav"]) + stock.size()) % stock.size()
	if c["cancel"] or c["phoneIgnore"]:
		mode = {"kind": "free"}
		return
	if not (c["interactPressed"] or c["phoneReply"]):
		return
	var entry: Dictionary = stock[m["cursor"]]
	var gear: Dictionary = _find_by_id(cfg["items"]["gear"], entry["item"])
	if not gear.is_empty():
		# 우산 같은 물건은 하나면 충분하다
		if (player.inventory["gear"] as Array).has(gear["id"]):
			toast("shop.owned")
			return
		if not _pay(float(entry["price"])):
			return
		player.inventory["gear"].append(gear["id"])
		_owned_gear[gear["id"]] = true
		toast("shop.bought", {"item": _text(gear["nameKey"], gear["id"])})
		return
	if bag_count() >= int(cfg["items"]["bagMax"]):
		toast("bag.full")
		return
	if shop_left(m["shopId"], entry["item"]) <= 0:
		toast("shop.soldOut")
		return
	if float(entry["price"]) > 0 and not _pay(float(entry["price"])):
		return
	if entry.get("life") != null:
		sim.life.apply(entry["life"], "shop")
	_add_item(entry["item"])
	_order_at(m["shopId"])
	var key := "%s:%s" % [m["shopId"], entry["item"]]
	_shop_taken[key] = int(_shop_taken.get(key, 0)) + 1
	var name := _text(_consumable(entry["item"])["nameKey"], entry["item"])
	toast("shop.bought" if float(entry["price"]) > 0 else "shop.taken", {"item": name})


func _pet_cat() -> void:
	sim.somatic.clear_all()
	sim.energy.calm(float(cfg["balance"]["recovery"]["petStressRelief"]))
	calm_buff = true
	game_event("pet")


# ───────────────────────── 이동 수단 ─────────────────────────

func _start_travel(portal: Dictionary) -> void:
	var target: Dictionary = _find_by_id(world.portals, portal["to"])
	mode = {"kind": "travel", "portal": portal, "target": target, "timer": 0.0, "total": maxf(0.6, float(portal["travelSec"]))}
	game_event("portal:%s" % portal["kind"])
	if portal["kind"] == "stairs":
		fx.append({"type": "sound", "id": "stairs"})


func _teleport(to: Vector2) -> void:
	player.pos = to


# ───────────────────────── 공유 자전거 ─────────────────────────

func _park_bike(toast_key: String) -> void:
	if not player.biking:
		return
	player.biking = false
	toast(toast_key)
	game_event("bike:park")


# ───────────────────────── 마을버스 ─────────────────────────

## 지금 도로 위의 버스 (연출용) [{ x, y, dir, depart, stopped }]
func buses_on_road() -> Array:
	return bus_route.buses_at(clock.minutes) if bus_route != null else []


func _is_rush() -> bool:
	for h in cfg["balance"]["clock"]["rushHours"]:
		if clock.minutes >= DayCycle.parse_time(h[0]) and clock.minutes < DayCycle.parse_time(h[1]):
			return true
	return false


## 정류장에서 다음 버스를 기다린다. 움직이면 그만 기다린다
func _wait_bus(it: Dictionary) -> void:
	var route := bus_route
	if route == null or it.get("target", "") == "":
		return
	var stops: Dictionary = cfg["world"]["bus"]["stops"]
	var ax := float(it["at"][0])
	var from_x := INF
	for id in stops:
		var sx := float(stops[id]["x"])
		if absf(sx - ax) < absf(from_x - ax):
			from_x = sx
	var to_x := route.stop_x(it["target"])
	var dir := 1 if to_x > from_x else -1
	var next := route.next_at(dir, from_x, clock.minutes)
	mode = {"kind": "bus", "phase": "waiting", "dir": dir, "fromX": from_x, "to": it["target"], "depart": next["depart"], "awkward": false}
	player.facing = -PI / 2.0 if dir == 1 else PI / 2.0
	game_event("bus:wait")


## 기다릴 남은 분 (UI)
func bus_wait_min() -> float:
	var m := mode
	if m["kind"] != "bus" or bus_route == null:
		return 0.0
	return maxf(0.0, bus_route.reaches_at(m["dir"], m["depart"], m["fromX"]) - clock.minutes)


# ───────────────────────── 지하철 ─────────────────────────

## 이 역에서 갈 수 있는 역 (노선 순서대로, 지금 역 제외) [{ id, stops }]
func metro_destinations(from: String) -> Array:
	var metro: Variant = cfg["world"].get("metro")
	var line: Array = metro["line"] if metro != null else []
	var i := line.find(from)
	var out := []
	for id in line:
		if id != from:
			out.append({"id": id, "stops": absi(line.find(id) - i)})
	return out


func _update_metro_menu(c: Dictionary, m: Dictionary) -> void:
	var dests := metro_destinations(m["from"])
	if int(c["menuNav"]) != 0:
		m["cursor"] = (int(m["cursor"]) + int(c["menuNav"]) + dests.size()) % dests.size()
	if c["cancel"] or c["phoneIgnore"]:
		mode = {"kind": "free"}
		return
	if not (c["interactPressed"] or c["phoneReply"]):
		return
	var d: Dictionary = dests[m["cursor"]]
	var mc: Dictionary = cfg["balance"]["metro"]
	if not _pay(float(mc["fare"])):
		mode = {"kind": "free"}
		return
	fx.append({"type": "sound", "id": "beep"})
	# 타는 동안 시간이 timeScale배로 흐르므로, 실제로는 (정거장 × 분) / timeScale초
	var minutes := float(d["stops"]) * float(mc["minutesPerStop"])
	mode = {"kind": "metro", "from": m["from"], "to": d["id"], "timer": 0.0, "total": minutes / (float(cfg["balance"]["clock"]["minutesPerSecond"]) * float(mc["timeScale"]))}
	game_event("metro:board")
	if _is_rush():
		game_event("metro:rush")


func _update_metro(dt: float, m: Dictionary) -> void:
	var mc: Dictionary = cfg["balance"]["metro"]
	clock.advance(dt, float(cfg["balance"]["clock"]["minutesPerSecond"]) * (float(mc["timeScale"]) - 1))
	m["timer"] += dt
	if m["timer"] < m["total"]:
		return
	var st: Dictionary = cfg["world"]["metro"]["stations"][m["to"]]
	_teleport(Vector2(float(st["at"][0]), float(st["at"][1])))
	fx.append({"type": "sound", "id": "chime"})
	mode = {"kind": "free"}
	toast("metro.arrive", {"name": _text(st["nameKey"], m["to"])})
	game_event("metro:arrive:%s" % m["to"])


func _update_bus(dt: float, c: Dictionary, m: Dictionary) -> void:
	var route := bus_route
	var b: Dictionary = cfg["balance"]["bus"]
	var now := clock.minutes
	if m["phase"] == "waiting":
		if (c["move"] as Vector2).length() > 0.3 or c["cancel"]:
			mode = {"kind": "free"}
			return
		if now < route.reaches_at(m["dir"], m["depart"], m["fromX"]):
			return
		# 버스 도착: 교통카드 삑
		if not _pay(float(b["fare"])):
			mode = {"kind": "free"}
			return
		fx.append({"type": "sound", "id": "beep"})
		toast("bus.board", {"fare": fmt_num(float(b["fare"]))})
		m["phase"] = "riding"
		m["awkward"] = rng() < float(b["acquaintanceChance"])
		game_event("bus:board")
		if _is_rush():
			game_event("bus:rush")
		if m["awkward"]:
			toast("bus.acquaintance")
			game_event("bus:awkward")
		return
	# 타고 가는 동안 시간이 빨리 흐른다 (넓은 도시)
	clock.advance(dt, float(cfg["balance"]["clock"]["minutesPerSecond"]) * (float(b["rideTimeScale"]) - 1))
	# 버스와 함께 움직인다 (카메라가 따라간다)
	var bus: Variant = route.bus_at(m["dir"], m["depart"], clock.minutes)
	var dir: int = m["dir"]
	# [F] 다음 정류장에서 내리기
	if c["interactPressed"] and bus != null:
		var stops: Dictionary = cfg["world"]["bus"]["stops"]
		var next_id: Variant = null
		var next_x := 0.0
		for id in stops:
			var sx := float(stops[id]["x"])
			if (sx - float(bus["x"])) * dir > 1 and (next_id == null or (sx - next_x) * dir < 0):
				next_id = id
				next_x = sx
		if next_id != null and next_id != m["to"]:
			m["to"] = next_id
			toast("bus.alightNext", {"name": _text(stops[next_id]["nameKey"], next_id)})
	var to_x := route.stop_x(m["to"])
	if bus != null:
		player.pos = Vector2(float(bus["x"]), float(bus["y"]))
	if bus == null or clock.minutes >= route.reaches_at(dir, m["depart"], to_x):
		_teleport(route.alight_at(dir, to_x))
		fx.append({"type": "sound", "id": "chime"})
		mode = {"kind": "free"}
		game_event("bus:arrive:%s" % m["to"])


func _call_elevator(it: Dictionary) -> void:
	var front: Variant = cfg["world"]["elevator"]["fronts"].get(it["id"])
	var fp: Vector2 = Vector2(float(front[0]), float(front[1])) if front != null else player.pos
	# 근처에 있던 지인이 같이 탈 수도 있다
	var companion: Variant = null
	for n in active_npcs():
		var t: String = n.npc_type
		if (t == "acquaintance" or t == "boss") and n.state != "dialogue" and n.pos.distance_to(fp) < (10.0 if n.pursuing else 6.0) and (n.pursuing or rng() < 0.6):
			companion = n
			break
	mode = {"kind": "elevator", "phase": "waiting", "timer": 3.0 + rng() * 4.0, "from": it["id"], "to": it["target"], "companion": companion, "presses": 0}
	game_event("elevator:call")


func _update_elevator(dt: float, c: Dictionary, m: Dictionary) -> void:
	m["timer"] -= dt
	var companion: Variant = m["companion"]
	if m["phase"] == "waiting":
		if (c["move"] as Vector2).length() > 0.3 and companion == null:
			mode = {"kind": "free"}
			return
		if m["timer"] <= 0:
			fx.append({"type": "sound", "id": "elevatorDing"})
			var car: Array = cfg["world"]["elevator"]["car"]
			_teleport(Vector2(float(car[0]) - 0.8, float(car[1])))
			if companion != null:
				companion.pos = Vector2(float(car[0]) + 0.9, float(car[1]) - 0.4)
				companion.begin_dialogue()
				game_event("elevator:awkward")
				toast("elevator.joined")
			m["phase"] = "closing"
			m["timer"] = 2.5
		return
	if m["phase"] == "closing":
		# 닫힘 버튼 연타: 문이 빨리 닫힌다
		if c["interactPressed"]:
			m["presses"] += 1
			m["timer"] -= 0.35
		if m["timer"] <= 0:
			m["phase"] = "riding"
			m["timer"] = 7.0
		return
	if m["timer"] <= 0:
		var front: Array = cfg["world"]["elevator"]["fronts"][m["to"]]
		_teleport(Vector2(float(front[0]), float(front[1])))
		fx.append({"type": "sound", "id": "elevatorDing"})
		if companion != null:
			companion.pos = Vector2(float(front[0]) + 1.2, float(front[1]))
			companion.end_dialogue()
		mode = {"kind": "free"}


# ───────────────────────── 대화 배틀 ─────────────────────────

func start_dialogue(npc: Npc, from_behind: bool) -> void:
	if mode["kind"] == "dialogue" or mode["kind"] == "speech":
		return
	var p: Dictionary = npc.profile
	var base: Dictionary = cfg["dialoguePools"][p["dialogue"]]
	# 말하는 방식: 대사 빠르기 (팀장님은 길게, 옆집은 빠르게)
	var ts: Dictionary = p.get("talkStyle", {}) if p.get("talkStyle") != null else {}
	var speed := float(ts.get("lineSpeed", 1.0))
	var pool := base
	if speed != 1:
		pool = base.duplicate()
		pool["greeting"] = _scaled_line(base["greeting"], speed)
		pool["lines"] = base["lines"].map(func(l): return _scaled_line(l, speed))
		pool["flushRemark"] = _scaled_line(base["flushRemark"], speed)
	var ally: bool = p["type"] == "ally"
	if from_behind and not ally:
		var ec: Dictionary = cfg["skills"]["earphones"]
		var chance := float(ec["backApproachTapChance"]) * (float(ec["ambushChanceMultiplier"]) if player.earphones else 1.0)
		if rng() < chance:
			sim.bus.emit("shoulderTap", npc.id)
	if not ally:
		sim.bus.emit(p["encounterStimulus"], npc.id)
		sim.bus.set_continuous("dialogue", "dialogue", perk_mul("dialogueDrainScale"))
	phone_open = false
	npc.begin_dialogue()
	sim.life.record_accept(npc.id)
	var practice := not _practiced and not ally
	var rules: Dictionary = cfg["dialogueRules"]
	# 편한 사이일수록 틈이 넓고 금방 만족하고 짧게 끝난다 (서운한 사이는 반대). 관계에 쓴 에너지가 돌아온다
	var ease := 0.0 if ally else reputation.ease(reputation.person_of_npc(npc.id))
	var talk: Dictionary = cfg["reputation"]["talk"]
	var length := 1.0 - float(talk["duration"]) * ease
	var r2: Dictionary = rules.duplicate()
	r2["parryWindowSec"] = float(rules["parryWindowSec"]) * float(ts.get("parryWindowScale", 1.0)) * maxf(0.4, 1.0 + float(talk["parryWindow"]) * ease) + perk_add("parryBonusSec")
	r2["smileDropPerSec"] = float(rules["smileDropPerSec"]) * float(ts.get("smileDropScale", 1.0)) * perk_mul("smileDropScale")
	r2["satisfactionPerReply"] = float(rules["satisfactionPerReply"]) * float(ts.get("satisfyScale", 1.0)) * maxf(0.4, 1.0 + float(talk["satisfy"]) * ease)
	r2["gapSec"] = float(rules["gapSec"]) * float(ts.get("gapScale", 1.0))
	var battle := DialogueBattle.new(r2, pool, {
		"minDurationSec": 0.0 if practice else float(p["minDurationSec"]) * length,
		"baseDurationSec": maxf(float(p["baseDurationSec"]), 20.0) if practice else float(p["baseDurationSec"]) * length,
		"ally": ally,
		"rng": rng,
		"practice": practice,
	})
	mode = {"kind": "dialogue", "battle": battle, "npc": npc, "pool": p["dialogue"], "closer": null, "closerTime": 0.0, "myLine": null, "myLineTime": 0.0, "practice": practice, "smiling": false, "wrongAge": 99.0}


static func _scaled_line(l: Dictionary, speed: float) -> Dictionary:
	var o: Dictionary = l.duplicate()
	o["durationSec"] = float(l["durationSec"]) / speed
	return o


func _update_dialogue(dt: float, c: Dictionary, m: Dictionary) -> void:
	var b: DialogueBattle = m["battle"]
	var npc: Npc = m["npc"]
	m["myLineTime"] += dt
	m["wrongAge"] += dt
	m["smiling"] = c["smile"]
	if b.ended():
		m["closerTime"] += dt
		if m["closerTime"] > 1.8 or (m["closerTime"] > 0.4 and c["confirm"]):
			_finish_dialogue(m)
		return
	var reply: String = c["reply"]
	if reply != "":
		b.respond(reply)
		m["myLine"] = "dialogue.myLine.%s" % reply
		m["myLineTime"] = 0.0
	if c["sos"] and not sos_used and sim.life.get_stat("bond") >= float(cfg["balance"]["sos"]["bondMin"]) and npc.npc_type != "ally":
		sos_used = true
		b.request_sos()
	var flush_visible := not player.mask
	b.update(dt, {
		"smiling": c["smile"],
		"stutter": sim.somatic.active("stutter"),
		"flushRemarkable": flush_visible and sim.somatic.flush_remarkable(),
	})
	if npc.npc_type == "ally":
		sim.energy.recover(float(cfg["balance"]["recovery"]["allyNearPerSec"]) * dt)
	for e in b.drain_events():
		match e["type"]:
			"wrong":
				m["wrongAge"] = 0.0
				if m["practice"]:
					continue
				# 어색한 대답: 당황 + 얼굴이 달아오른다
				sim.energy.add_mood("panic", float(cfg["dialogueRules"]["wrongPanic"]))
				sim.somatic.trigger("flush", float(cfg["somatic"]["flush"]["slip"]), _flush_scale())
				game_event("dialogue:wrong")
			"flushRemark":
				sim.somatic.max_out("flush")
				sim.bus.emit("flushRemark", npc.id)
			"parry":
				sim.report["parried"] += 1
				if npc.npc_type == "hunter":
					sim.somatic.trigger("flush", float(cfg["somatic"]["flush"]["refusal"]), _flush_scale())
					sim.bus.emit("refusal")
			"end":
				m["closer"] = e["closer"]
				m["closerTime"] = 0.0
				if e["outcome"] == "sos":
					fx.append({"type": "sound", "id": "fakeCall"})
					game_event("dialogue:sos")


func _finish_dialogue(m: Dictionary) -> void:
	var b: DialogueBattle = m["battle"]
	var npc: Npc = m["npc"]
	sim.bus.set_continuous("dialogue", "dialogue", 0.0)
	if m["practice"]:
		_practiced = true
		toast("coach.done")
	# 대화가 어떻게 끝났는지가 그 사람의 인상으로 남는다
	var ending := "awkward" if b.outcome == "endured" and b.wrong_count > 0 else b.outcome
	if ending != "":
		reputation.change(reputation.person_of_npc(npc.id), float(cfg["reputation"]["dialogue"].get(ending, 0)))
	if npc.npc_type == "ally":
		sim.life.apply(cfg["life"]["rewards"]["allyMeet"], "allyMeet")
		game_event("met:%s" % npc.id)
	else:
		sim.report["smalltalkEndured"] += 1
		game_event("talked:%s" % npc.id)
		if b.wrong_count > 0:
			sim.bus.emit("rumination")
			game_event("rumination")
		if npc.npc_type == "boss" and b.outcome == "satisfied":
			sim.life.apply({"income": 4}, "bossTalk")
	npc.end_dialogue(float(npc.profile.get("graceAfterParrySec", -1.0)) if b.outcome == "parried" else -1.0)
	fx.append({"type": "sound", "id": "sigh"})
	mode = _resume_mode()


# ───────────────────────── 필수 발화 ─────────────────────────

func _start_speech(speech_id: String) -> void:
	var sp: Dictionary = cfg["speeches"][speech_id]
	var scale := float(cfg["balance"]["rehearsal"]["damageScale"]) if rehearsed else 1.0
	sim.bus.emit(sp["stimulus"], speech_id, scale)
	phone_open = false
	var chunks: Array = sp["chunksEn"] if cfg.get("lang") == "en" and sp.get("chunksEn") != null else sp["chunks"]
	mode = {"kind": "speech", "challenge": SpeechChallenge.new(cfg["dialogueRules"]["speech"], chunks), "speechId": speech_id, "time": 0.0}


func _update_speech(dt: float, c: Dictionary, m: Dictionary) -> void:
	m["time"] += dt
	var ch: SpeechChallenge = m["challenge"]
	if ch.done():
		if m["time"] > 1.4:
			_finish_speech(m)
		return
	if m["time"] < 1.5:
		return # 소개 문구 읽는 시간
	if c["spacePressed"]:
		ch.press()
	ch.update(dt, sim.somatic.active("stutter"))
	for e in ch.drain_events():
		if e["type"] == "chunk" and not e["clean"]:
			sim.bus.emit("speechSlip")
			sim.somatic.trigger("flush", float(cfg["somatic"]["flush"]["slip"]) * 0.6, _flush_scale())
		if e["type"] == "done":
			m["time"] = 0.0


func _finish_speech(m: Dictionary) -> void:
	var speech_id: String = m["speechId"]
	var sp: Dictionary = cfg["speeches"][speech_id]
	var ch: SpeechChallenge = m["challenge"]
	# 잘 끝나도 이불킥이 오는 발화가 있다 (발표)
	if ch.misses >= 2 or sp.get("rumination", false):
		sim.bus.emit("rumination")
		game_event("rumination")
	if speech_id == "checkoutNormal":
		_complete_checkout()
	else:
		# 엔딩 리포트의 '감수한 필수 상호작용'에는 그날 필수 목표였던 것만 센다
		for o in objectives.list:
			if o["def"].get("on", "") == sp["objectiveEvent"] and o["def"].get("mandatory", false):
				sim.report["mandatoryDone"].append(speech_id)
				break
		game_event(sp["objectiveEvent"])
	var grant: Variant = sp.get("grant")
	if grant != null and _pay(float(grant["price"])):
		var item: String = grant.get("item", "")
		if item != "":
			_add_item(item)
			toast("shop.bought", {"item": _text(_consumable(item)["nameKey"], item)})
		elif float(grant["price"]) > 0:
			toast("shop.paid", {"money": fmt_num(float(grant["price"]))})
	mode = _resume_mode()
	if sp.get("next", "") != "":
		_start_speech(sp["next"])
		return
	# 일반 계산대: 스몰토크 확률
	if speech_id == "checkoutNormal" and rng() < 0.5:
		for n in active_npcs():
			if n.profile_id == "cashier" and n.pos.distance_to(player.pos) < 4:
				start_dialogue(n, false)
				break


func _complete_checkout() -> void:
	var total := 0.0
	for item in player.inventory["items"]:
		for i in world.interactables:
			if i.get("item") == item:
				total += float(i.get("price", 0))
				break
	sim.life.add_money(-minf(total, sim.life.money))
	sim.life.apply(cfg["life"]["rewards"]["groceries"], "groceries")
	toast("checkout.done")
	game_event("done:checkout")
	if not (sim.report["mandatoryDone"] as Array).has("checkout"):
		sim.report["mandatoryDone"].append("checkout")


func _flush_scale() -> float:
	return float(cfg["balance"]["rehearsal"]["flushScale"]) if rehearsed else 1.0


# ───────────────────────── 업무·취미 ─────────────────────────

const _SENDER := {"boss": "boss", "team": "teamChat", "hr": "work.from.hr"}


func _update_work(dt: float, c: Dictionary, m: Dictionary) -> void:
	var g: WorkGame = m["game"]
	var rw: Dictionary = cfg["life"]["rewards"]
	if c["reply"] == "nod" or int(c["note"]) == 0:
		var ping: Variant = g.reply()
		if ping != null:
			sim.bus.emit("workReply")
			sim.life.apply(rw["workPing"][ping["from"]]["replied"], "workPingReplied", _SENDER[ping["from"]])
			reputation.on_event("workPing:replied:%s" % ping["from"])
	m["idle"] = 0.0 if c["smile"] else m["idle"] + dt
	g.update(dt, c["smile"])
	# 업무 스트레스: 일하는 동안 긴장이 쌓이고, 답 못 한 메신저(팀장은 더)가 짓누른다
	var wc: Dictionary = cfg["balance"]["work"]
	var pending := 0.0
	for pg in g.pings:
		pending += float(wc["bossPingMultiplier"]) if pg["from"] == "boss" else 1.0
	sim.energy.add_mood("stress", (float(wc["pressureStressPerSec"]) + pending * float(wc["pendingPingStressPerSec"])) * dt, true)
	for e in g.drain_events():
		match e["type"]:
			"ping":
				sim.bus.emit("workPing")
				fx.append({"type": "sound", "id": "vibrate"})
			"pingIgnored":
				var from: String = e["ping"]["from"]
				var cost: Dictionary = rw["workPing"][from]["ignored"]
				sim.life.apply(cost, "workPingIgnored", _SENDER[from])
				reputation.on_event("workPing:ignored:%s" % from)
				sim.bus.emit("workPingMissed")
				if float(cost.get("income", 0)) < 0:
					game_event("avoided:income")
			"task":
				sim.life.add_money(float(rw["workPerTask"]))
			"done":
				sim.life.apply(rw["workDone"], "workDone")
				clock.skip_to(DayCycle.parse_time(day["work"]["endTime"]))
				sim.energy.recover(float(cfg["balance"]["recovery"]["workAfternoon"]))
				# 오후 업무를 마친 피로: 긴장을 안고 퇴근한다
				sim.energy.add_mood("stress", float(wc["afternoonStress"]))
				toast("work.done")
				mode = {"kind": "free"}
				game_event("done:work")
				return
	if c["interactPressed"] or c["cancel"]:
		mode = {"kind": "free"}


func _finish_piano() -> void:
	var n := sim.bus.clear_ruminations()
	sim.energy.calm(float(cfg["balance"]["recovery"]["hobbyStressRelief"]))
	hobby_done = true
	sim.report["hobbies"].append("piano")
	toast("piano.done")
	if n > 0:
		fx.append({"type": "sound", "id": "chime"})
	mode = {"kind": "free"}


# ───────────────────────── 회식 ─────────────────────────

func _take_seat(seat: String) -> void:
	var dinner: Variant = day.get("dinner")
	if dinner == null or not _objective_available("seated"):
		toast("interact.bed.notYet")
		return
	_dinner_seat_timer = -1.0
	for i in world.interactables:
		if i["kind"] == "seat" and i.get("seat") == seat:
			_teleport(Vector2(float(i["at"][0]), float(i["at"][1])))
			break
	game_event("seated")
	game_event("dinner:grill")
	var a := float(dinner["laughEverySec"][0])
	var b := float(dinner["laughEverySec"][1])
	mode = {
		"kind": "seated",
		"seat": seat,
		"grill": GrillGame.new(float(dinner["grillCookSec"]), float(dinner["grillBurnSec"]), rng),
		"time": 0.0,
		"toastDone": false,
		"distractedFor": 0.0,
		"laughIn": a + rng() * (b - a),
		"bossCheckIn": 20.0,
	}


func _update_seated(dt: float, c: Dictionary, m: Dictionary) -> void:
	var dinner: Dictionary = day["dinner"]
	m["time"] += dt
	var t: float = m["time"]
	# 플레이어는 상석 쪽을 바라본다
	var boss: Variant = null
	for n in npcs:
		if n.id == "restBoss":
			boss = n
			break
	if boss != null:
		player.facing = Perception.angle_to(player.pos, boss.pos)
	_update_qte(dt, c)

	if int(c["slot"]) >= 0:
		m["grill"].flip(int(c["slot"]))
	var grill: GrillGame = m["grill"]
	grill.update(dt)
	for e in grill.drain_events():
		if e["type"] == "burnt":
			sim.bus.emit("burntMeat")
			sim.somatic.trigger("flush", 0.2, _flush_scale())
			fx.append({"type": "sound", "id": "sizzle"})
		elif e["type"] == "served":
			fx.append({"type": "sound", "id": "sizzle"})

	var toast_after := float(dinner["toastAfterSec"])
	if not m["toastDone"] and t >= toast_after - 6 and t - dt < toast_after - 6:
		toast("dinner.toastSoon")
		game_event("dinner:toastSoon")
	if not m["toastDone"] and t >= toast_after and _objective_available("done:toast"):
		_start_speech("toast")
		return
	# 단체 웃음 QTE
	m["laughIn"] -= dt
	if m["laughIn"] <= 0 and qte == null:
		var a := float(dinner["laughEverySec"][0])
		var b := float(dinner["laughEverySec"][1])
		m["laughIn"] = a + rng() * (b - a)
		qte = {"kind": "laugh", "timer": 0.0, "window": float(dinner["laughWindowSec"])}
		fx.append({"type": "sound", "id": "laugh"})
	# 건배사 후: 2차 얘기로 시선이 흩어지는 틈
	if m["toastDone"]:
		if m["distractedFor"] <= 0 and t > toast_after + 12 and t - dt <= toast_after + 12:
			m["distractedFor"] = 15.0
			toast("dinner.secondRound")
			game_event("dinner:secondRoundTalk")
		m["distractedFor"] = maxf(0.0, m["distractedFor"] - dt)
	# 상사의 관심 (자리 효과)
	m["bossCheckIn"] -= dt
	var eff: Dictionary = dinner["seatEffects"].get(m["seat"], {"gazeExtra": 0.0, "bossAttention": 0.5})
	if m["bossCheckIn"] <= 0 and boss != null and m["distractedFor"] <= 0:
		m["bossCheckIn"] = 22.0
		if rng() < float(eff["bossAttention"]) * 0.6:
			start_dialogue(boss, false)
			return
	# 일어나기: 시선이 흩어진 틈이면 조용히, 아니면 붙잡힌다
	if c["interactPressed"] and m["toastDone"]:
		mode = {"kind": "free"}
		if m["distractedFor"] <= 0 and boss != null and rng() < 0.7:
			start_dialogue(boss, false)


## 대화·발화가 끝난 뒤 돌아갈 모드 (회식 자리면 다시 자리로)
func _resume_mode() -> Dictionary:
	var d: Variant = day.get("dinner")
	if d != null and objectives.is_done("dinner") and not objectives.is_done("escape"):
		var a: Variant = world.map.area_at(player.pos.x, player.pos.y)
		var seat: Variant = null
		for i in world.interactables:
			if i["kind"] == "seat" and Vector2(float(i["at"][0]), float(i["at"][1])).distance_to(player.pos) < 0.6:
				seat = i
				break
		if a != null and a["id"] == d["area"] and seat != null:
			var toast_done := objectives.is_done("toast")
			return {
				"kind": "seated",
				"seat": seat.get("seat", "middle"),
				"grill": GrillGame.new(float(d["grillCookSec"]), float(d["grillBurnSec"]), rng),
				"time": float(d["toastAfterSec"]) + 1 if toast_done else float(d["toastAfterSec"]) * 0.6,
				"toastDone": toast_done,
				"distractedFor": 0.0,
				"laughIn": float(d["laughEverySec"][0]),
				"bossCheckIn": 25.0,
			}
	return {"kind": "free"}


# ───────────────────────── QTE ─────────────────────────

func _update_qte(dt: float, c: Dictionary) -> void:
	var q: Variant = qte
	if q == null:
		return
	q["timer"] += dt
	var resolved := false
	if q["kind"] == "laugh":
		if c["spacePressed"]:
			resolved = true
		elif q["timer"] >= q["window"]:
			sim.bus.emit("groupLaughMiss")
			sim.somatic.trigger("flush", 0.25, _flush_scale())
			resolved = true
	elif q["kind"] == "knock":
		if c["spacePressed"]:
			resolved = true
		elif q["timer"] >= q["window"]:
			# 대답이 없으면 점원이 커튼 너머로 말을 건다
			var clerk: Variant = null
			for n in active_npcs():
				if n.npc_type == "stalker":
					clerk = n
					break
			player.locked_safe = null
			if clerk != null:
				start_dialogue(clerk, false)
			resolved = true
	if resolved:
		qte = null


# ───────────────────────── 폰 ─────────────────────────

func _update_phone(dt: float, c: Dictionary) -> void:
	# 예약된 전화·문자
	var plist: Array = day["phone"]
	for i in plist.size():
		var ev: Dictionary = plist[i]
		if _fired_phone.has(i) or ev.get("at", "") == "":
			continue
		if clock.minutes >= DayCycle.parse_time(ev["at"]):
			_fired_phone[i] = true
			_deliver_phone_event(ev)
	if _mandatory_retry != null:
		_mandatory_retry["timer"] -= dt
		if _mandatory_retry["timer"] <= 0 and not phone.ringing():
			var r: Dictionary = _mandatory_retry
			_mandatory_retry = null
			_deliver_phone("call", r["contact"], r["textKey"])
	phone.update(dt)

	# 전화 받기/거절 — 볼 감싸는 중이면 손을 쓸 수 없다
	var call: Variant = phone.call
	var can_use: bool = not player.cover and mode["kind"] != "speech"
	if call != null and can_use:
		var mandatory := _is_mandatory_call(call["contactId"])
		var slipped: bool = (c["decline"] or c["textInstead"]) and sim.somatic.slips(rng())
		if slipped:
			toast("slip.phone")
			phone.answer()
		elif c["accept"]:
			phone.answer()
		elif c["decline"] and not mandatory:
			phone.decline()
		elif c["textInstead"] and not mandatory:
			phone.text_instead()
	sim.bus.set_continuous("phone", "phoneRinging", 1.0 if phone.ringing() else 0.0)
	sim.bus.set_continuous("replyAnxiety", "replyAnxiety", 1.0 if phone.waiting_reply() else 0.0)

	# 폰 화면 조작
	if phone_open and can_use:
		var msgs: Array = phone.messages.filter(func(x): return not x["resolved"])
		if int(c["menuNav"]) != 0 and msgs.size() > 0:
			phone_cursor = (phone_cursor + int(c["menuNav"]) + msgs.size()) % msgs.size()
		var sel: Variant = msgs[mini(phone_cursor, msgs.size() - 1)] if msgs.size() > 0 else null
		if sel != null:
			sel["read"] = true
		if sel != null and c["phoneReply"]:
			if sim.somatic.slips(rng()):
				toast("slip")
			else:
				sim.bus.emit("textMessage")
				phone.reply(sel["id"])
		elif sel != null and c["phoneIgnore"]:
			phone.read_ignore(sel["id"])

	for e in phone.drain_events():
		match e["type"]:
			"ring":
				sim.bus.emit("phoneRingStartle")
				game_event("phone:ring")
				if sim.somatic.active("sweat"):
					fx.append({"type": "rumble"})
			"message":
				# 알림을 꺼 둔 단톡방은 조용히 쌓인다
				var ct: Variant = cfg["life"]["contacts"].get(e["message"]["contactId"])
				if ct != null and ct.get("muted", false):
					continue
				sim.bus.emit("textMessage")
				if loud_unread() >= 3:
					game_event("phone:unread3")
			"callResolved":
				_resolve_contact(e["call"]["contactId"], e["how"], e["call"]["textKey"])
			"messageResolved":
				_resolve_contact(e["message"]["contactId"], e["how"], e["message"]["textKey"])
			"replyReceived":
				var ct2: Variant = cfg["life"]["contacts"].get(e["contactId"])
				toast("phone.replyReceived", {"name": _text(ct2["nameKey"] if ct2 != null else "", e["contactId"])})


## 알림이 울리는(꺼 두지 않은) 안 읽은 메시지 수
func loud_unread() -> int:
	var n := 0
	for m in phone.unread():
		var ct: Variant = cfg["life"]["contacts"].get(m["contactId"])
		if not (ct != null and ct.get("muted", false)):
			n += 1
	return n


## 피할 수 없는 전화 (그 전화를 받는 것이 필수 목표)
func _is_mandatory_call(contact_id: String) -> bool:
	var ev := "answered:%s" % contact_id
	for o in objectives.list:
		if o["def"].get("on", "") == ev and o["def"].get("mandatory", false) and not o["done"]:
			return true
	return false


func _deliver_phone_event(ev: Dictionary) -> void:
	if ev.get("chance") != null and rng() >= float(ev["chance"]):
		return
	_deliver_phone(ev["kind"], ev["contact"], ev["textKey"])
	if ev.get("effect") == "plansCancelled":
		# 상대가 먼저 약속을 취소: 미안하지만, 솔직히 조금 기쁘다
		sim.energy.recover(float(cfg["balance"]["recovery"]["plansCancelled"]))
		for o in objectives.list:
			if o["def"].get("optional", false) and String(o["def"].get("on", "")).begins_with("met:"):
				o["done"] = true
		toast("plansCancelled")
		game_event("plansCancelled")


func _deliver_phone(kind: String, contact: String, text_key: String) -> void:
	if kind == "call":
		phone.receive_call(contact, text_key)
	else:
		phone.receive_message(contact, text_key)


func _resolve_contact(contact_id: String, how: String, text_key: String) -> void:
	var contact: Variant = cfg["life"]["contacts"].get(contact_id)
	if contact == null or contact.get("muted", false):
		return
	reputation.change(reputation.person_of_contact(contact_id), float(cfg["reputation"]["phone"][how]))
	var report: Dictionary = sim.report
	if how == "answered":
		report["callsAnswered"] += 1
	if how == "declined" or how == "missed":
		report["callsAvoided"] += 1
	if how == "replied":
		report["messagesReplied"] += 1
	if how == "readIgnored" or how == "unread":
		report["messagesIgnored"] += 1

	# 피할 수 없는 전화: 놓치면 다시 온다
	if (how == "missed" or how == "declined") and _is_mandatory_call(contact_id):
		_mandatory_retry = {"contact": contact_id, "textKey": text_key, "timer": 20.0}
	var out := Phone.apply_contact_outcome(contact_id, contact, how, sim.life)
	if out["stimulus"] != "":
		sim.bus.emit(out["stimulus"], contact_id)
	if out["avoided"]:
		# 회피의 대가를 그 자리에서 느끼게: 어떤 생활이 흔들리는지 독백으로
		var delta: Dictionary = contact["readIgnored"] if how == "readIgnored" else (contact["unread"] if how == "unread" else contact["avoid"])
		var worst_k: Variant = null
		var worst_v := INF
		for k in delta:
			if float(delta[k]) < worst_v:
				worst_v = float(delta[k])
				worst_k = k
		if worst_k != null and worst_v < 0:
			game_event("avoided:%s" % worst_k)
		var after := int(cfg["life"]["stats"]["escalateAfter"])
		if contact.get("escalation", "") != "" and sim.life.avoid_count(contact_id) % after == after - 1:
			game_event("avoided:almost")
	if how == "answered" and contact.get("ally", false):
		sim.energy.recover(8.0)
	if how == "replied":
		game_event("replied:%s" % contact_id)
		_accept_favor(text_key)
	if how == "answered":
		game_event("answered:%s" % contact_id)
		var key := "call:%s" % contact_id
		if _is_mandatory_like(contact_id) and not (report["mandatoryDone"] as Array).has(key):
			report["mandatoryDone"].append(key)
	if contact_id == "boss" and (how == "readIgnored" or how == "unread"):
		_ignored_boss_messages += 1
	if out["escalation"] != "":
		_escalate(out["escalation"])
	elif contact_id == "boss" and _ignored_boss_messages >= int(cfg["balance"]["boss"]["visitAfterIgnoredMessages"]):
		_ignored_boss_messages = 0
		_escalate("bossVisit")


func _is_mandatory_like(contact_id: String) -> bool:
	for p in day["phone"]:
		if p["contact"] == contact_id and p.get("mandatory", false):
			return true
	return false


## 회피 에스컬레이션: 같은 대상 3회 회피 → 상위 자극
func _escalate(id: String) -> void:
	if id == "doorbell" and not at_home():
		_pending_escalations.append(id)
		return
	sim.bus.emit(id)
	game_event("escalation:%s" % id)
	toast("escalation.%s" % id)
	if id == "doorbell":
		sanctuary_broken = 10.0
		fx.append({"type": "sound", "id": "doorbell"})
	if id == "bossVisit":
		for n in active_npcs():
			if n.profile_id == "boss":
				if area != null and area["id"] == "officeFloor":
					n.notice = 1.0
				break


# ───────────────────────── 월드 진행 ─────────────────────────

func _update_world(dt: float) -> void:
	var p := player
	var prev_area: Variant = area
	area = world.map.area_at(p.pos.x, p.pos.y)
	if area != null and not _same_area(area, prev_area):
		# 건물에 들어서면 자전거는 문 앞에 세운다
		if p.biking and area["kind"] != "outdoor":
			_park_bike("bike.parkedDoor")
		game_event("enter:%s" % area["id"])
		# 밖으로 나갔을 때만 '빠져나감' (건물 안 화장실로 가는 건 제외)
		if prev_area != null and area["kind"] == "outdoor":
			game_event("exit:%s" % prev_area["id"])
		if area["kind"] == "home" and _pending_escalations.size() > 0:
			_escalate(_pending_escalations.pop_front())
	var now_home: bool = area != null and area["kind"] == "home"
	var was_home: bool = prev_area != null and prev_area["kind"] == "home"
	if not now_home and home_locked and was_home:
		home_locked = false
	# 비 오는 날 현관을 나서면 집 우산을 챙긴다
	if raining() and was_home and not now_home and not (p.inventory["gear"] as Array).has("umbrella"):
		p.inventory["gear"].append("umbrella")
		toast("umbrella.fromHome")
	p.hidden = world.in_hide(p.pos)

	# 회식 자리 고르기 카운트다운
	var dinner: Variant = day.get("dinner")
	if dinner != null and area != null and area["id"] == dinner["area"] and _objective_available("seated"):
		if _dinner_seat_timer < 0:
			_dinner_seat_timer = float(dinner["seatChoiceSec"])
			game_event("dinner:seatChoice")
		if mode["kind"] == "free":
			_dinner_seat_timer -= dt
			if _dinner_seat_timer <= 0:
				_take_seat("head")

	# NPC
	var percept := player_percept()
	# 버스를 기다리거나 지하철 역을 고르는 중엔 붙잡힐 수 있다 (말을 걸면 기다림을 그만둔다)
	var interruptible: bool = (mode["kind"] == "bus" and mode["phase"] == "waiting") or mode["kind"] == "metroMenu"
	var talk_blocked: bool = is_modal() and mode["kind"] != "seated" and not interruptible
	var seated_focus: bool = mode["kind"] == "seated"
	var far := float(cfg["balance"]["npcUpdateRange"])
	var area_id: Variant = area["id"] if area != null else null
	var map := world.map
	for npc in npcs:
		if not npc_active(npc):
			continue
		# 멀리 있는 사람은 잠시 멈춰 둔다 (넓은 도시의 성능). 쫓아오거나 대화 중이면 계속
		if not npc.pursuing and npc.state != "dialogue" and absf(npc.pos.x - p.pos.x) + absf(npc.pos.y - p.pos.y) > far:
			continue
		var was_pursuing: bool = npc.pursuing
		npc.update(dt, {
			"map": map,
			"player": percept,
			"playerAreaId": area_id,
			"talkBlocked": talk_blocked or (seated_focus and npc.npc_type != "boss"),
			"rng": rng,
		})
		var warm_nodded := false
		for e in npc.drain_events():
			if e["type"] != "talk":
				continue
			if _warm_nod(e["npc"]):
				warm_nodded = true
				continue
			if interruptible:
				mode = {"kind": "free"}
			if mode["kind"] == "free":
				start_dialogue(e["npc"], e["fromBehind"])
			else:
				e["npc"].end_dialogue(5.0)
		# 다가오던 사람이 말을 걸지 못하고 돌아섬 = 피한 스몰토크
		if was_pursuing and npc.state == "giveUp" and not warm_nodded:
			sim.report["smalltalkAvoided"] += 1
			reputation.change(reputation.person_of_npc(npc.id), float(cfg["reputation"]["dialogue"]["avoided"]))

	# 군중
	var rush := _is_rush()
	crowd.set_density(float(cfg["balance"]["clock"]["rushCrowdMultiplier"]) if rush else 1.0)
	crowd.update(dt, p.pos, float(cfg["player"]["radius"]))
	if mode["kind"] == "free" and p.locked_safe == null:
		_crowd_interactions()


static func _same_area(a: Variant, b: Variant) -> bool:
	if a == null or b == null:
		return a == null and b == null
	return is_same(a, b)


func _crowd_interactions() -> void:
	var p := player
	var b: Dictionary = cfg["balance"]
	# 개인 공간 침범
	if _personal_space_cd <= 0 and crowd.touching(p.pos, float(b["personalSpace"]["radius"]) * 0.7) != null:
		_personal_space_cd = float(b["personalSpace"]["cooldownSec"])
		sim.bus.emit("personalSpace")
		p.frozen = maxf(p.frozen, float(b["personalSpace"]["freezeSec"]))


## NPC 지각에 넘기는 플레이어 (Perception PlayerPercept)
func player_percept() -> Dictionary:
	var p := player
	var m: String = mode["kind"]
	return {
		"pos": p.pos,
		"facing": p.facing,
		"moving": p.moving,
		"noise": float(cfg["player"]["runNoiseMultiplier"]) if p.running else 1.0,
		"phonePretend": p.phone_pretend or phone_open,
		"eyesClosed": p.eyes_closed,
		"hidden": p.hidden,
		"unreachable": p.locked_safe != null or sanctuary() or at_home() or m == "travel" or m == "elevator" or m == "work" or m == "speech" or m == "metro" or (m == "bus" and mode["phase"] == "riding") or p.biking,
	}


## 눈인사만 하는 사람과 눈이 마주치면: 서로 고개만 끄덕이고, 마음이 조금 가라앉는다 (하루 한 번)
func _update_nods(active: Array) -> void:
	var nod: Dictionary = cfg["balance"]["nod"]
	for n in active:
		if not n.profile.get("nodOnly", false) or _nodded.has(n.id) or not n.percept["eyeContact"] or n.percept["dist"] > float(nod["range"]):
			continue
		_nodded[n.id] = true
		sim.energy.calm(float(nod["calm"]))
		game_event("nod:%s" % n.id)


## 편한 사이는 가끔 말 대신 눈인사만 하고 지나간다 (사람마다 하루 한 번). 마음이 조금 가라앉는다
func _warm_nod(npc: Npc) -> bool:
	if npc.npc_type == "ally" or npc.npc_type == "boss" or _nodded.has(npc.id):
		return false
	var person := reputation.person_of_npc(npc.id)
	var talk: Dictionary = cfg["reputation"]["talk"]
	if not reputation.can_nod_instead(person) or rng() >= float(talk["nodChance"]):
		return false
	_nodded[npc.id] = true
	npc.end_dialogue(float(npc.profile["cooldownSec"]) * 3)
	sim.energy.calm(float(talk["nodCalm"]))
	toast("toast.warmNod", {"name": _text(cfg["reputation"]["people"][person]["nameKey"], person)})
	game_event("warmNod")
	return true


## 근무 시간(출근한 뒤 업무를 마치기 전)에 사무실 밖에 있거나 화장실 칸에 숨어 있으면 시간이 쌓이고,
## balance.deskAway.everyMin마다 팀장님이 찾는다 (업무 평판). 쉴 곳은 있어도 시간에는 값이 있다
func _update_desk_away(dt: float, minutes_per_sec: float) -> void:
	var d: Dictionary = cfg["balance"]["deskAway"]
	var working := day.get("work") != null and not on_leave and objectives.is_done("commute") and not objectives.resolved("work")
	var away: bool = working and mode["kind"] == "free" and (player.locked_safe != null or not (d["areas"] as Array).has(area["id"] if area != null else ""))
	if not away:
		_desk_away_min = 0.0
		return
	_desk_away_min += dt * minutes_per_sec
	if _desk_away_min < float(d["everyMin"]):
		return
	_desk_away_min = 0.0
	toast("toast.deskAway")
	sim.life.apply(cfg["life"]["rewards"]["deskAway"], "deskAway")
	game_event("deskAway")


## 지금 나를 보고 있는 시선 수
func gaze_count() -> int:
	return _gaze_count(active_npcs())


func _gaze_count(active: Array) -> int:
	var n := 0
	var gaze_range := float(cfg["balance"]["gaze"]["range"])
	for npc in active:
		if npc.gazing and npc.percept["dist"] <= gaze_range and npc.npc_type != "pet" and npc.npc_type != "ally" and not npc.profile.get("nodOnly", false):
			n += 1
	if mode["kind"] == "seated":
		var dinner: Variant = day.get("dinner")
		if dinner != null:
			n += int(dinner["seatEffects"].get(mode["seat"], {}).get("gazeExtra", 0))
	if mode["kind"] == "speech":
		var sp: Variant = cfg["speeches"].get(mode["speechId"])
		if sp != null:
			n += int(sp.get("audience", 0))
	return n


# ───────────────────────── 시뮬레이션 ─────────────────────────

func _update_sim(dt: float) -> void:
	var p := player
	var bus := sim.bus
	var b: Dictionary = cfg["balance"]
	var area_stim: Variant = null
	if area != null:
		for a in _arr(day, "areaStimuli"):
			if a["area"] == area["id"]:
				area_stim = a
				break
		if area_stim == null:
			area_stim = area.get("stimulus")
	# 환경 자극 구역 (ZONE)
	bus.clear_continuous("zone:")
	if area_stim != null and p.locked_safe == null:
		bus.set_continuous("zone:%s" % area["id"], area_stim["id"], float(area_stim["intensity"]))
	# 군중 밀도
	var cd: Dictionary = b["crowdDensity"]
	var near := crowd.count_near(p.pos, float(cd["radius"]))
	var crowd_d := minf(float(cd["max"]), near * float(cd["perAgent"]))
	var ss: Dictionary = b["slipstream"]
	if crowd.slipstream(p.pos, p.move_dir, float(ss["behindDist"]), float(ss["lateral"])):
		crowd_d *= float(ss["crowdScale"])
	# 자전거로 사람들 사이를 지나가면 더 조마조마하다
	if p.biking:
		crowd_d *= float(b["bike"]["crowdScale"])
	crowd_d *= perk_mul("crowdScale") * (float(week_condition.get("crowdScale", 1.0)) if week_condition != null else 1.0)
	# 지하철 안: 러시아워엔 더 빽빽하다
	if mode["kind"] == "metro":
		crowd_d = float(b["metro"]["crowdRush"]) if _is_rush() else float(b["metro"]["crowd"])
	# 버스 안: 러시아워엔 빽빽하다
	if mode["kind"] == "bus" and mode["phase"] == "riding":
		crowd_d = float(b["bus"]["crowdRush"]) if _is_rush() else float(b["bus"]["crowd"])
	bus.set_continuous("crowd", "crowd", 0.0 if p.locked_safe != null else crowd_d)
	# 사람이 많을수록 긴장이 오른다. 빽빽하면 그동안 가라앉지 않는다
	if crowd_d > 0 and p.locked_safe == null:
		sim.energy.add_mood("tension", crowd_d * float(cd["stressPerSec"]) * dt, crowd_d >= float(cd["sustainFrom"]))
	crowd_level = 0.0 if p.locked_safe != null else crowd_d
	# 비: 우산 없이 바깥에 있으면 축축하고 불편하다
	# 자전거를 타면 우산을 쓸 수 없다
	var soaked: bool = raining() and area != null and area["kind"] == "outdoor" and (not (p.inventory["gear"] as Array).has("umbrella") or p.biking)
	bus.set_continuous("weather", "rainSoaked", 1.0 if soaked else 0.0)
	if soaked and not _soaked_today:
		_soaked_today = true
		game_event("rain:soaked")
	# 아이컨택
	var active := active_npcs()
	var eye := 0
	for n in active:
		if n.percept["eyeContact"] and n.npc_type != "ally" and n.npc_type != "pet" and not n.profile.get("nodOnly", false):
			eye += 1
	_update_nods(active)
	bus.set_continuous("eye", "eyeContact", float(eye))

	# 어색한 침묵: 좁은 공간 + 지인
	var awkward_pair: bool = (mode["kind"] == "elevator" and mode["phase"] != "waiting" and mode["companion"] != null) or (mode["kind"] == "bus" and mode["phase"] == "riding" and mode["awkward"])

	# 이어폰은 청각만, 스트레스 내성(아이템)은 모든 자극을 줄인다
	var rs := (float(buffs["resist"]["scale"]) if buffs["resist"]["left"] > 0 else 1.0) * float(difficulty["stimulusScale"])
	var ear := float(cfg["skills"]["earphones"]["auditoryMultiplier"]) * perk_mul("earphoneScale") if p.earphones else 1.0
	var modifiers: Dictionary = EnergyModel.NO_MODIFIERS if rs == 1 and ear == 1 else {"auditory": ear * rs, "visual": rs, "social": rs}
	var ally := false
	var ally_range := float(b["recovery"]["allyRange"])
	for n in active:
		if n.npc_type == "ally" and n.pos.distance_to(p.pos) < ally_range:
			ally = true
			break
	var extra := 0.0
	var sanct := sanctuary()
	if sanct:
		extra += float(b["recovery"]["homeLockedPerSec"])
	if ally:
		extra += float(b["recovery"]["allyNearPerSec"])
	var ls: Variant = p.locked_safe
	sim.step(dt, {
		"outdoor": area != null and area["kind"] == "outdoor",
		# 칸에서 쉬어지는 건 노크(누가 기다린다) 전까지, 방금 쉰 칸이 아닐 때만
		"inSafe": ls != null and _safe_rests and p.safe_time < float(ls["noiseAfterSec"]),
		"extraRecoverPerSec": extra,
		"modifiers": modifiers,
		"gazeCount": _gaze_count(active),
		"coveringCheeks": p.cover,
		"eyesClosed": p.eyes_closed,
		"flushRiseScale": _flush_scale(),
		"sanctuary": sanct,
		"awkwardPair": awkward_pair,
	})
	# 모자·마스크: 홍조는 가려지지만 답답하다
	# 마스크: 답답해서 긴장이 가라앉지 않고 조금씩 오른다
	if p.mask:
		sim.energy.add_mood("stress", float(cfg["skills"]["mask"]["stuffyStressPerSec"]) * dt, true)

	for e in sim.drain_events():
		match e["type"]:
			"ambush":
				p.frozen = maxf(p.frozen, float(b["ambush"]["freezeSec"]) * (0.7 if calm_buff else 1.0))
				fx.append({"type": "ambush", "stimulusId": e["stimulusId"]})
			"tierChanged":
				var to: String = e["to"]
				if (to == "tired" or to == "danger" or to == "critical") and to != _last_tier:
					game_event("tier:%s" % to)
					# 게임이 끝나는 기준은 긴장이 아니라 기운: 위험해지면 분명히 알린다
					if to == "danger" or to == "critical":
						toast("energy.%s" % to)
				_last_tier = to
			"burnout":
				mode = {"kind": "burnout", "time": 0.0}
				phone_open = false
			"lifeCollapse":
				mode = {"kind": "collapse", "stat": e["stat"], "time": 0.0}
			"onset":
				game_event("onset:%s" % e["symptom"])
				if e["symptom"] == "sweat":
					fx.append({"type": "rumble"})

	# 목표 마감
	objectives.check_deadlines(clock.minutes)
	for e in objectives.drain_events():
		var o: Dictionary = e["objective"]
		var d: Dictionary = o["def"]
		if e["type"] == "completed" and String(d["id"]).begins_with("favor_"):
			_complete_favor(d["id"])
			continue
		if e["type"] == "missed":
			var delta: Variant = d.get("missed")
			if delta == null and d.get("mandatory", false):
				delta = cfg["life"]["rewards"]["mandatorySkipped"]
			if delta != null:
				sim.life.apply(delta, "missed", d["textKey"])
			toast("obj.missed", {"obj": _text(d["textKey"], d["id"])})
			game_event("missed:%s" % d["id"])
			continue
		if e["type"] == "late":
			if d.get("late") != null:
				sim.life.apply(d["late"], "late", d["textKey"])
			var ls2: String = d.get("lateStimulus", "")
			if ls2 != "":
				sim.bus.emit(ls2)
				toast(ls2)
				# 2차에 끌려감: 시간이 흐르고 강제로 목표 처리
				if ls2 == "secondRound":
					clock.skip_to(clock.minutes + 90)
					objectives.fire(d["on"])
					mode = {"kind": "free"}
			else:
				toast("late")
			game_event("late:%s" % d["id"])


func _update_monologue(dt: float) -> void:
	var list := []
	var map := world.map
	var pp := player.pos
	for n in active_npcs():
		var dist: float = n.percept["dist"]
		# 성능: '보이는' 조건은 distMax 안에서만 쓰이니, 그보다 먼 사람의 시선 검사는 건너뛴다 (결과는 같다)
		list.append({
			"profileId": n.profile_id,
			"type": n.npc_type,
			"dist": dist,
			"visible": n.percept["inView"] or (dist <= _mono_los_range and map.line_of_sight(pp, n.pos)),
			"noticed": n.notice > 0.4,
		})
	monologue.update(dt, {"areaId": area["id"] if area != null else null, "returning": returning(), "npcs": list})


## 게임 이벤트: 목표·독백·이벤트 전화로 퍼진다
func game_event(event: String) -> void:
	if _tracked_events().has(event):
		_week_events[event] = float(_week_events.get(event, 0)) + 1
	var marks: Array = cfg["story"]["marks"]
	for m in Story.marks_for(cfg["story"], event, day["id"]):
		var i := -1
		for j in marks.size():
			if is_same(marks[j], m):
				i = j
				break
		if m.get("oncePerDay", false) and _marks_today.has(i):
			continue
		_marks_today[i] = true
		Story.apply_mark(story, m)
		if m.get("give", "") != "" and _add_item(m["give"]):
			var cdef: Variant = _consumable(m["give"])
			toast(m.get("toastKey", "shop.taken"), {"item": _text(cdef["nameKey"] if cdef != null else "", m["give"])})
	objectives.fire(event)
	reputation.on_event(event)
	monologue.on_event(event)
	var plist: Array = day["phone"]
	for i in plist.size():
		var ev: Dictionary = plist[i]
		if ev.get("on", "") == event and not _fired_phone.has(i):
			_fired_phone[i] = true
			_deliver_phone_event(ev)


func toast(key: String, vars: Dictionary = {}) -> void:
	fx.append({"type": "toast", "key": key, "vars": vars})


func drain_fx() -> Array:
	var out := fx
	fx = []
	return out


# ───────────────────────── 하루 끝 ─────────────────────────

func end_day() -> void:
	var life := sim.life
	phone.end_day()
	for e in phone.drain_events():
		if e["type"] == "messageResolved":
			_resolve_contact(e["message"]["contactId"], e["how"], e["message"]["textKey"])
	for o in objectives.skipped_optional():
		if o["def"].get("skip") != null:
			life.apply(o["def"]["skip"], "skipped", o["def"]["textKey"])
	# 휴가: 생활비·하루 소모·월세 같은 정산은 잠시 잊는다
	var settlement: Array = [] if vacation else DayCycle.settle_day(cfg["life"]["settlement"], life, day.get("flags", {}))
	var night := DayCycle.night_recovery(cfg["life"]["night"], {
		"stressAtBed": sim.energy.psyche_load,
		"ruminations": sim.bus.active_ruminations(),
		"hobbyDone": hobby_done,
		"bedMinutes": clock.minutes,
		"housing": life.get_stat("housing"),
		"essentials": life.get_stat("essentials"),
		"daysLived": null if vacation else day_index + 1,
	})
	var report: Dictionary = sim.report
	reports = reports.slice(0, day_index)
	reports.append(report)
	if not vacation:
		_check_achievements(false)
	# 깊은 잠: 다음 날 기운 상한 조금 더
	night["nextMax"] = minf(float(cfg["balance"]["battery"]["max"]), float(night["nextMax"]) + perk_add("nightMaxBonus"))
	_next_max = night["nextMax"]
	var collapsed := life.collapsed()
	if collapsed != "":
		mode = {"kind": "collapse", "stat": collapsed, "time": 0.0}
		return
	mode = {"kind": "night", "breakdown": night["breakdown"], "settlement": settlement, "nextMax": night["nextMax"], "report": report, "lifeEnd": life.all().duplicate(), "moneyEnd": life.money, "perkChoices": _perk_choices(), "perkChosen": null}


func _advance_day() -> void:
	if vacation:
		vacation_day_count += 1
		start_day(0)
		return
	if day_index + 1 >= cfg["days"].size():
		_check_achievements(true)
		mode = {"kind": "final", "reports": reports}
		return
	start_day(day_index + 1)


## 디버그: 자극 발생
func debug_emit(stimulus_id: String) -> void:
	sim.bus.emit(stimulus_id)


## NPC가 플레이어를 쳐다보는지 (시선 연출)
func npc_looks_at_player(n: Npc) -> bool:
	return n.gazing and Perception.angle_diff(n.facing, Perception.angle_to(n.pos, player.pos)) < 0.6


func profile_of(n: Npc) -> Dictionary:
	return n.profile


# ───────────────────────── 도우미 ─────────────────────────

## 텍스트 표 (없으면 fallback)
func _text(key: Variant, fallback: Variant) -> String:
	var v: Variant = cfg["text"].get(key) if key != null else null
	return String(v) if v != null else str(fallback)


static func _arr(d: Dictionary, key: String) -> Array:
	var v: Variant = d.get(key)
	return v if v is Array else []


## JS Math.round
static func _js_round(x: float) -> float:
	return floor(x + 0.5)


## 숫자를 천 단위 쉼표로 (toLocaleString('ko-KR'), 정수만)
static func fmt_num(v: float) -> String:
	var n := int(round(v))
	var neg := n < 0
	var s := str(absi(n))
	var out := ""
	while s.length() > 3:
		out = "," + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	return ("-" if neg else "") + s + out


## 씨앗 하나로 0~1 (이번 주의 조건 뽑기)
static func _mix_random(seed_val: int) -> float:
	return float(_mix(seed_val, 99, 7)) / 4294967296.0


## 씨앗·하루·시도 횟수 → 난수 상태
static func _mix(seed_val: int, day_i: int, attempt: int) -> int:
	var h := (seed_val ^ CityGen.imul(day_i + 1, 0x9e3779b1) ^ CityGen.imul(attempt + 1, 0x85ebca6b)) & MASK32
	h = CityGen.imul(h ^ (h >> 16), 0x7feb352d)
	return (h ^ (h >> 15)) & MASK32
