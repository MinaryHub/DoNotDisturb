class_name Synth
extends RefCounted

## 사운드 파일이 없는 단계의 임시음: 시작할 때 한 번 합성해 AudioStreamWAV로 만든다
## (웹 판 AudioDirector의 오실레이터·노이즈 소리를 같은 모양으로). 모노 16비트 22,050Hz.

const RATE := 22050


## 샘플 배열(-1~1) → 재생할 수 있는 소리. loop면 처음부터 끝까지 되풀이
static func to_stream(samples: PackedFloat32Array, loop: bool = false) -> AudioStreamWAV:
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in samples.size():
		bytes.encode_s16(i * 2, int(clampf(samples[i], -1.0, 1.0) * 32767.0))
	var s := AudioStreamWAV.new()
	s.format = AudioStreamWAV.FORMAT_16_BITS
	s.mix_rate = RATE
	s.stereo = false
	s.data = bytes
	if loop:
		s.loop_mode = AudioStreamWAV.LOOP_FORWARD
		s.loop_begin = 0
		s.loop_end = samples.size()
	return s


static func buffer(sec: float) -> PackedFloat32Array:
	var b := PackedFloat32Array()
	b.resize(int(sec * RATE))
	return b


## 분홍빛 노이즈 (웹 판과 같은 필터 계수)
static func pink_noise(sec: float, seed: int = 7) -> PackedFloat32Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var out := buffer(sec)
	var b0 := 0.0
	var b1 := 0.0
	var b2 := 0.0
	for i in out.size():
		var white := rng.randf() * 2.0 - 1.0
		b0 = 0.99765 * b0 + white * 0.099046
		b1 = 0.963 * b1 + white * 0.2965164
		b2 = 0.57 * b2 + white * 1.0526913
		out[i] = (b0 + b1 + b2 + white * 0.1848) * 0.15
	# 이음매가 들리지 않게 끝을 처음과 겹쳐 섞는다
	var fade := int(0.05 * RATE)
	for i in fade:
		var k := float(i) / fade
		out[out.size() - fade + i] = out[out.size() - fade + i] * (1.0 - k) + out[i] * k
	return out


## 오실레이터: type = sine·triangle·square·sawtooth. freq_end가 있으면 지수로 미끄러진다
static func osc(out: PackedFloat32Array, type: String, freq: float, at: float, dur: float, peak: float, attack: float, decay: float, freq_end: float = 0.0, cutoff: float = 0.0) -> void:
	var start := int(at * RATE)
	var n := int((dur + 0.05) * RATE)
	var phase := 0.0
	var lp := 0.0
	var a := 1.0 - exp(-TAU * cutoff / RATE) if cutoff > 0 else 1.0
	for i in n:
		var idx := start + i
		if idx >= out.size():
			break
		var t := float(i) / RATE
		var f := freq * pow(freq_end / freq, minf(1.0, t / maxf(0.001, dur))) if freq_end > 0 else freq
		phase = fmod(phase + f / RATE, 1.0)
		var v := 0.0
		match type:
			"sine":
				v = sin(phase * TAU)
			"triangle":
				v = 4.0 * absf(phase - 0.5) - 1.0
			"square":
				v = 1.0 if phase < 0.5 else -1.0
			"sawtooth":
				v = phase * 2.0 - 1.0
		if cutoff > 0:
			lp += (v - lp) * a
			v = lp
		out[idx] += v * env(t, peak, attack, decay)


## 지수 엔벨로프 (웹 판 env: 0.0001에서 peak까지 attack, 다시 0.0001까지 decay)
static func env(t: float, peak: float, attack: float, decay: float) -> float:
	if t < attack:
		return 0.0001 * pow(peak / 0.0001, t / attack)
	var d := t - attack
	if d > decay:
		return 0.0
	return peak * pow(0.0001 / peak, d / decay)


## 노이즈 조각 + 필터 (발소리·한숨·지글지글)
static func noise_burst(out: PackedFloat32Array, at: float, dur: float, peak: float, attack: float, decay: float, kind: String, freq: float, freq_end: float = 0.0, q: float = 1.0, seed: int = 1) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var start := int(at * RATE)
	var n := int(dur * RATE)
	var bq := Biquad.new()
	for i in n:
		var idx := start + i
		if idx >= out.size():
			break
		var t := float(i) / RATE
		var f := freq * pow(freq_end / freq, t / dur) if freq_end > 0 else freq
		if i % 64 == 0:
			bq.setup(kind, f, q)
		out[idx] += bq.process(rng.randf() * 2.0 - 1.0) * env(t, peak, attack, decay)


## 한 줄 바이쿼드 필터 (RBJ 공식)
class Biquad:
	var b0 := 1.0
	var b1 := 0.0
	var b2 := 0.0
	var a1 := 0.0
	var a2 := 0.0
	var x1 := 0.0
	var x2 := 0.0
	var y1 := 0.0
	var y2 := 0.0

	func setup(kind: String, freq: float, q: float) -> void:
		var w := TAU * freq / RATE
		var alpha := sin(w) / (2.0 * q)
		var c := cos(w)
		var a0 := 1.0 + alpha
		match kind:
			"lowpass":
				b0 = (1.0 - c) / 2.0 / a0
				b1 = (1.0 - c) / a0
				b2 = b0
			"highpass":
				b0 = (1.0 + c) / 2.0 / a0
				b1 = -(1.0 + c) / a0
				b2 = b0
			"bandpass":
				b0 = alpha / a0
				b1 = 0.0
				b2 = -alpha / a0
		a1 = -2.0 * c / a0
		a2 = (1.0 - alpha) / a0

	func process(x: float) -> float:
		var y := b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
		x2 = x1
		x1 = x
		y2 = y1
		y1 = y
		return y


## 끝없이 되풀이할 사인 (주파수에 맞춰 길이를 정수 주기로)
static func tone_loop(freq: float) -> AudioStreamWAV:
	var cycles := maxi(1, roundi(freq * 0.5))
	var n := int(round(cycles * RATE / freq))
	var out := PackedFloat32Array()
	out.resize(n)
	for i in n:
		out[i] = sin(TAU * cycles * float(i) / n)
	return to_stream(out, true)
