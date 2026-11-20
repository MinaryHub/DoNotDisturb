/** 작은 DOM 도우미 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

/** 내용이 바뀔 때만 textContent를 갱신 (매 프레임 호출용) */
export function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

/** 내용이 바뀔 때만 innerHTML을 갱신. 넣는 문자열은 escapeHtml을 거친 것만 */
export function setHtml(e: HTMLElement, html: string): void {
  if (e.dataset['html'] !== html) {
    e.dataset['html'] = html;
    e.innerHTML = html;
  }
}

export function show(e: HTMLElement, visible: boolean, display = 'block'): void {
  const v = visible ? display : 'none';
  if (e.style.display !== v) e.style.display = v;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** 이 요소가 화면의 점(들) 위에 떠 있는지 (조금 넉넉하게) */
export function coversAny(e: HTMLElement, pts: readonly { x: number; y: number }[], pad = 14): boolean {
  const r = e.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  return pts.some((p) => p.x > r.left - pad && p.x < r.right + pad && p.y > r.top - pad && p.y < r.bottom + pad);
}
