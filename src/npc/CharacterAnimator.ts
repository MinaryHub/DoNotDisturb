import * as THREE from 'three';

/**
 * 캐릭터 애니메이션 인터페이스 (CLAUDE.md 4.5).
 * Kreate가 스켈레탈 애니메이션을 내보내면 SkeletalAnimator(AnimationMixer)를,
 * 아니면 HEAD/BODY/ARM_L/ARM_R 노드를 코드로 움직이는 ProceduralAnimator를 쓴다.
 */
export interface CharacterAnimator {
  /** 이동 속도 (m/s). 0이면 Idle */
  setLocomotion(speed: number): void;
  /** 고개를 돌려 바라볼 월드 좌표. null이면 정면 */
  lookAt(target: THREE.Vector3 | null): void;
  /** 대화 중 (Talk 동작) */
  setTalking(talking: boolean): void;
  update(dt: number): void;
}

export interface ProceduralRig {
  root: THREE.Object3D;
  head: THREE.Object3D;
  body: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
}

/** Kreate 모델(또는 그레이박스)에서 HEAD/BODY/ARM_L/ARM_R 노드를 찾아 리그를 만든다 */
export function findProceduralRig(root: THREE.Object3D): ProceduralRig | null {
  const find = (name: string) => root.getObjectByName(name) ?? null;
  const head = find('HEAD');
  const body = find('BODY');
  const armL = find('ARM_L');
  const armR = find('ARM_R');
  if (!head || !body || !armL || !armR) return null;
  return { root, head, body, armL, armR };
}

export class ProceduralAnimator implements CharacterAnimator {
  private speed = 0;
  private phase = 0;
  private talking = false;
  private readonly target = new THREE.Vector3();
  private hasTarget = false;
  private headYaw = 0;
  private readonly baseBodyY: number;

  constructor(private readonly rig: ProceduralRig) {
    this.baseBodyY = rig.body.position.y;
  }

  setLocomotion(speed: number): void {
    this.speed = speed;
  }

  lookAt(target: THREE.Vector3 | null): void {
    this.hasTarget = target !== null;
    if (target) this.target.copy(target);
  }

  setTalking(talking: boolean): void {
    this.talking = talking;
  }

  update(dt: number): void {
    const { rig } = this;
    // 보행: 몸통 상하 흔들림, 팔 흔들기
    this.phase += dt * (this.speed > 0.05 ? 2 + this.speed * 3 : 1.2);
    const walk = Math.min(1, this.speed / 1.2);
    rig.body.position.y = this.baseBodyY + Math.abs(Math.sin(this.phase)) * 0.04 * walk;
    rig.armL.rotation.x = Math.sin(this.phase) * 0.5 * walk;
    rig.armR.rotation.x = -Math.sin(this.phase) * 0.5 * walk;

    // 고개 돌리기 (몸 기준 ±80°까지)
    let desired = 0;
    if (this.hasTarget) {
      const local = rig.root.worldToLocal(this.target.clone());
      desired = THREE.MathUtils.clamp(Math.atan2(-local.x, -local.z), -1.4, 1.4);
    }
    this.headYaw = THREE.MathUtils.lerp(this.headYaw, desired, 1 - Math.exp(-6 * dt));
    rig.head.rotation.y = this.headYaw;
    // 대화 중 끄덕임
    rig.head.rotation.x = this.talking ? Math.sin(this.phase * 2.5) * 0.12 : 0;
  }
}
