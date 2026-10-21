import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';

/**
 * 같은 mover id를 가진 레벨 노드 묶음 (엘리베이터 칸, 문 등).
 * 하나의 키네마틱 바디(초기 위치 = 원점)에 콜라이더가 붙고, 보이는 메시는 group 아래로 옮겨진다.
 * 평행 이동만 지원한다. offset은 레벨에 배치된 원래 위치로부터의 이동량.
 */
export class Mover {
  readonly group = new THREE.Group();
  readonly offset = new THREE.Vector3();
  private readonly prevOffset = new THREE.Vector3();
  /** 마지막 고정 스텝에서 움직인 양 (위에 탄 캐릭터를 함께 옮기는 데 사용) */
  readonly lastDelta = new THREE.Vector3();

  constructor(
    readonly id: string,
    readonly body: RAPIER.RigidBody,
    private readonly world: RAPIER.World,
  ) {
    this.group.name = `mover:${id}`;
  }

  /** 고정 스텝 시작 시 호출: 이번 스텝의 이동량을 0으로 */
  beginStep(): void {
    this.prevOffset.copy(this.offset);
    this.lastDelta.set(0, 0, 0);
  }

  /** 즉시 이동 (같은 스텝 안의 레이캐스트·캐릭터 컨트롤러가 새 위치를 보도록 콜라이더도 갱신) */
  setOffset(next: THREE.Vector3): void {
    this.lastDelta.add(new THREE.Vector3().subVectors(next, this.offset));
    this.offset.copy(next);
    this.body.setTranslation({ x: next.x, y: next.y, z: next.z }, true);
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  /** 렌더 프레임: 고정 스텝 사이를 보간해 메시 위치 갱신 */
  syncVisual(alpha: number): void {
    this.group.position.lerpVectors(this.prevOffset, this.offset, alpha);
  }
}
