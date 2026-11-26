class_name PlayerState
extends RefCounted

## 플레이어 상태 (웹 판 src/gameplay/GameSession.ts의 PlayerState). GameSession.player가 이것이다.
## 연출·UI는 읽기만 한다.

var pos := Vector2.ZERO
var facing := 0.0
var moving := false
var running := false
## 이동 방향 (멈춰 있으면 null)
var move_dir: Variant = null
var earphones := false
var phone_pretend := false
var cover := false
var eyes_closed := false
var mask := false
var frozen := 0.0
## 계단 후 숨참: 달리기 불가
var winded := 0.0
var hidden := false
## 잠근 세이프 (화장실 칸·피팅룸, world의 safes 항목 Dictionary). 없으면 null
var locked_safe: Variant = null
var safe_time := 0.0
var knock_timer := 0.0
## consumables: 소모품 id → 개수, gear: 가진 장비, clothes: 고른 옷, items: 장바구니
var inventory := {"consumables": {}, "gear": [], "clothes": false, "items": []}
var walk_phase := 0.0
## 공유 자전거를 타고 있는지
var biking := false
