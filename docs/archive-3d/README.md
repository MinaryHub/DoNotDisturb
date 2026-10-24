# 3D 판 보관 문서

2026-10-24, 게임 컨셉을 **2D 탑다운**으로 전환하면서 Three.js·Rapier·recast 기반 3D 런타임과 Kreate GLB 파이프라인을 걷어냈습니다.
이 폴더의 문서는 3D 판에서 Kreate로 레벨을 만들 때의 규칙과 요청서입니다. 2D 판에서는 쓰지 않습니다.

- 3D 판 마지막 커밋: `491da1c` (`git checkout 491da1c`로 그대로 실행해 볼 수 있습니다)
- Kreate 원본 문서 `assets/kreate-src/stage01.kreate`는 그대로 남겨 두었습니다.
- 2D 판 월드 제작 규칙은 [`../world-authoring.md`](../world-authoring.md)를 보세요. 3D 판의 접두어 규칙(`COL_`·`LOS_`·`HIDE_`·`SAFE_`·`TRG_`·`SPAWN_`·`PATH_`·`ZONE_`)은 2D 데이터에 1:1로 옮겨 두었습니다.
