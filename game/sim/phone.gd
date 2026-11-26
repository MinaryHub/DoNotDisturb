class_name Phone
extends RefCounted

## 폰 (CLAUDE.md 5.10): 전화(받기·거절·문자로 대신·울리다 끊김), 문자(답장·읽씹·안읽씹).
## 결과(자극·생활 지표)는 연락처 정의(data/life.json contacts)를 따른다.
## call = { id, contactId, textKey, ringElapsed }, message = { id, contactId, textKey, read, resolved, waitLeft }

var _cfg: Dictionary
var call: Variant = null
var messages: Array = []
var _waits: Array = []
var _events: Array = []
var _seq := 0


## cfg = { ringSec, replyWaitSec, maxVisible }
func _init(cfg: Dictionary) -> void:
	_cfg = cfg


func ringing() -> bool:
	return call != null


func unread() -> Array:
	return messages.filter(func(m): return not m["read"])


## 답장을 기다리며 불안한 상태인지
func waiting_reply() -> bool:
	return not _waits.is_empty()


func receive_call(contact_id: String, text_key: String) -> void:
	_seq += 1
	# 통화 중 걸려온 전화는 부재중
	if call != null:
		_events.append({"type": "callResolved", "call": {"id": "c%d" % _seq, "contactId": contact_id, "textKey": text_key, "ringElapsed": 0.0}, "how": "missed"})
		return
	call = {"id": "c%d" % _seq, "contactId": contact_id, "textKey": text_key, "ringElapsed": 0.0}
	_events.append({"type": "ring", "call": call})


func answer() -> void:
	_resolve_call("answered")


func decline() -> void:
	_resolve_call("declined")


## 전화 대신 문자 → 답장 대기 불안
func text_instead() -> void:
	var c: Variant = call
	_resolve_call("texted")
	if c != null:
		_waits.append({"contactId": c["contactId"], "left": float(_cfg["replyWaitSec"])})


func receive_message(contact_id: String, text_key: String) -> Dictionary:
	_seq += 1
	var m := {"id": "m%d" % _seq, "contactId": contact_id, "textKey": text_key, "read": false, "resolved": false, "waitLeft": 0.0}
	messages.append(m)
	_events.append({"type": "message", "message": m})
	return m


func _find(id: String) -> Variant:
	for m in messages:
		if m["id"] == id:
			return m
	return null


func reply(id: String) -> void:
	var m: Variant = _find(id)
	if m == null or m["resolved"]:
		return
	m["read"] = true
	m["resolved"] = true
	_waits.append({"contactId": m["contactId"], "left": float(_cfg["replyWaitSec"])})
	_events.append({"type": "messageResolved", "message": m, "how": "replied"})


## 읽씹
func read_ignore(id: String) -> void:
	var m: Variant = _find(id)
	if m == null or m["resolved"]:
		return
	m["read"] = true
	m["resolved"] = true
	_events.append({"type": "messageResolved", "message": m, "how": "readIgnored"})


func update(dt: float) -> void:
	if call != null:
		call["ringElapsed"] += dt
		if call["ringElapsed"] >= float(_cfg["ringSec"]):
			_resolve_call("missed")
	for i in range(_waits.size() - 1, -1, -1):
		var w: Dictionary = _waits[i]
		w["left"] -= dt
		if w["left"] <= 0:
			_waits.remove_at(i)
			_events.append({"type": "replyReceived", "contactId": w["contactId"]})


## 하루 끝: 안 읽은 메시지는 안읽씹으로 정산
func end_day() -> void:
	for m in messages:
		if m["resolved"]:
			continue
		m["resolved"] = true
		_events.append({"type": "messageResolved", "message": m, "how": "unread"})
	messages.clear()
	_waits.clear()
	call = null


func drain_events() -> Array:
	var out := _events.duplicate()
	_events.clear()
	return out


func _resolve_call(how: String) -> void:
	if call == null:
		return
	var c: Variant = call
	call = null
	_events.append({"type": "callResolved", "call": c, "how": how})


## 전화·문자 처리 결과를 생활 지표에 반영 → { stimulus, escalation, avoided }
static func apply_contact_outcome(contact_id: String, contact: Dictionary, how: String, life: LifeStats) -> Dictionary:
	match how:
		"answered":
			life.apply(contact["answer"], "phone.%s" % how, contact_id)
			life.record_accept(contact_id)
			return {"stimulus": "" if contact.get("ally", false) else contact["answerStimulus"], "escalation": "", "avoided": false}
		"texted":
			life.apply(contact["texted"], "phone.%s" % how, contact_id)
			return {"stimulus": "", "escalation": "", "avoided": false}
		"replied":
			life.apply(contact["reply"], "phone.%s" % how, contact_id)
			life.record_accept(contact_id)
			return {"stimulus": "", "escalation": "", "avoided": false}
	# declined · missed · readIgnored · unread
	var delta: Dictionary = contact["readIgnored"] if how == "readIgnored" else (contact["unread"] if how == "unread" else contact["avoid"])
	life.apply(delta, "phone.%s" % how, contact_id)
	var r := life.record_avoid(contact_id)
	return {"stimulus": "", "escalation": contact.get("escalation", "") if r["escalate"] else "", "avoided": true}
