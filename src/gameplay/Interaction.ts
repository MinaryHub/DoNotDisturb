import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { INTERACT_RAY_GROUPS } from '../world/collisionGroups';
import { rayObb } from '../world/geometry';
import { volumeCenter, type VolumeDef } from '../world/LevelLoader';

/**
 * 상호작용 레이캐스트: 시선 앞의 interact=true TRG_ 볼륨을 찾는다.
 * 벽(COL_)에 가려지면 대상이 되지 않는다.
 */
export class Interaction {
  private readonly targets: VolumeDef<'TRG'>[];
  focused: VolumeDef<'TRG'> | null = null;

  constructor(
    volumes: readonly VolumeDef[],
    private readonly world: RAPIER.World,
    private readonly range: number,
  ) {
    this.targets = volumes.filter((v): v is VolumeDef<'TRG'> => v.kind === 'TRG' && (v as VolumeDef<'TRG'>).props.interact === true);
  }

  update(eye: THREE.Vector3, forward: THREE.Vector3): VolumeDef<'TRG'> | null {
    let best: VolumeDef<'TRG'> | null = null;
    let bestT = this.range;
    const center = new THREE.Vector3();
    for (const target of this.targets) {
      const t = rayObb(eye, forward, volumeCenter(target, center), target.rotation, target.halfExtents);
      if (t !== null && t <= bestT) {
        best = target;
        bestT = t;
      }
    }
    if (best && bestT > 0) {
      const ray = new RAPIER.Ray(eye, forward);
      const hit = this.world.castRay(ray, bestT, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, INTERACT_RAY_GROUPS);
      // 버튼 바로 뒤 벽에 닿는 것은 허용 (여유 5cm)
      if (hit && hit.timeOfImpact < bestT - 0.05) best = null;
    }
    this.focused = best;
    return best;
  }
}
