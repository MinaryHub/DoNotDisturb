class_name PresentationState
extends RefCounted

## 시뮬레이션 수치를 연출 강도(0~1)로 바꾼다. 화면·오디오가 같은 값을 읽는다.
## 수치를 보여 주지 않고 감각으로 전달하기 위한 변환 계층 (CLAUDE.md 2-2). sim을 읽기만 한다.

var stress := 0.0
var tired := 0.0
var danger := 0.0
var critical := 0.0
## 기습 충격 (화면 흔들림), 1에서 감소
var trauma := 0.0
var hurt := 0.0
var flush := 0.0
var migraine := 0.0
var sweat := 0.0
var stutter := 0.0
var awkward := 0.0
var sanctuary := 0.0
var earphones := 0.0
var phone := 0.0
var eyes := 0.0
var cover := 0.0
## 번아웃 후 경과 시간 (-1 = 아님)
var burnout_time := -1.0
## "모두 사라져 버려~" 순간 이동 직후 번지는 빛 (1 → 0)
var warp := 0.0
## 심박 박동 (박동 직후 1)
var beat := 0.0
var time := 0.0
var ambushes: Array = []
## 이번 프레임의 소리 fx [{ type: "sound", id, note? }]
var sounds: Array = []

var _balance: Dictionary


func _init(balance: Dictionary) -> void:
	_balance = balance


## value가 from에서 to로 갈수록 0→1
static func ramp(value: float, from: float, to: float) -> float:
	return clampf((from - value) / (from - to), 0.0, 1.0)


func update(dt: float, s, fx: Array) -> void:
	time += dt
	ambushes.clear()
	sounds.clear()
	var snap: Dictionary = s.snapshot()
	var tiers: Dictionary = _balance["battery"]["tiers"]
	var b: float = snap["battery"]
	var k := 1.0 - exp(-3.0 * dt)
	var slow := 1.0 - exp(-1.2 * dt)
	var p = s.player
	# 마음의 부하(심리 상태 중 최댓값)가 비네팅·심박을 움직인다
	stress += (snap["load"] / 100.0 - stress) * k
	tired += (ramp(b, float(tiers["tired"]) + 1, float(tiers["danger"]) + 1) - tired) * k
	danger += (ramp(b, float(tiers["danger"]) + 1, float(tiers["critical"]) + 1) - danger) * k
	critical += (ramp(b, float(tiers["critical"]) + 1, 0) - critical) * k
	flush += (snap["flush"] - flush) * k
	migraine += (snap["migraine"] - migraine) * k
	sweat += (snap["sweat"] - sweat) * k
	stutter += (snap["stutter"] - stutter) * k
	awkward += (minf(1.0, snap["awkwardness"] / 10.0) - awkward) * k
	var sanct: bool = s.sanctuary()
	sanctuary += ((1.0 if sanct else 0.0) - sanctuary) * ((1.0 - exp(-dt / 0.7)) if sanct else slow)
	earphones += ((1.0 if p.earphones else 0.0) - earphones) * (1.0 - exp(-8.0 * dt))
	phone += ((1.0 if (p.phone_pretend or s.phone_open) else 0.0) - phone) * (1.0 - exp(-8.0 * dt))
	eyes += ((1.0 if p.eyes_closed else 0.0) - eyes) * (1.0 - exp(-10.0 * dt))
	cover += ((1.0 if p.cover else 0.0) - cover) * (1.0 - exp(-10.0 * dt))
	hurt = maxf(0.0, hurt - dt * 2)
	trauma = maxf(0.0, trauma - dt / maxf(0.01, float(_balance["ambush"]["shakeSec"])))
	beat = maxf(0.0, beat - dt * 4)
	warp = maxf(0.0, warp - dt / 1.4)
	# 안전지대에서는 모든 왜곡이 풀린다
	if sanctuary > 0.01:
		var calm := 1.0 - sanctuary
		danger *= calm
		critical *= calm
		migraine *= calm
		flush *= calm
	if snap["recentDamage"] > 1:
		hurt = minf(1.0, hurt + snap["recentDamage"] / 40.0)
	for e in fx:
		match e["type"]:
			"ambush":
				trauma = 1.0
				ambushes.append(e["stimulusId"])
			"sound":
				sounds.append(e)
			"warp":
				warp = 1.0
	if s.mode["kind"] == "burnout":
		burnout_time = 0.0 if burnout_time < 0 else burnout_time + dt
	else:
		burnout_time = -1.0


## 오디오가 심박을 칠 때
func pulse() -> void:
	beat = 1.0
