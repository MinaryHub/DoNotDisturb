/** 타입 안전 이벤트 발행기. Events는 { 이벤트명: 페이로드 } 형태의 맵 */
export class EventEmitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as (payload: never) => void);
    return () => this.off(event, listener);
  }

  off<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): void {
    this.listeners.get(event)?.delete(listener as (payload: never) => void);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) (listener as (payload: Events[K]) => void)(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
