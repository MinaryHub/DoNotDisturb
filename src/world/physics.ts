import RAPIER from '@dimforge/rapier3d-compat';
import { PLAYER_GROUPS } from './collisionGroups';

export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };

export interface SensorContact {
  /** 센서 콜라이더에 연결된 소유자 정보 (볼륨 정의 등) */
  owner: unknown;
  /** 센서에 들어오거나 나간 상대 콜라이더 */
  other: RAPIER.Collider;
  started: boolean;
}

let initialized: Promise<void> | null = null;

/** Rapier WASM 초기화 (여러 번 호출해도 한 번만 수행) */
export function initPhysics(): Promise<void> {
  initialized ??= RAPIER.init();
  return initialized;
}

/**
 * Rapier 월드 래퍼. 고정 콜라이더·센서 생성과 센서 진입/이탈 이벤트를 담당한다.
 * parent를 주면 그 바디에 붙는다 (바디가 원점에 있을 때 만들므로 좌표는 월드 좌표 그대로).
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  private readonly eventQueue = new RAPIER.EventQueue(true);
  private readonly sensorOwners = new Map<number, unknown>();

  constructor(gravityY: number) {
    this.world = new RAPIER.World({ x: 0, y: gravityY, z: 0 });
  }

  addStaticTrimesh(vertices: Float32Array, indices: Uint32Array, groups: number, parent?: RAPIER.RigidBody): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.trimesh(vertices, indices).setCollisionGroups(groups);
    return this.world.createCollider(desc, parent);
  }

  addStaticBox(center: Vec3, rotation: Quat, halfExtents: Vec3, groups: number, parent?: RAPIER.RigidBody): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setTranslation(center.x, center.y, center.z)
      .setRotation(rotation)
      .setCollisionGroups(groups);
    return this.world.createCollider(desc, parent);
  }

  /** 박스 센서를 만들고 소유자를 연결한다. 진입/이탈은 step()의 onSensor 콜백으로 전달된다. */
  addSensorBox(
    center: Vec3,
    rotation: Quat,
    halfExtents: Vec3,
    groups: number,
    owner: unknown,
    parent?: RAPIER.RigidBody,
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setTranslation(center.x, center.y, center.z)
      .setRotation(rotation)
      .setSensor(true)
      .setCollisionGroups(groups)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      // 기본값은 키네마틱-고정 쌍을 검사하지 않으므로 모두 허용
      .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
    const collider = this.world.createCollider(desc, parent);
    this.sensorOwners.set(collider.handle, owner);
    return collider;
  }

  /** 원점에 놓인 키네마틱 바디 (mover용) */
  addKinematicBody(): RAPIER.RigidBody {
    return this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  }

  /** 위치를 직접 지정하는 키네마틱 구체 (noclip 카메라의 센서 감지용) */
  addKinematicProbe(radius: number): { body: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(radius)
        .setCollisionGroups(PLAYER_GROUPS)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL),
      body,
    );
    return { body, collider };
  }

  removeColliders(colliders: Iterable<RAPIER.Collider>): void {
    for (const c of colliders) {
      this.sensorOwners.delete(c.handle);
      if (this.world.getCollider(c.handle)) this.world.removeCollider(c, false);
    }
  }

  removeBodies(bodies: Iterable<RAPIER.RigidBody>): void {
    for (const b of bodies) {
      for (let i = 0; i < b.numColliders(); i++) this.sensorOwners.delete(b.collider(i).handle);
      if (this.world.getRigidBody(b.handle)) this.world.removeRigidBody(b);
    }
  }

  step(dt: number, onSensor?: (contact: SensorContact) => void): void {
    this.world.timestep = dt;
    this.world.step(this.eventQueue);
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!onSensor) return;
      for (const [sensor, other] of [
        [h1, h2],
        [h2, h1],
      ] as const) {
        const owner = this.sensorOwners.get(sensor);
        const otherCollider = this.world.getCollider(other);
        if (owner !== undefined && otherCollider) onSensor({ owner, other: otherCollider, started });
      }
    });
  }

  dispose(): void {
    this.eventQueue.free();
    this.world.free();
  }
}
