import { defineConfig } from 'vite';

// 배포 경로: apps.kimserv.com/donotdisturb/ 처럼 하위 경로에 둘 때 BASE_PATH로 지정 (기본은 루트)
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    outDir: base === '/' ? 'dist' : `dist${base}`,
  },
});
