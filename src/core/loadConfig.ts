import monologueCsv from '../../data/monologue/ko.csv?raw';
import monologueCsvEn from '../../data/monologue/en.csv?raw';
import { parseGameConfig, type GameConfig, type Lang, type RawConfig } from './config';

// 브라우저(Vite)용 설정 로더. /data의 JSON을 번들에 포함하고 zod로 검증한다.

const files = import.meta.glob('../../data/**/*.json', { eager: true, import: 'default' });

export function loadConfig(lang: Lang = 'ko'): GameConfig {
  return parseGameConfig({ ...rawFromModules(files, monologueCsv), monologueCsvEn }, lang);
}

export function rawFromModules(modules: Record<string, unknown>, csv: string): RawConfig {
  const raw: RawConfig = { json: {}, dialogue: {}, days: {}, monologueCsv: csv };
  for (const [path, data] of Object.entries(modules)) {
    const rel = path.slice(path.indexOf('/data/') + '/data/'.length);
    const dialogue = /^dialogue\/([^/]+)\.json$/.exec(rel);
    const day = /^days\/([^/]+)\.json$/.exec(rel);
    if (dialogue) raw.dialogue[dialogue[1]!] = data;
    else if (day) raw.days[day[1]!] = data;
    else raw.json[rel] = data;
  }
  return raw;
}
