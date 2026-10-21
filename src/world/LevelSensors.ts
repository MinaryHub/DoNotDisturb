import type RAPIER from '@dimforge/rapier3d-compat';
import { EventEmitter } from '../core/EventEmitter';
import type { VolumeDef } from './LevelLoader';
import type { SensorContact } from './physics';

export type LevelSensorEvents = {
  /** TRG_ 진입 시 eventId로 스테이지 스크립트를 호출하기 위한 이벤트 */
  trigger: { eventId: string; volume: VolumeDef<'TRG'> };
  volumeEnter: { volume: VolumeDef };
  volumeExit: { volume: VolumeDef };
};

/**
 * 센서 접촉을 레벨 이벤트로 변환한다.
 * 플레이어 콜라이더만 추적하며, once=true인 TRG_는 레벨당 한 번만 발동한다.
 */
export class LevelSensors extends EventEmitter<LevelSensorEvents> {
  private readonly fired = new Set<VolumeDef>();
  private readonly inside = new Set<VolumeDef>();

  constructor(private readonly playerCollider: RAPIER.Collider) {
    super();
  }

  get activeVolumes(): ReadonlySet<VolumeDef> {
    return this.inside;
  }

  handleContact = (contact: SensorContact): void => {
    if (contact.other.handle !== this.playerCollider.handle) return;
    const volume = contact.owner as VolumeDef;

    if (contact.started) {
      this.inside.add(volume);
      this.emit('volumeEnter', { volume });
      if (volume.kind === 'TRG') {
        const trg = volume as VolumeDef<'TRG'>;
        if (trg.props.once && this.fired.has(volume)) return;
        this.fired.add(volume);
        this.emit('trigger', { eventId: trg.props.eventId, volume: trg });
      }
    } else {
      this.inside.delete(volume);
      this.emit('volumeExit', { volume });
    }
  };

  /** 레벨 재로드 시 상태 초기화 */
  reset(): void {
    this.fired.clear();
    this.inside.clear();
  }
}
