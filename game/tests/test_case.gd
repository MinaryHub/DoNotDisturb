class_name TestCase
extends RefCounted

## GDScript 테스트의 바탕. 시험 메서드는 test_로 시작하고 끝에서 true를 돌려준다
## (중간에 스크립트 오류로 멈추면 true가 돌아오지 않아 실패로 센다).

var failures: Array = []
var current := ""


func ok(cond: bool, msg: String = "") -> void:
	if not cond:
		failures.append("%s: %s" % [current, msg if msg != "" else "조건이 거짓"])


func eq(actual, expected, msg: String = "") -> void:
	if typeof(actual) in [TYPE_FLOAT, TYPE_INT] and typeof(expected) in [TYPE_FLOAT, TYPE_INT]:
		if absf(float(actual) - float(expected)) > 1e-6:
			failures.append("%s: %s 기대 %s, 실제 %s" % [current, msg, str(expected), str(actual)])
		return
	if actual != expected:
		failures.append("%s: %s 기대 %s, 실제 %s" % [current, msg, str(expected), str(actual)])


## 소수 자릿수 digits까지 같은지 (vitest toBeCloseTo와 같은 기준: 차이 < 10^-digits / 2)
func near(actual: float, expected: float, digits: int = 2, msg: String = "") -> void:
	if absf(actual - expected) >= pow(10.0, -digits) / 2.0:
		failures.append("%s: %s 기대 ≈%s, 실제 %s" % [current, msg, str(expected), str(actual)])


func gt(actual: float, bound: float, msg: String = "") -> void:
	if not actual > bound:
		failures.append("%s: %s %s > %s 아님" % [current, msg, str(actual), str(bound)])


func lt(actual: float, bound: float, msg: String = "") -> void:
	if not actual < bound:
		failures.append("%s: %s %s < %s 아님" % [current, msg, str(actual), str(bound)])
