import * as THREE from 'three';
import type { WorldConfig } from '../core/configSchemas';
import type { Input } from '../core/Input';

/**
 * Phase 0용 자유 비행 1인칭 카메라.
 * Phase 1에서 Rapier 캐릭터 컨트롤러로 대체되며, 이후에는 디버그용으로만 남긴다.
 */
export class NoclipCamera {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = 0;
  private pitch = 0;
  private readonly velocity = new THREE.Vector3();

  constructor(
    private readonly cfg: WorldConfig,
    aspect: number,
  ) {
    this.camera = new THREE.PerspectiveCamera(cfg.camera.fov, aspect, cfg.camera.near, cfg.camera.far);
    this.camera.rotation.order = 'YXZ';
  }

  /** 발 위치(바닥) 기준으로 배치하고 눈높이를 더한다 */
  placeAt(feet: THREE.Vector3, yaw: number): void {
    this.camera.position.copy(feet).add(new THREE.Vector3(0, this.cfg.camera.eyeHeight, 0));
    this.yaw = yaw;
    this.pitch = 0;
    this.applyRotation();
  }

  update(dt: number, input: Input): void {
    const { dx, dy } = input.consumeMouseDelta();
    const sens = this.cfg.noclip.mouseSensitivity;
    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    this.applyRotation();

    const move = new THREE.Vector3(
      Number(input.isDown('moveRight')) - Number(input.isDown('moveLeft')),
      Number(input.isDown('moveUp')) - Number(input.isDown('moveDown')),
      Number(input.isDown('moveBackward')) - Number(input.isDown('moveForward')),
    );
    if (move.lengthSq() > 0) move.normalize();
    // 수평 이동은 시선 방향(yaw)만 따르고, 상하 이동은 월드 Y축
    const vertical = move.y;
    move.setY(0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).setY(vertical);

    const speed = this.cfg.noclip.speed * (input.isDown('sprint') ? this.cfg.noclip.fastMultiplier : 1);
    this.velocity.copy(move).multiplyScalar(speed);
    this.camera.position.addScaledVector(this.velocity, dt);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private applyRotation(): void {
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
