class_name AudioDirector
extends Node

## 소리 연출 (CLAUDE.md 7 오디오, 웹 판 AudioDirector.ts에서 옮김). 사운드 파일이 없는 단계라 합성한 임시음.
##   World → 로우패스(이어폰) → Master : 웅성거림, 발소리, 환경음, 새소리·풀벌레
##   Inner → Master                    : 심박, 혈류, 이명, 두통 (몸 안의 소리라 이어폰 영향 없음)
##   Alert → Master                    : 전화 벨·진동 (점프 스케어처럼 크게), 노크, 초인종
##   Music → Master                    : 안전지대 음악 (도어락 "철컥" 후 크로스페이드) + 오르골 선율
##   Pad   → Master                    : 마음이 고요할 때만 들리는 배경 화음
##   Keys  → Master                    : 건반·차임
##   Master: 높은 소리 깎기(warmth) → 부드러운 압축. 버스마다 리버브(공간감)를 조금씩
## 한 번 울리는 소리는 시작할 때 백그라운드에서 미리 합성해 두고(웹 판은 그때그때 오실레이터), 준비된 것만 낸다.

signal beat

const BUSES := ["World", "Inner", "Alert", "Music", "Pad", "Keys"]
const POOL := 10

var cfg: Dictionary
var earphone_cfg: Dictionary
var _sounds := {}
var _mutex := Mutex.new()
var _task := -1
var _players := {}
var _next_player := {}
var _loops := {}
var _loop_gain := {}
var _bus_gain := {}
var _world_lp: AudioEffectLowPassFilter
var _now := 0.0
var _next_beat := 0.2
var _bpm := 60.0
var _next_ring := 0.0
var _next_chord := 0.0
var _chord_index := 0
var _next_melody := 0.0
var _next_pad := 0.0
var _pad_index := 0
var _next_bird := 0.0
var _next_cricket := 0.0
var _foot_timer := 0.0
var _rng := RandomNumberGenerator.new()


func setup(presentation_audio: Dictionary, earphones: Dictionary) -> void:
	cfg = presentation_audio
	earphone_cfg = earphones
	_build_buses()
	for bus in BUSES:
		var list := []
		for i in POOL:
			var p := AudioStreamPlayer.new()
			p.bus = bus
			add_child(p)
			list.append(p)
		_players[bus] = list
		_next_player[bus] = 0
	# 계속 흐르는 소리: 노이즈를 걸러 만든 고리 (만드는 데 얼마 안 걸린다)
	var noise := Synth.pink_noise(2.0)
	_loop("murmur", _filtered(noise, "bandpass", 560, 0.8), "World")
	_loop("traffic", _filtered(noise, "lowpass", 200, 0.7), "World")
	# 빗소리: 쏴아 하는 높은 소리 대신 둥근 빗소리
	_loop("rain", _filtered(noise, "bandpass", 1100, 0.35), "World")
	_loop("blood", _filtered(noise, "lowpass", 120, 1.0), "Inner")
	_add_loop("tinnitus", Synth.tone_loop(cfg["tinnitusHz"]), "Inner")
	_add_loop("whine", Synth.tone_loop(3200), "Inner")
	_task = WorkerThreadPool.add_task(_render_all, false, "합성음 만들기")


func _exit_tree() -> void:
	if _task >= 0:
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1


func _build_buses() -> void:
	var soft: Dictionary = cfg["soft"]
	var master := AudioServer.get_bus_index("Master")
	if AudioServer.get_bus_effect_count(master) == 0:
		var warmth := AudioEffectHighShelfFilter.new()
		warmth.cutoff_hz = soft["warmthHz"]
		warmth.gain = db_to_linear(soft["warmthDb"])
		AudioServer.add_bus_effect(master, warmth)
		var comp := AudioEffectCompressor.new()
		comp.threshold = -20
		comp.ratio = 3
		comp.attack_us = 10000
		comp.release_ms = 300
		AudioServer.add_bus_effect(master, comp)
	# 리버브로 보내는 몫 (웹 판의 send 양 × reverbWet)
	var sends := {"World": 0.6, "Inner": 0.0, "Alert": 0.35, "Music": 1.0, "Pad": 1.0, "Keys": 0.8}
	for bus in BUSES:
		var idx := AudioServer.get_bus_index(bus)
		if idx >= 0:
			continue
		AudioServer.add_bus()
		idx = AudioServer.bus_count - 1
		AudioServer.set_bus_name(idx, bus)
		AudioServer.set_bus_send(idx, "Master")
		if bus == "World":
			_world_lp = AudioEffectLowPassFilter.new()
			_world_lp.cutoff_hz = 20000
			AudioServer.add_bus_effect(idx, _world_lp)
		if bus == "Pad":
			var lp := AudioEffectLowPassFilter.new()
			lp.cutoff_hz = 1400
			AudioServer.add_bus_effect(idx, lp)
		if sends[bus] > 0:
			var rv := AudioEffectReverb.new()
			rv.room_size = clampf(float(soft["reverbSec"]) / 3.5, 0.1, 0.95)
			rv.damping = 0.55
			rv.dry = 1.0
			rv.wet = sends[bus] * float(soft["reverbWet"])
			rv.spread = 0.8
			AudioServer.add_bus_effect(idx, rv)
	if _world_lp == null:
		var w := AudioServer.get_bus_index("World")
		_world_lp = AudioServer.get_bus_effect(w, 0) as AudioEffectLowPassFilter
	_set_bus("Alert", cfg["ringGain"])
	_set_bus("Music", 0.0)
	_set_bus("Pad", 0.0)


func _set_bus(bus: String, lin: float) -> void:
	_bus_gain[bus] = lin
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index(bus), _db(lin))


static func _db(lin: float) -> float:
	return -80.0 if lin <= 0.0001 else linear_to_db(lin)


func _filtered(src: PackedFloat32Array, kind: String, freq: float, q: float) -> PackedFloat32Array:
	var bq := Synth.Biquad.new()
	bq.setup(kind, freq, q)
	var out := PackedFloat32Array()
	out.resize(src.size())
	# 두 바퀴 돌려 필터가 자리 잡은 뒤의 값을 쓴다 (고리 이음매가 튀지 않게)
	for pass_i in 2:
		for i in src.size():
			out[i] = bq.process(src[i])
	var peak := 0.0
	for v in out:
		peak = maxf(peak, absf(v))
	if peak > 0.0:
		var k := 0.5 / peak
		for i in out.size():
			out[i] *= k
	return out


func _loop(id: String, samples: PackedFloat32Array, bus: String) -> void:
	_add_loop(id, Synth.to_stream(samples, true), bus)


func _add_loop(id: String, stream: AudioStreamWAV, bus: String) -> void:
	var p := AudioStreamPlayer.new()
	p.stream = stream
	p.bus = bus
	p.volume_db = -80
	p.autoplay = true
	add_child(p)
	if p.is_inside_tree():
		p.play()
	_loops[id] = p
	_loop_gain[id] = 0.0


## 계속 흐르는 소리의 크기를 time_const초에 걸쳐 따라간다 (웹 판 setTargetAtTime)
func _glide(id: String, target: float, time_const: float, dt: float) -> void:
	var g: float = _loop_gain[id]
	g += (target - g) * (1.0 - exp(-dt / maxf(0.001, time_const)))
	_loop_gain[id] = g
	_loops[id].volume_db = _db(g)


func _glide_bus(bus: String, target: float, time_const: float, dt: float) -> void:
	var g: float = _bus_gain.get(bus, 1.0)
	g += (target - g) * (1.0 - exp(-dt / maxf(0.001, time_const)))
	_set_bus(bus, g)


func play(id: String, bus: String, gain: float = 1.0, pitch: float = 1.0) -> void:
	_mutex.lock()
	var s: AudioStreamWAV = _sounds.get(id)
	_mutex.unlock()
	if s == null or gain <= 0.001:
		return
	var list: Array = _players[bus]
	var i: int = _next_player[bus]
	_next_player[bus] = (i + 1) % list.size()
	var p: AudioStreamPlayer = list[i]
	p.stream = s
	p.volume_db = _db(gain)
	p.pitch_scale = pitch
	p.play()


func update(dt: float, s, ps: PresentationState, st: Settings) -> void:
	var c := cfg
	_now += dt
	# 심박 속도는 긴장(게이지)을 따른다. 기운이 바닥(Critical)일 때만 조금 더 빨라진다
	_bpm = c["heartbeatMinBpm"] + (c["heartbeatMaxBpm"] - c["heartbeatMinBpm"]) * minf(1.0, ps.stress * 0.9 + ps.critical * 0.25)
	var kind: String = s.mode["kind"]
	var muted := kind == "night" or kind == "final" or kind == "dayIntro"
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Master"), _db(st.master))

	# 이어폰: 바깥 소리 로우패스 + 감쇠
	var lp_target: float = earphone_cfg["lowpassHz"] if s.player.earphones else 20000.0
	_world_lp.cutoff_hz += (lp_target - _world_lp.cutoff_hz) * (1.0 - exp(-dt / 0.08))
	var outside := 0.0 if muted or ps.burnout_time >= 0 else (0.55 if s.player.earphones else 1.0) * (1.0 - ps.sanctuary * 0.85)
	_glide_bus("World", outside, 0.6 if muted else 0.12, dt)

	# 웅성거림: 주변 사람 수 + 지친 정도. 목소리처럼 출렁인다
	var p: Vector2 = s.player.pos
	var crowd_near: int = s.crowd.count_near(p, 5)
	var people := crowd_near
	for n in s.active_npcs():
		if n.npc_type != "pet" and n.pos.distance_to(p) < 7:
			people += 1
	var area: Variant = s.area
	var zone := 0.0
	if area is Dictionary and area.get("stimulus") is Dictionary:
		zone = minf(1.0, area["stimulus"]["intensity"])
	var wobble := 0.75 + 0.25 * sin(ps.time * 2.3) * sin(ps.time * 0.9 + 1.0)
	var murmur: float = (minf(1.5, people * 0.12 + zone * 0.5) * c["murmurGain"] + ps.tired * c["murmurTiredBonus"]) * wobble
	_glide("murmur", murmur, 0.2, dt)
	var outdoor: bool = area is Dictionary and area.get("kind", "") == "outdoor"
	_glide("traffic", 0.22 if outdoor else 0.04, 0.5, dt)
	# 빗소리: 바깥이면 크게, 실내에선 창밖으로 작게
	var raining: bool = s.raining()
	_glide("rain", c["rainGain"] * (1.0 if outdoor else 0.25) if raining else 0.0, 0.8, dt)

	# 몸 안의 소리
	var inner := 0.4 if ps.burnout_time >= 0 else 1.0
	_glide("tinnitus", ps.critical * ps.critical * c["tinnitusGain"] * st.tinnitus * inner, 0.3, dt)
	_glide("whine", ps.migraine * c["migraineWhineGain"] * st.tinnitus, 0.4, dt)
	var blood_pulse := 0.6 + 0.4 * sin(ps.time * (_bpm / 60.0) * TAU)
	_glide("blood", ps.flush * c["bloodGain"] * blood_pulse, 0.05, dt)

	# 심박 (두 번 쿵쿵이 한 소리로 만들어져 있다)
	var beat_gain: float = c["heartbeatGain"] * st.heartbeat * minf(1.0, ps.stress * 0.8 + ps.critical * 0.6) * (1.0 - ps.sanctuary * 0.8)
	if _now >= _next_beat:
		if beat_gain > 0.03 and not muted:
			play("heartbeat", "Inner", beat_gain)
			beat.emit()
		_next_beat = maxf(_next_beat + 60.0 / _bpm, _now + 0.05)

	# 전화 벨 (울리는 동안 반복, 크게)
	if s.phone.ringing() and _now >= _next_ring:
		_next_ring = _now + 2.2
		play("ring", "Alert")
		play("buzz", "Alert")
	for id in ps.ambushes:
		if id == "textMessage" or id == "workPing":
			play("ping", "Alert")
		elif id == "shoulderTap" or id == "personalSpace":
			play("thud", "Alert")
	for e in ps.sounds:
		_sfx(e["id"], e.get("note", 0.0))

	# 안전지대 음악: 2초 크로스페이드, 화음 위로 오르골 선율
	_glide_bus("Music", ps.sanctuary * c["sanctuaryMusicGain"], c["crossfadeSec"] / 3.0, dt)
	if ps.sanctuary > 0.05 and _now >= _next_chord:
		play("chord%d" % (_chord_index % 4), "Music")
		_chord_index += 1
		_next_chord = _now + 3.6
	if ps.sanctuary > 0.3 and _now >= _next_melody:
		play("melody%d" % _rng.randi_range(0, 5), "Music")
		_next_melody = _now + 0.6 + _rng.randf() * 1.4

	# 마음의 배경 화음: 고요할수록 들리고, 긴장·지침이 오르면 소음에 묻혀 사라진다 (집에서는 안전지대 음악이 대신)
	var calm: float = 0.0 if muted else maxf(0.0, 1.0 - ps.stress * 1.6) * (1.0 - ps.danger) * (1.0 - ps.critical) * (1.0 - ps.sanctuary) * (0.0 if ps.burnout_time >= 0 else 1.0)
	_glide_bus("Pad", calm * c["soft"]["padGain"], 1.2, dt)
	var minutes: float = s.clock.minutes
	if calm > 0.05 and _now >= _next_pad:
		# 저녁에는 한 음 낮게
		var shift := 0.89 if minutes >= 17 * 60 or minutes < 6 * 60 else 1.0
		play("pad%d" % (_pad_index % 4), "Pad", 1.0, shift)
		_pad_index += 1
		_next_pad = _now + 6.5

	# 바깥의 작은 생명: 낮엔 새소리, 밤엔 풀벌레 (사람이 적을 때만 들린다)
	var quiet_out := outdoor and not muted and not raining and crowd_near < 3
	if quiet_out and minutes > 6 * 60 and minutes < 18 * 60 + 30 and _now >= _next_bird:
		play("bird%d" % _rng.randi_range(0, 3), "World", c["soft"]["birdsGain"] / 0.05 * (0.6 + 0.4 * calm), 0.9 + _rng.randf() * 0.3)
		_next_bird = _now + 2.5 + _rng.randf() * 5.0
	if quiet_out and (minutes >= 19 * 60 + 30 or minutes < 5 * 60) and _now >= _next_cricket:
		play("cricket", "World", c["soft"]["cricketsGain"] / 0.012)
		_next_cricket = _now + 0.9 + _rng.randf() * 1.4

	# 내 발소리 (이어폰이면 작게)
	_foot_timer -= dt
	if s.player.moving and _foot_timer <= 0 and not muted:
		_foot_timer = 0.28 if s.player.running else 0.42
		play("step%d" % _rng.randi_range(0, 3), "World", float(c["footstepGain"]) * (0.3 if s.player.earphones else 1.0) * 0.4 / 0.14, 0.9 + _rng.randf() * 0.25)


func _sfx(id: String, note: float) -> void:
	match id:
		"doorLock", "doorUnlock", "knock", "doorbell", "elevatorDing", "fakeCall":
			play(id if id != "fakeCall" else "ring", "Alert")
		"vibrate":
			play("buzzShort", "Alert")
		"piano":
			var n := clampi(int(floor(note)), 0, 6)
			play("piano%d%s" % [n, "s" if fmod(note, 1.0) != 0.0 else ""], "Keys")
		"chime":
			play("chime", "Keys")
		"sigh":
			play("sigh", "Inner")
		"laugh":
			play("laugh%d" % _rng.randi_range(0, 1), "World")
		"sizzle":
			play("sizzle", "World")
		"beep":
			play("beep", "World")
		"stairs":
			play("stairs", "World")


# ── 합성 (백그라운드). 웹 판의 소리 하나하나를 같은 모양으로. 급한 소리부터 만든다

func _put(id: String, samples: PackedFloat32Array) -> void:
	var s := Synth.to_stream(samples)
	_mutex.lock()
	_sounds[id] = s
	_mutex.unlock()


func _render_all() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 11
	# 둥근 심박: 낮고 짧게 두 번 (부드럽지만 또렷이)
	var hb := Synth.buffer(0.5)
	Synth.osc(hb, "sine", 64, 0.0, 0.22, 1.0, 0.02, 0.18, 36, 220)
	Synth.osc(hb, "sine", 64, 0.2, 0.22, 0.6, 0.02, 0.18, 36, 220)
	_put("heartbeat", hb)
	# 벨: 여전히 크고 갑작스럽지만 둥근 삼각파
	var ring := Synth.buffer(0.85)
	for i in 8:
		Synth.osc(ring, "triangle", 1320.0 if i % 2 == 0 else 990.0, i * 0.09, 0.08, 0.5, 0.004, 0.07, 0, 5200)
	_put("ring", ring)
	_put("buzz", _buzz(0.8))
	_put("buzzShort", _buzz(0.35))
	# 메시지: 맑은 두 음 (실로폰처럼)
	var ping := Synth.buffer(0.55)
	Synth.osc(ping, "sine", 1568, 0.0, 0.25, 0.3, 0.004, 0.22)
	Synth.osc(ping, "sine", 2093, 0.11, 0.35, 0.26, 0.004, 0.3)
	_put("ping", ping)
	var thud := Synth.buffer(0.22)
	_thud(thud, 0.0)
	_put("thud", thud)
	for v in 4:
		var st := Synth.buffer(0.1)
		Synth.noise_burst(st, 0.0, 0.1, 0.14, 0.008, 0.06, "bandpass", 200 + rng.randf() * 90, 0, 1.4, v + 3)
		_put("step%d" % v, st)
	var stairs := Synth.buffer(1.9)
	for i in 6:
		Synth.noise_burst(stairs, i * 0.3, 0.1, 0.35, 0.008, 0.06, "bandpass", 220, 0, 1.4, i + 20)
	_put("stairs", stairs)
	# 철컥 (둥글게)
	var lock := Synth.buffer(0.3)
	_thud(lock, 0.0)
	Synth.osc(lock, "triangle", 2200, 0.05, 0.04, 0.22, 0.002, 0.04, 0, 3500)
	Synth.osc(lock, "triangle", 1650, 0.12, 0.04, 0.22, 0.002, 0.04, 0, 3500)
	_put("doorLock", lock)
	var unlock := Synth.buffer(0.1)
	Synth.osc(unlock, "triangle", 1500, 0.0, 0.04, 0.18, 0.002, 0.04, 0, 3500)
	_put("doorUnlock", unlock)
	var knock := Synth.buffer(0.6)
	for i in 3:
		_thud(knock, i * 0.18)
	_put("knock", knock)
	var bell := Synth.buffer(1.6)
	Synth.osc(bell, "sine", 659, 0.0, 0.7, 0.45, 0.01, 0.7)
	Synth.osc(bell, "sine", 523, 0.5, 1.0, 0.45, 0.01, 1.0)
	_put("doorbell", bell)
	var ding := Synth.buffer(1.1)
	Synth.osc(ding, "sine", 1046, 0.0, 0.9, 0.26, 0.005, 1.0)
	_put("elevatorDing", ding)
	var beep := Synth.buffer(0.1)
	Synth.osc(beep, "triangle", 1800, 0.0, 0.07, 0.11, 0.004, 0.06, 0, 3000)
	_put("beep", beep)
	var sigh := Synth.buffer(1.2)
	Synth.noise_burst(sigh, 0.0, 1.2, 0.45, 0.2, 0.9, "lowpass", 800, 220, 0.7, 5)
	_put("sigh", sigh)
	var sizzle := Synth.buffer(0.6)
	Synth.noise_burst(sizzle, 0.0, 0.6, 0.2, 0.03, 0.5, "bandpass", 2600, 0, 0.6, 9)
	_put("sizzle", sizzle)
	for v in 2:
		var laugh := Synth.buffer(0.8)
		for i in 6:
			Synth.osc(laugh, "triangle", 220 + rng.randf() * 160, i * 0.11, 0.09, 0.12, 0.012, 0.08, 0, 1200)
		_put("laugh%d" % v, laugh)
	var chime := Synth.buffer(1.4)
	for i in 3:
		Synth.osc(chime, "sine", [784.0, 988.0, 1175.0][i], i * 0.12, 1.0, 0.18, 0.01, 1.0)
	_put("chime", chime)
	# 새소리: 짧게 올라가는 휘파람 두세 번 (gain 0.05 기준, 재생할 때 맞춘다)
	for v in 4:
		var bird := Synth.buffer(0.5)
		var base := 2600 + rng.randf() * 1400
		var t := 0.0
		for i in 2 + v % 2:
			Synth.osc(bird, "sine", base, t, 0.1, 0.05, 0.01, 0.08, base * (1.15 + rng.randf() * 0.2))
			t += 0.12 + rng.randf() * 0.06
		_put("bird%d" % v, bird)
	# 풀벌레: 아주 작은 떨림 세 번 (gain 0.012 기준)
	var cricket := Synth.buffer(0.25)
	for i in 3:
		Synth.osc(cricket, "sine", 4300, i * 0.07, 0.05, 0.012, 0.004, 0.04, 0, 6000)
	_put("cricket", cricket)
	# 건반: 도레미파솔라시, 반음 올린 것도
	var scale := [261.6, 293.7, 329.6, 349.2, 392.0, 440.0, 493.9]
	for i in 7:
		for sharp in [false, true]:
			var f: float = scale[i] * (1.06 if sharp else 1.0)
			var key := Synth.buffer(1.7)
			Synth.osc(key, "triangle", f, 0.0, 1.6, 0.33, 0.006, 1.5, 0, 2600)
			Synth.osc(key, "sine", f * 2, 0.0, 1.0, 0.07, 0.005, 0.9)
			_put("piano%d%s" % [i, "s" if sharp else ""], key)
	# 집의 오르골: 화음에 맞는 음을 드문드문
	var mel := [523.3, 587.3, 659.3, 784.0, 880.0, 1046.5]
	var mg: float = cfg["soft"]["melodyGain"]
	for i in mel.size():
		var m := Synth.buffer(1.6)
		Synth.osc(m, "sine", mel[i], 0.0, 1.6, mg, 0.004, 1.5)
		Synth.osc(m, "sine", mel[i] * 3, 0.0, 0.6, mg * 0.18, 0.003, 0.5)
		_put("melody%d" % i, m)
	# 느린 따뜻한 화음 (Cmaj7 → Am7 → Fmaj7 → G6). 살짝 어긋난 두 겹이라 숨 쉬듯 일렁인다
	var chords := [[261.6, 329.6, 392.0, 493.9], [220.0, 261.6, 329.6, 392.0], [174.6, 220.0, 261.6, 329.6], [196.0, 246.9, 293.7, 329.6]]
	for ci in 4:
		var ch := Synth.buffer(4.4)
		for i in 4:
			var f: float = chords[ci][i]
			Synth.osc(ch, "sine", f, i * 0.08, 4.0, 0.14, 0.8, 3.2)
			Synth.osc(ch, "triangle", f * 1.003, i * 0.08, 4.0, 0.06, 1.0, 3.0, 0, 1800)
		_put("chord%d" % ci, ch)
	# 마음의 배경 화음: 긴 숨처럼 차오르고 사그라든다
	var voicings := [[146.8, 220.0, 277.2, 329.6], [123.5, 185.0, 246.9, 293.7], [130.8, 196.0, 246.9, 329.6], [110.0, 164.8, 220.0, 277.2]]
	for vi in 4:
		var pad := Synth.buffer(7.1)
		for f in voicings[vi]:
			Synth.osc(pad, "sine", f, 0.0, 7.0, 0.22, 2.5, 4.5)
			Synth.osc(pad, "triangle", f * 1.004, 0.0, 7.0, 0.08, 3.0, 4.0)
		_put("pad%d" % vi, pad)


func _buzz(dur: float) -> PackedFloat32Array:
	var b := Synth.buffer(dur + 0.1)
	Synth.osc(b, "sawtooth", 150, 0.0, dur, 0.45, 0.01, dur, 0, 900)
	return b


func _thud(out: PackedFloat32Array, at: float) -> void:
	Synth.osc(out, "triangle", 170, at, 0.16, 0.45, 0.006, 0.13, 60, 700)


## 테스트·로딩 화면용: 합성이 끝났는지
func ready_count() -> int:
	_mutex.lock()
	var n := _sounds.size()
	_mutex.unlock()
	return n
