class_name PianoGame
extends RefCounted

## 건반 연주 (취미): 표시된 건반을 차례로 누른다. 틀려도 벌은 없다 — 다시 그 음부터. 웹 판 src/gameplay/minigames.ts

## 작은 별 — 도도솔솔라라솔 파파미미레레도 (0=도 … 6=시)
const PIANO_MELODY := [0, 0, 4, 4, 5, 5, 4, 3, 3, 2, 2, 1, 1, 0]

var index := 0
var mistakes := 0
var last_note := -1
var last_correct := true
var melody: Array


func _init(notes: Array = PIANO_MELODY) -> void:
	melody = notes


var done: bool:
	get:
		return index >= melody.size()


var expected: int:
	get:
		return int(melody[index]) if index < melody.size() else -1


func press(note: int) -> bool:
	if done:
		return false
	last_note = note
	last_correct = note == expected
	if last_correct:
		index += 1
	else:
		mistakes += 1
	return last_correct
