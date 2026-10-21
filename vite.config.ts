import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const KREATE_DIR = path.resolve(import.meta.dirname, 'assets/kreate');

function isKreateAsset(file: string): boolean {
  const resolved = path.resolve(file);
  return resolved.startsWith(KREATE_DIR) && resolved.toLowerCase().endsWith('.glb');
}

/**
 * 개발 모드에서 /assets/kreate의 GLB 변경을 감시해 브라우저에 커스텀 HMR 이벤트를 보낸다.
 * 페이지 전체 새로고침 대신 게임이 현재 레벨만 다시 불러온다.
 */
function kreateAssetWatch(): Plugin {
  return {
    name: 'dnd:kreate-asset-watch',
    configureServer(server) {
      server.watcher.add(KREATE_DIR);
      const notify = (file: string) => {
        if (!isKreateAsset(file)) return;
        const rel = path.relative(KREATE_DIR, file).split(path.sep).join('/');
        server.ws.send({ type: 'custom', event: 'dnd:asset-changed', data: { path: rel } });
      };
      server.watcher.on('change', notify);
      server.watcher.on('add', notify);
    },
    hotUpdate({ file }) {
      // 기본 처리(전체 새로고침)를 막는다
      if (isKreateAsset(file)) return [];
    },
  };
}

export default defineConfig({
  // /assets 아래 파일을 그대로 제공: assets/kreate/levels/a.glb → /kreate/levels/a.glb
  publicDir: 'assets',
  plugins: [kreateAssetWatch()],
  build: {
    target: 'es2022',
  },
  optimizeDeps: {
    // WASM을 포함한 패키지는 사전 번들링에서 제외
    exclude: ['@dimforge/rapier3d-compat', 'recast-navigation', '@recast-navigation/core', '@recast-navigation/wasm', '@recast-navigation/generators'],
  },
});
