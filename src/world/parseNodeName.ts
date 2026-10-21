import { PREFIXES, propSchemas, type Prefix } from './levelSchema';

export type IssueLevel = 'error' | 'warning';

export interface NodeIssue {
  level: IssueLevel;
  code:
    | 'prefix-case'
    | 'prefix-typo'
    | 'empty-id'
    | 'bad-property'
    | 'unknown-property'
    | 'property-conflict'
    | 'schema'
    | 'path-index';
  message: string;
}

export interface ParsedNode {
  /** Kreate에서 붙인 원래 이름 */
  rawName: string;
  prefix: Prefix;
  /** 접두어와 속성 꼬리를 뗀 식별자 (예: TRG_phone__eventId=x → "phone") */
  id: string;
  /** 이름 속성과 extras.dnd를 합친 뒤 스키마 검증을 통과한 값. 검증 실패 시 null */
  props: Record<string, unknown> | null;
  issues: NodeIssue[];
}

const PROP_SEPARATOR = '__';
/** Kreate는 같은 이름이 있으면 "Cube.001"처럼 번호를 붙인다 */
const DUPLICATE_SUFFIX = /\.\d{3}$/;

/** 이름 속성 값 문자열을 boolean/number/string으로 변환 */
export function coerceValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

/**
 * 중복 번호 접미어(.001)를 제거한다.
 * 단 "intensity=0.600"처럼 숫자 값의 소수부로 볼 수 있으면 값으로 간주해 남긴다.
 */
export function stripDuplicateSuffix(name: string): string {
  if (!DUPLICATE_SUFFIX.test(name)) return name;
  const without = name.replace(DUPLICATE_SUFFIX, '');
  if (/=-?\d+$/.test(without)) return name;
  return without;
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

function isPrefix(s: string): s is Prefix {
  return (PREFIXES as readonly string[]).includes(s);
}

/** 오타로 보이는 접두어면 가장 가까운 접두어를 돌려준다 */
function suggestPrefix(token: string): Prefix | null {
  const upper = token.toUpperCase();
  let best: Prefix | null = null;
  let bestDist = Infinity;
  for (const p of PREFIXES) {
    const d = levenshtein(upper, p);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  // 짧은 접두어(COL, NAV 등)는 1글자, 긴 접두어는 2글자 차이까지 오타로 본다
  const tolerance = best && best.length <= 3 ? 1 : 2;
  return bestDist <= tolerance ? best : null;
}

/**
 * Kreate 노드 이름과 glTF extras를 해석한다.
 * 형식: PREFIX_id__key=value__key2=value2  (extras.dnd가 있으면 그 값이 우선)
 */
export function parseNodeName(rawName: string, extras?: unknown): ParsedNode {
  const issues: NodeIssue[] = [];
  const name = stripDuplicateSuffix(rawName.trim());
  const [head = '', ...propParts] = name.split(PROP_SEPARATOR);

  // 1) 접두어 판별
  let prefix: Prefix = 'VIS';
  let id = head;
  const match = /^([A-Za-z]+)_(.*)$/.exec(head);
  if (match) {
    const token = match[1]!;
    const rest = match[2]!;
    if (isPrefix(token)) {
      prefix = token;
      id = rest;
    } else if (isPrefix(token.toUpperCase())) {
      prefix = token.toUpperCase() as Prefix;
      id = rest;
      issues.push({
        level: 'warning',
        code: 'prefix-case',
        message: `접두어는 대문자여야 합니다: "${token}_" → "${prefix}_" 로 처리함`,
      });
    } else if (token === token.toUpperCase() && token.length >= 2) {
      const suggestion = suggestPrefix(token);
      if (suggestion) {
        issues.push({
          level: 'warning',
          code: 'prefix-typo',
          message: `알 수 없는 접두어 "${token}_" — "${suggestion}_"의 오타인가요? (보이는 메시로 처리함)`,
        });
      }
    }
  }
  if (prefix !== 'VIS' && id.length === 0) {
    issues.push({ level: 'error', code: 'empty-id', message: `${prefix}_ 뒤에 식별자가 없습니다` });
  }

  // 2) 이름 속성 (__key=value)
  const nameProps: Record<string, unknown> = {};
  for (const part of propParts) {
    const eq = part.indexOf('=');
    if (eq <= 0) {
      issues.push({ level: 'warning', code: 'bad-property', message: `속성 형식은 key=value 여야 합니다: "${part}"` });
      continue;
    }
    nameProps[part.slice(0, eq)] = coerceValue(part.slice(eq + 1));
  }

  // 3) extras.dnd 병합 (extras 우선)
  const merged: Record<string, unknown> = { ...nameProps };
  const dnd = extractDndExtras(extras);
  if (dnd) {
    for (const [key, value] of Object.entries(dnd)) {
      if (key in nameProps && nameProps[key] !== value) {
        issues.push({
          level: 'warning',
          code: 'property-conflict',
          message: `"${key}" 값이 이름(${String(nameProps[key])})과 extras(${String(value)})에서 다릅니다 — extras 값 사용`,
        });
      }
      merged[key] = value;
    }
  }

  // 4) 스키마 검증
  const schema = propSchemas[prefix];
  const known = new Set(Object.keys(schema.shape));
  for (const key of Object.keys(merged)) {
    if (!known.has(key)) {
      issues.push({
        level: 'warning',
        code: 'unknown-property',
        message: `${prefix}_에서 알 수 없는 속성 "${key}" (허용: ${[...known].join(', ') || '없음'})`,
      });
    }
  }
  const result = schema.safeParse(merged);
  let props: Record<string, unknown> | null = null;
  if (result.success) {
    props = result.data;
  } else {
    for (const issue of result.error.issues) {
      issues.push({
        level: 'error',
        code: 'schema',
        message: `${prefix}_ 속성 오류 — ${issue.path.join('.') || '(전체)'}: ${issue.message}`,
      });
    }
  }

  if (prefix === 'PATH' && parsePathId(id) === null) {
    issues.push({
      level: 'error',
      code: 'path-index',
      message: `PATH_ 이름은 PATH_<npcId>_<번호> 형식이어야 합니다 (예: PATH_neighbor_01)`,
    });
  }

  return { rawName, prefix, id, props, issues };
}

function extractDndExtras(extras: unknown): Record<string, unknown> | null {
  if (typeof extras !== 'object' || extras === null) return null;
  const dnd = (extras as Record<string, unknown>)['dnd'];
  if (typeof dnd !== 'object' || dnd === null || Array.isArray(dnd)) return null;
  return dnd as Record<string, unknown>;
}

/** "neighbor_01" → { npcId: "neighbor", index: 1 } */
export function parsePathId(id: string): { npcId: string; index: number } | null {
  const m = /^(.+)_(\d+)$/.exec(id);
  if (!m) return null;
  return { npcId: m[1]!, index: Number(m[2]) };
}
