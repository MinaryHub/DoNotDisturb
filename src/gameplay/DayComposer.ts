import type { DayDef, DayNpcDef, HappeningDef, HappeningsConfig } from '../core/configSchemas';
import { formatTime, parseTime } from '../sim/DayCycle';
import { applyStory, storyAllows } from './Story';

// 같은 요일이어도 매번 조금 다른 하루 (식상하지 않게).
// 하루 데이터(기본) + 작은 사건 몇 개를 섞어 '오늘의' DayDef를 만든다. 결과는 평범한 DayDef라 나머지 코드는 그대로 읽는다.
// rng가 없으면(테스트 기본값) 변화 없이 기본 하루: 확률 NPC는 빼고, 대안은 기본값, 사건 없음.
// 이야기 표지(flags)는 씨앗과 상관없이 늘 적용한다: 지난 날의 선택이 오늘을 바꾼다.

export interface ComposedDay {
  day: DayDef;
  happenings: HappeningDef[];
}

export function composeDay(def: DayDef, cfg: HappeningsConfig, rng: (() => number) | null, flags: ReadonlySet<string> = new Set()): ComposedDay {
  const base = applyStory(def, flags);
  if (!rng) {
    return { day: { ...base, npcs: base.npcs.filter((n) => n.chance === undefined || n.chance >= 1).map(strip) }, happenings: [] };
  }
  const happenings = pickHappenings(base, cfg, rng);
  const day: DayDef = {
    ...base,
    weather: happenings.reduce<DayDef['weather']>((w, h) => h.setWeather ?? w, base.weather),
    npcs: [],
    phone: [],
    crowdLanes: [...(base.crowdLanes ?? [])],
    areaStimuli: [...(base.areaStimuli ?? [])],
    stalls: [...(base.stalls ?? [])],
    blocked: [...(base.blocked ?? [])],
  };
  const ids = new Set<string>(happenings.flatMap((h) => h.removeNpcs ?? []));
  for (const n of [...base.npcs, ...happenings.flatMap((h) => h.npcs ?? [])]) {
    if (ids.has(n.id) || !storyAllows(n.if, flags)) continue;
    if (n.chance !== undefined && rng() >= n.chance) continue;
    ids.add(n.id);
    day.npcs.push(variantOf(n, rng));
  }
  for (const p of [...base.phone, ...happenings.flatMap((h) => h.phone ?? [])]) {
    if (!storyAllows(p.if, flags)) continue;
    const textKey = p.textKeys?.length ? p.textKeys[Math.floor(rng() * p.textKeys.length)]! : p.textKey;
    let at = p.at;
    if (at && p.jitterMin) at = formatTime(Math.max(0, parseTime(at) + Math.round((rng() * 2 - 1) * p.jitterMin)));
    day.phone.push({ ...p, textKey, at });
  }
  for (const h of happenings) {
    day.crowdLanes!.push(...(h.crowdLanes ?? []));
    // 같은 영역의 소음은 사건 쪽이 덮어쓴다
    for (const a of h.areaStimuli ?? []) {
      day.areaStimuli = day.areaStimuli!.filter((x) => x.area !== a.area);
      day.areaStimuli.push(a);
    }
    day.stalls!.push(...(h.stalls ?? []));
    day.blocked!.push(...(h.blocked ?? []));
  }
  return { day, happenings };
}

/** 오늘 일어날 작은 사건: 조건에 맞는 것 중 확률로, 같은 group은 하나만, 최대 maxPerDay개 */
function pickHappenings(base: DayDef, cfg: HappeningsConfig, rng: () => number): HappeningDef[] {
  const order = cfg.list.map((h) => ({ h, k: rng() })).sort((a, b) => a.k - b.k);
  const picked: HappeningDef[] = [];
  const groups = new Set<string>();
  let weather = base.weather ?? 'clear';
  for (const { h } of order) {
    if (picked.length >= cfg.maxPerDay) break;
    if (h.days && !h.days.includes(base.id)) continue;
    if (h.weather && h.weather !== weather) continue;
    if (h.group && groups.has(h.group)) continue;
    if (rng() >= h.chance) continue;
    picked.push(h);
    if (h.group) groups.add(h.group);
    if (h.setWeather) weather = h.setWeather;
  }
  return picked;
}

function variantOf(n: DayNpcDef, rng: () => number): DayNpcDef {
  const options = [{ at: n.at, path: n.path, from: n.from, to: n.to }, ...(n.alt ?? [])];
  const o = options[Math.floor(rng() * options.length)]!;
  return strip({ ...n, at: o.at, path: o.path, from: o.from, to: o.to });
}

function strip(n: DayNpcDef): DayNpcDef {
  const { alt: _alt, chance: _chance, ...rest } = n;
  return rest;
}
