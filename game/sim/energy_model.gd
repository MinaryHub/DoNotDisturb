class_name EnergyModel
extends RefCounted

## 에너지(사회적 배터리)와 심리 상태 (CLAUDE.md 5.1, 5.2)
##   자극 ──▶ 심리 상태(긴장·스트레스·당황·멘붕, 각 0~100) ──▶ 에너지 소모
## 기습형은 당황, 대면형·시선·군중은 긴장, 소음·업무·이불킥은 스트레스로 들어간다.
## 기습·대면은 그 순간 에너지를 조금 깎고(놀람), 나머지는 상태가 높은 동안 초당 깎는다.
## 멘붕: 셋 중 둘 이상이 문턱을 넘으면 차오른다. 에너지가 0이면 주저앉는다(번아웃).

const MOODS := ["tension", "stress", "panic", "meltdown"]
const BASE_MOODS := ["tension", "stress", "panic"]
const NO_MODIFIERS := {"auditory": 1.0, "visual": 1.0, "social": 1.0}
## 초당 이 미만의 지속 자극(차 소리 등)은 '자극이 없는 상태'로 본다 (자연 감소 유지)
const BACKGROUND_RATE := 0.08

var _cfg: Dictionary
var _battery: float
var _max: float
var _level := {"tension": 0.0, "stress": 0.0, "panic": 0.0, "meltdown": 0.0}
var _since := {"tension": INF, "stress": INF, "panic": INF}


func _init(cfg: Dictionary) -> void:
	_cfg = cfg
	_max = float(cfg["battery"]["max"])
	_battery = minf(float(cfg["battery"]["start"]), _max)


static func tier_of(battery: float, tiers: Dictionary) -> String:
	if battery <= 0:
		return "burnout"
	if battery <= tiers["critical"]:
		return "critical"
	if battery <= tiers["danger"]:
		return "danger"
	if battery <= tiers["tired"]:
		return "tired"
	return "stable"


static func _mood_of(hit: Dictionary) -> String:
	match hit["kind"]:
		"ambush":
			return "panic"
		"encounter":
			return "tension"
		"rumination":
			return "stress"
	return "stress" if hit["channel"] == "auditory" else "tension"


var battery: float:
	get:
		return _battery

## 오늘의 에너지 상한 (전날 밤 회복 결과로 변동)
var max_battery: float:
	get:
		return _max


func mood(m: String) -> float:
	return _level[m]


## 마음의 부하: 심리 상태 중 가장 높은 값
var psyche_load: float:
	get:
		return maxf(maxf(_level["tension"], _level["stress"]), maxf(_level["panic"], _level["meltdown"]))

## 지금 심리 상태 때문에 초당 깎이는 에너지
var drain_per_sec: float:
	get:
		var d: Dictionary = _cfg["psyche"]["drain"]
		var a := 0.0
		for m in MOODS:
			a += (_level[m] / 100.0) * float(d[m])
		return a

var tier: String:
	get:
		return tier_of(_battery, _cfg["battery"]["tiers"])

var burned_out: bool:
	get:
		return _battery <= 0


## 새 하루: 상한을 정하고 가득 채운 상태로, 심리 상태 초기화
func start_day(max_value: float) -> void:
	_max = maxf(1.0, minf(float(_cfg["battery"]["max"]), max_value))
	_battery = _max
	_reset()


## 주저앉은 뒤 집에서 다시 일어남
func revive(value: float) -> void:
	_battery = maxf(1.0, minf(_max, value))
	_reset()


func _reset() -> void:
	for m in MOODS:
		_level[m] = 0.0
	for m in BASE_MOODS:
		_since[m] = INF


## 자극 적용: 해당 심리 상태를 올리고, 기습·대면은 그 순간 에너지도 깎는다. → 깎인 에너지
func apply_hits(hits: Array, modifiers: Dictionary = NO_MODIFIERS, dt: float = 0.0) -> float:
	if burned_out:
		return 0.0
	var p: Dictionary = _cfg["psyche"]
	var jolt := 0.0
	for hit in hits:
		var amount: float = hit["amount"] * float(modifiers[hit["channel"]])
		if amount <= 0:
			continue
		var m := _mood_of(hit)
		_add(m, amount * float(p["gain"][hit["kind"]]))
		if hit["kind"] == "ambush" or hit["kind"] == "encounter":
			jolt += amount * float(p["hitEnergy"])
		# 배경 소음 같은 약한 지속 자극은 상태가 가라앉는 것까지 막지는 않는다
		var background: bool = hit["kind"] == "continuous" and dt > 0 and hit["amount"] / dt < BACKGROUND_RATE
		if not background:
			_since[m] = 0.0
	_battery = maxf(0.0, _battery - jolt)
	return jolt


## 상황이 직접 올리는 심리 상태 (업무 압박·군중·마스크·조급함). sustain이면 그동안 가라앉지 않는다
func add_mood(m: String, amount: float, sustain: bool = false) -> void:
	_add(m, maxf(0.0, amount))
	if sustain:
		_since[m] = 0.0


## 마음을 가라앉힘: 모든 상태를 amount만큼, 멘붕은 절반만큼
func calm(amount: float) -> void:
	if amount <= 0:
		return
	for m in BASE_MOODS:
		_level[m] = maxf(0.0, _level[m] - amount)
	_level["meltdown"] = maxf(0.0, _level["meltdown"] - amount / 2.0)


## 회복 아이템·이벤트. 상한을 넘지 않는다 → 실제로 찬 양
func recover(amount: float) -> float:
	if burned_out or amount <= 0:
		return 0.0
	var before := _battery
	_battery = minf(_max, _battery + amount)
	return _battery - before


## ctx = { outdoor, inSafe, extraRecoverPerSec?, calming? }
func tick(dt: float, ctx: Dictionary) -> void:
	if burned_out:
		return
	var p: Dictionary = _cfg["psyche"]
	var calm_scale := 3.0 if ctx.get("calming", false) else 1.0
	for m in BASE_MOODS:
		_since[m] += dt
		if _since[m] >= float(p["decayDelaySec"][m]):
			_level[m] = maxf(0.0, _level[m] - float(p["decay"][m]) * calm_scale * dt)
	var hot := 0
	for m in BASE_MOODS:
		if _level[m] >= float(p["meltdown"]["threshold"]):
			hot += 1
	if hot >= 2:
		_level["meltdown"] = minf(float(p["max"]), _level["meltdown"] + float(p["meltdown"]["risePerSec"]) * (hot - 1) * dt)
	else:
		_level["meltdown"] = maxf(0.0, _level["meltdown"] - float(p["meltdown"]["decayPerSec"]) * calm_scale * dt)
	var b: Dictionary = _cfg["battery"]
	var rec: float = (float(b["safeRecoverPerSec"]) if ctx.get("inSafe", false) else 0.0) + float(ctx.get("extraRecoverPerSec", 0.0))
	var delta := -drain_per_sec * dt
	if rec > 0:
		delta += rec * dt
	elif ctx.get("outdoor", false):
		delta -= float(b["outdoorDrainPerSec"]) * dt
	_battery = maxf(0.0, minf(_max, _battery + delta))


## 디버그용 직접 설정 { battery?, tension?, ... }
func debug_set(values: Dictionary) -> void:
	if values.has("battery"):
		_battery = minf(_max, maxf(0.0, float(values["battery"])))
	for m in MOODS:
		if values.has(m):
			_level[m] = minf(float(_cfg["psyche"]["max"]), maxf(0.0, float(values[m])))


func _add(m: String, v: float) -> void:
	_level[m] = minf(float(_cfg["psyche"]["max"]), _level[m] + v)
