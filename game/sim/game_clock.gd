class_name GameClock
extends RefCounted

## 게임 시계 (분). 실제 1초 = balance.clock.minutesPerSecond 분

var minutes: float


func _init(start_minutes: float = 0.0) -> void:
	minutes = start_minutes


func advance(dt_sec: float, minutes_per_second: float) -> void:
	minutes += dt_sec * minutes_per_second


## 미니게임·이동 등으로 시간을 건너뛴다 (뒤로 가지는 않음)
func skip_to(m: float) -> void:
	if m > minutes:
		minutes = m


func passed(hhmm: String) -> bool:
	return minutes >= DayCycle.parse_time(hhmm)


func label() -> String:
	return DayCycle.format_time(minutes)
