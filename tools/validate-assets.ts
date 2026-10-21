/**
 * Kreate 에셋 검증: assets/kreate 아래 모든 GLB를 검사해 리포트를 출력한다.
 *   npm run validate:assets              오류가 있으면 종료 코드 1
 *   npm run validate:assets -- --strict  경고도 실패로 처리
 *   npm run validate:assets -- --json    JSON으로 출력
 */
import fs from 'node:fs';
import path from 'node:path';
import { Logger, NodeIO } from '@gltf-transform/core';
import { assetBudgetSchema, parseConfig } from '../src/core/configSchemas';
import { validateAsset, type AssetReport } from './lib/validateAsset';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSET_DIR = path.join(ROOT, 'assets', 'kreate');

const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const asJson = args.has('--json');

function findGlbs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.toLowerCase().endsWith('.glb'))
    .map((f) => path.join(dir, f))
    .sort();
}

async function main(): Promise<number> {
  const budget = parseConfig(
    assetBudgetSchema,
    JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'assetBudget.json'), 'utf8')),
    'data/assetBudget.json',
  );
  // Kreate 전용 선택 확장(KREATE_ngons 등) 미지원 안내는 출력하지 않는다
  const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.ERROR));
  const files = findGlbs(ASSET_DIR);
  const reports: AssetReport[] = [];

  for (const file of files) {
    const rel = path.relative(ASSET_DIR, file).split(path.sep).join('/');
    try {
      const doc = await io.read(file);
      reports.push(validateAsset(doc, rel, budget));
    } catch (err) {
      reports.push({
        file: rel,
        category: 'level',
        items: [{ level: 'error', node: '(file)', message: `GLB를 읽을 수 없습니다: ${(err as Error).message}` }],
        stats: { nodes: 0, renderedTriangles: 0, prefixCounts: {}, bounds: null },
      });
    }
  }

  const errorCount = reports.reduce((n, r) => n + r.items.filter((i) => i.level === 'error').length, 0);
  const warningCount = reports.reduce((n, r) => n + r.items.filter((i) => i.level === 'warning').length, 0);

  if (asJson) {
    console.log(JSON.stringify({ reports, errorCount, warningCount }, null, 2));
  } else {
    console.log(`\nKreate 에셋 검증 — ${path.relative(ROOT, ASSET_DIR)} (${files.length}개 파일)\n`);
    if (files.length === 0) console.log('  검사할 GLB가 없습니다. (npm run make:greybox 로 테스트 레벨 생성 가능)\n');
    for (const r of reports) {
      const errs = r.items.filter((i) => i.level === 'error').length;
      const warns = r.items.length - errs;
      const mark = errs > 0 ? '✖' : warns > 0 ? '▲' : '✔';
      const prefixes = Object.entries(r.stats.prefixCounts)
        .map(([p, n]) => `${p}:${n}`)
        .join(' ');
      console.log(`${mark} ${r.file}  [${r.category}]  노드 ${r.stats.nodes} · 렌더 삼각형 ${r.stats.renderedTriangles.toLocaleString()}`);
      if (prefixes) console.log(`    접두어  ${prefixes}`);
      if (r.stats.bounds) {
        const s = r.stats.bounds.max.map((v, i) => (v - r.stats.bounds!.min[i]!).toFixed(2));
        console.log(`    크기    ${s[0]} × ${s[1]} × ${s[2]} m (X×Y×Z)`);
      }
      for (const item of r.items) {
        console.log(`    ${item.level === 'error' ? '오류' : '경고'}  ${item.node}: ${item.message}`);
      }
      console.log('');
    }
    console.log(`결과: 오류 ${errorCount}개, 경고 ${warningCount}개${strict ? ' (--strict: 경고도 실패)' : ''}\n`);
  }

  return errorCount > 0 || (strict && warningCount > 0) ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
