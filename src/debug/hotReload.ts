/**
 * Kreate GLB 변경 알림을 구독한다 (개발 모드 전용).
 * Kreate가 파일을 여러 번에 나눠 쓰는 경우를 대비해 디바운스한다.
 */
export function watchKreateAssets(debounceMs: number, onChange: (path: string) => void): void {
  if (!import.meta.hot) return;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  import.meta.hot.on('dnd:asset-changed', (data: { path: string }) => {
    clearTimeout(timers.get(data.path));
    timers.set(
      data.path,
      setTimeout(() => {
        timers.delete(data.path);
        onChange(data.path);
      }, debounceMs),
    );
  });
}
