/**
 * Kreate 맵이 없는 단계용 테스트 레벨 GLB 생성
 *   npm run make:greybox  →  assets/kreate/levels/test_greybox.glb
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { createGreyboxLevel } from './lib/greybox';

const out = path.resolve(import.meta.dirname, '..', 'assets', 'kreate', 'levels', 'test_greybox.glb');
fs.mkdirSync(path.dirname(out), { recursive: true });
await new NodeIO().write(out, createGreyboxLevel());
console.log(`그레이박스 레벨 생성: ${path.relative(process.cwd(), out)}`);
