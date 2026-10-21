import * as THREE from 'three';
import { t } from '../../core/config';
import type { TextTable } from '../../core/configSchemas';
import type { Npc } from '../../npc/Npc';

const MAX_DISTANCE = 14;

/**
 * NPC 머리 위 위협 태그 (CLAUDE.md 5.9). 이름 대신 "[잠재적 스몰토크 유발자]" 같은 태그를 띄운다.
 * NPC를 악당처럼 보이게 하지 않도록 부드러운 톤으로 표시한다.
 */
export class NpcTags {
  private readonly tags = new Map<Npc, HTMLDivElement>();
  private readonly v = new THREE.Vector3();

  constructor(private readonly text: TextTable) {}

  update(npcs: readonly Npc[], camera: THREE.PerspectiveCamera, width: number, height: number): void {
    for (const npc of npcs) {
      let tag = this.tags.get(npc);
      if (!tag) {
        tag = document.createElement('div');
        tag.className = 'npc-tag';
        tag.textContent = t(this.text, npc.profile.displayTagKey);
        document.body.appendChild(tag);
        this.tags.set(npc, tag);
      }
      this.v.copy(npc.model.position).setY(npc.model.position.y + 2.05);
      const distance = this.v.distanceTo(camera.position);
      this.v.project(camera);
      const visible = this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1 && distance < MAX_DISTANCE;
      tag.style.display = visible ? 'block' : 'none';
      if (!visible) continue;
      tag.style.transform = `translate(-50%, -100%) translate(${((this.v.x + 1) / 2) * width}px, ${((1 - this.v.y) / 2) * height}px)`;
      tag.style.opacity = String(Math.min(1, (MAX_DISTANCE - distance) / 4));
      tag.dataset['state'] = npc.state;
    }
  }

  clear(): void {
    for (const tag of this.tags.values()) tag.remove();
    this.tags.clear();
  }
}
