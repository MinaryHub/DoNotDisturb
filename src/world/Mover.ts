import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';

/**
 * 같은 mover id를 가진 레벨 노드 묶음 (엘리베이터 칸, 문 등).
 * 평행 이동만 지원한다. offset은 레벨에 배치된 원래 위치로부터의 이동량.
 *
 * 콜라이더는 키네마틱 바디에 붙이지 않고 바디 없는 고정 콜라이더로 두고 직접 옮긴다.
 * Rapier 0.21의 캐릭터 컨트롤러가 키네마틱 바디에 붙은 바닥으로 걸어 올라가지 못하고
 * 가장자리에서 멈추는 문제가 있기 때문이다 (tests/stage01.test.ts에서 재현 확인).
 * 위에 탄 캐릭터는 PlayerController가 lastDelta만큼 직접 함께 옮긴다.
 */
export class Mover {
  readonly group = new THREE.Group();
  readonly offset = new THREE.Vector3();
  private readonly prevOffset = new THREE.Vector3();
  /** 마지막 고정 스텝에서 움직인 양 */
  readonly lastDelta = new THREE.Vector3();
  private readonly colliders: { collider: RAPIER.Collider; base: THREE.Vector3 }[] = [];

  constructor(readonly id: string) {
    this.group.name = `mover:${id}`;
  }

  /** 레벨 로드 시 (offset 0 상태에서) 콜라이더 등록 */
  addCollider(collider: RAPIER.Collider): void {
    const t = collider.translation();
    this.colliders.push({ collider, base: new THREE.Vector3(t.x, t.y, t.z) });
  }

  ownsCollider(handle: number): boolean {
    return this.colliders.some((c) => c.collider.handle === handle);
  }

  get colliderHandles(): number[] {
    return this.colliders.map((c) => c.collider.handle);
  }

  /** 고정 스텝 시작 시 호출: 이번 스텝의 이동량을 0으로 */
  beginStep(): void {
    this.prevOffset.copy(this.offset);
    this.lastDelta.set(0, 0, 0);
  }

  /** 즉시 이동 (같은 스텝 안의 레이캐스트·캐릭터 컨트롤러가 새 위치를 본다) */
  setOffset(next: THREE.Vector3): void {
    this.lastDelta.add(new THREE.Vector3().subVectors(next, this.offset));
    this.offset.copy(next);
    for (const { collider, base } of this.colliders) {
      collider.setTranslation({ x: base.x + next.x, y: base.y + next.y, z: base.z + next.z });
    }
  }

  /** 렌더 프레임: 고정 스텝 사이를 보간해 메시 위치 갱신 */
  syncVisual(alpha: number): void {
    this.group.position.lerpVectors(this.prevOffset, this.offset, alpha);
  }
}
