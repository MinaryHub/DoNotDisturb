class_name Simulation
extends RefCounted

## 시뮬레이션 계층의 진입점. 게임플레이는 입력(자극·상황)을 넣고, 연출은 snapshot과 이벤트만 읽는다.
## 데이터 흐름: StimulusBus → EnergyModel / LifeStats → SomaticController → (연출)

## 이 이상(초당 기본 데미지)의 환경 자극이 이어지면 편두통 노출로 본다
const EXPOSURE_RATE := 0.1

var bus: StimulusBus
var energy: EnergyModel
var somatic: SomaticController
var life: LifeStats
var report: Dictionary
var _time := 0.0
var _recent_damage := 0.0
var _awkwardness := 0.0
var _life_collapsed := false
var _events: Array = []


## cfg = DataLoader.sim_config_of(gameConfig)
func _init(cfg: Dictionary, stimuli: Dictionary) -> void:
	bus = StimulusBus.new(stimuli)
	energy = EnergyModel.new(cfg["energy"])
	somatic = SomaticController.new(cfg["somatic"])
	life = LifeStats.new(cfg["life"])
	report = DayReport.empty(life.all(), life.money)


## 주저앉은 뒤 집에서 다시 일어남 (하루 기록은 이어진다)
func revive(battery: float) -> void:
	bus.clear()
	energy.revive(battery)
	somatic.clear_all()
	somatic.drain_events()
	_awkwardness = 0.0
	_recent_damage = 0.0


## 새 하루: 배터리 상한 설정, 하루 기록 초기화
func start_day(battery_max: float) -> void:
	bus.clear()
	energy.start_day(battery_max)
	somatic.clear_all()
	somatic.drain_events()
	_awkwardness = 0.0
	_recent_damage = 0.0
	_life_collapsed = false
	_events.clear()
	report = DayReport.empty(life.all(), life.money)


## input = { modifiers, outdoor, inSafe, extraRecoverPerSec?, gazeCount?, coveringCheeks?, eyesClosed?, flushRiseScale?, sanctuary?, awkwardPair? }
func step(dt: float, input: Dictionary) -> void:
	var before := energy.tier
	var was_burned_out := energy.burned_out
	_time += dt
	# 어색한 침묵: 좁은 공간 + 지인 → 어색함 상승, 그만큼 배터리 추가 감소
	if input.get("awkwardPair", false):
		_awkwardness += dt
		report["silenceSec"] += dt
		bus.set_continuous("awkward", "awkwardSilence", 1.0)
	else:
		_awkwardness = maxf(0.0, _awkwardness - dt * 2)
		bus.set_continuous("awkward", "awkwardSilence", 0.0)
	var exposure := bus.continuous_rate(func(k: String) -> bool: return k.begins_with("zone:") or k.begins_with("crowd")) >= EXPOSURE_RATE
	var result := bus.tick(dt)
	for id in result["ambushes"]:
		_events.append({"type": "ambush", "stimulusId": id})
	for id in result["encounters"]:
		_events.append({"type": "encounter", "stimulusId": id})
	var damage := energy.apply_hits(result["hits"], input.get("modifiers", EnergyModel.NO_MODIFIERS), dt)
	var battery_before := energy.battery
	var ctx := input.duplicate()
	ctx["calming"] = input.get("sanctuary", false)
	energy.tick(dt, ctx)
	var recovered := energy.battery - battery_before
	if recovered > 0:
		report["recoveredBattery"] += recovered
	if damage > 0:
		_events.append({"type": "damage", "amount": damage})
	_recent_damage = maxf(0.0, _recent_damage * exp(-3.0 * dt)) + damage
	somatic.step(dt, {
		"tension": energy.mood("tension"),
		"stress": energy.mood("stress"),
		"panic": energy.mood("panic"),
		"gazeCount": input.get("gazeCount", 0),
		"continuousExposure": exposure,
		"coveringCheeks": input.get("coveringCheeks", false),
		"eyesClosed": input.get("eyesClosed", false),
		"flushRiseScale": input.get("flushRiseScale", 1.0),
		"sanctuary": input.get("sanctuary", false),
	})
	_events.append_array(somatic.drain_events())
	var after := energy.tier
	if after != before:
		_events.append({"type": "tierChanged", "from": before, "to": after})
	if not was_burned_out and energy.burned_out:
		_events.append({"type": "burnout"})
	var col := life.collapsed()
	if col != "" and not _life_collapsed:
		_life_collapsed = true
		_events.append({"type": "lifeCollapse", "stat": col})


func drain_events() -> Array:
	var out := _events.duplicate()
	_events.clear()
	return out


func snapshot() -> Dictionary:
	return {
		"time": _time,
		"battery": energy.battery,
		"batteryMax": energy.max_battery,
		"tension": energy.mood("tension"),
		"stress": energy.mood("stress"),
		"panic": energy.mood("panic"),
		"meltdown": energy.mood("meltdown"),
		"load": energy.psyche_load,
		"drainPerSec": energy.drain_per_sec,
		"tier": energy.tier,
		"burnedOut": energy.burned_out,
		"recentDamage": _recent_damage,
		"flush": somatic.intensity("flush"),
		"migraine": somatic.intensity("migraine"),
		"stutter": somatic.intensity("stutter"),
		"sweat": somatic.intensity("sweat"),
		"ruminations": bus.active_ruminations(),
		"awkwardness": _awkwardness,
	}
