import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { PlayerConfig } from '../core/configSchemas';
import { PLAYER_GROUPS, PLAYER_MOVE_FILTER } from '../world/collisionGroups';
import type { Mover } from '../world/Mover';
import type { PhysicsWorld } from '../world/physics';

export interface MoveIntent {
  /** 로컬 이동 입력 (x: 오른쪽, z: 뒤쪽), 길이 ≤ 1 */
  move: THREE.Vector2;
  run: boolean;
}

export interface MoveModifiers {
  /** 이동 속도 배율 (폰 보기 0.6, 경직 0 등) */
  speedMultiplier: number;
}

/**
 * Rapier 키네마틱 캐릭터 컨트롤러 기반 1인칭 플레이어.
 * 이동은 고정 스텝에서, 시선(마우스)은 렌더 프레임에서 갱신한다.
 */
export class PlayerController {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly halfHeight: number;

  yaw = 0;
  pitch = 0;
  private verticalSpeed = 0;
  private grounded = false;
  /** 마지막으로 딛고 있던 움직이는 바닥 */
  private carrier: Mover | null = null;
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  /** 이번 스텝의 수평 이동 속도 (발소리·청각 판정용) */
  horizontalSpeed = 0;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly cfg: PlayerConfig,
    private readonly moverByBody: (bodyHandle: number) => Mover | null,
  ) {
    this.halfHeight = Math.max(0.05, (cfg.height - 2 * cfg.radius) / 2);
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    this.collider = physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(this.halfHeight, cfg.radius)
        .setCollisionGroups(PLAYER_GROUPS)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL),
      this.body,
    );
    this.controller = physics.world.createCharacterController(0.02);
    this.controller.enableAutostep(cfg.stepHeight, 0.15, false);
    this.controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(cfg.maxSlopeDeg));
    this.controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(cfg.maxSlopeDeg + 5));
    this.controller.enableSnapToGround(0.3);
    this.controller.setSlideEnabled(true);
  }

  /** 발 위치(바닥)에 배치 */
  placeAt(feet: THREE.Vector3, yaw: number): void {
    const center = feet.clone().add(new THREE.Vector3(0, this.cfg.height / 2 + 0.02, 0));
    this.body.setTranslation(center, true);
    this.body.setNextKinematicTranslation(center);
    this.physics.world.propagateModifiedBodyPositionsToColliders();
    this.prevPos.copy(center);
    this.currPos.copy(center);
    this.yaw = yaw;
    this.pitch = 0;
    this.verticalSpeed = 0;
    this.carrier = null;
  }

  /** 마우스 시선 (렌더 프레임). pitchLock이 있으면 그 각도로 서서히 고정 */
  look(dx: number, dy: number, sensitivity: number, pitchLock: number | null, dt: number, lockLerpPerSec: number): void {
    this.yaw -= dx * sensitivity;
    if (pitchLock === null) {
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sensitivity, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    } else {
      this.pitch = THREE.MathUtils.lerp(this.pitch, pitchLock, 1 - Math.exp(-lockLerpPerSec * dt));
    }
  }

  fixedUpdate(dt: number, intent: MoveIntent, mods: MoveModifiers): void {
    this.prevPos.copy(this.currPos);

    const speed = (intent.run ? this.cfg.runSpeed : this.cfg.walkSpeed) * mods.speedMultiplier;
    const wish = new THREE.Vector3(intent.move.x, 0, intent.move.y);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).multiplyScalar(speed * dt);

    this.verticalSpeed = this.grounded ? -0.5 : this.verticalSpeed + this.cfg.gravity * dt;
    const desired = new THREE.Vector3(wish.x, this.verticalSpeed * dt, wish.z);
    // 움직이는 바닥(엘리베이터)에 서 있으면 그 이동량을 더한다
    if (this.carrier) desired.add(this.carrier.lastDelta);

    this.controller.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, PLAYER_MOVE_FILTER);
    const moved = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();

    this.carrier = null;
    for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
      const hit = this.controller.computedCollision(i);
      const parent = hit?.collider?.parent();
      if (hit && parent && hit.normal1.y > 0.7) this.carrier = this.moverByBody(parent.handle) ?? this.carrier;
    }

    const t = this.body.translation();
    this.currPos.set(t.x + moved.x, t.y + moved.y, t.z + moved.z);
    this.body.setNextKinematicTranslation(this.currPos);
    this.horizontalSpeed = Math.hypot(moved.x, moved.z) / dt;
  }

  /** 렌더용 보간된 눈 위치 */
  eyePosition(alpha: number, out = new THREE.Vector3()): THREE.Vector3 {
    out.lerpVectors(this.prevPos, this.currPos, alpha);
    out.y += this.cfg.eyeHeight - this.cfg.height / 2;
    return out;
  }

  /** 시뮬레이션 기준 (보간 없는) 눈 위치 */
  get eye(): THREE.Vector3 {
    return this.eyePosition(1);
  }

  get feet(): THREE.Vector3 {
    return this.currPos.clone().setY(this.currPos.y - this.cfg.height / 2);
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  dispose(): void {
    this.physics.world.removeCharacterController(this.controller);
    this.physics.removeBodies([this.body]);
  }
}
