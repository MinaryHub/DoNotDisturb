import fs from 'node:fs';
import path from 'node:path';
import { parseGameConfig, type GameConfig, type RawConfig } from '../../src/core/config';

// Node(도구·테스트)용 설정 로더: /data를 파일 시스템에서 읽는다.

export const DATA_DIR = path.resolve(import.meta.dirname, '../../data');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

export function readRawConfig(dataDir = DATA_DIR): RawConfig {
  const raw: RawConfig = { json: {}, dialogue: {}, days: {}, monologueCsv: fs.readFileSync(path.join(dataDir, 'monologue/ko.csv'), 'utf8'), monologueCsvEn: fs.readFileSync(path.join(dataDir, 'monologue/en.csv'), 'utf8') };
  for (const file of walk(dataDir)) {
    if (!file.endsWith('.json')) continue;
    const rel = path.relative(dataDir, file).split(path.sep).join('/');
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      throw new Error(`JSON 문법 오류 (data/${rel}): ${(e as Error).message}`, { cause: e });
    }
    const dialogue = /^dialogue\/([^/]+)\.json$/.exec(rel);
    const dialogueEn = /^dialogue\/en\/([^/]+)\.json$/.exec(rel);
    const day = /^days\/([^/]+)\.json$/.exec(rel);
    if (dialogueEn) (raw.dialogueEn ??= {})[dialogueEn[1]!] = data;
    else if (dialogue) raw.dialogue[dialogue[1]!] = data;
    else if (day) raw.days[day[1]!] = data;
    else raw.json[rel] = data;
  }
  return raw;
}

export function readConfig(dataDir = DATA_DIR): GameConfig {
  return parseGameConfig(readRawConfig(dataDir));
}
