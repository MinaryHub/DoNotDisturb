import type { DayDef, StoryConfig } from '../core/configSchemas';

// 한 주를 꿰는 이야기 줄기 (data/story.json).
// 게임 이벤트가 이야기 표지를 남기고, 다음 날들의 전화·목표·사람·독백이 표지를 보고 달라진다.
// 표지는 이름 → 수: 한 번 생긴 표지는 1, 셈(add)은 그때마다 +1 (카페에 들른 날 수 등).
// 표지는 하루 시작 때 함께 저장돼, 그날을 다시 하면 아침의 표지로 돌아간다.

export type StoryState = ReadonlyMap<string, number>;
type StoryMark = StoryConfig['marks'][number];

/** 조건(if) 확인: "flag"는 있어야, "!flag"는 없어야, "count>=N"은 N 이상. 조건이 없으면 늘 참 */
export function storyAllows(cond: readonly string[] | undefined, state: StoryState): boolean {
  return (cond ?? []).every((c) => {
    const ge = /^([\w.]+)>=(\d+)$/.exec(c);
    if (ge) return (state.get(ge[1]!) ?? 0) >= Number(ge[2]);
    return c.startsWith('!') ? !state.get(c.slice(1)) : !!state.get(c);
  });
}

/** 이 이벤트에 걸리는 표지 규칙 (그날 하루로 한정된 규칙은 그날만) */
export function marksFor(story: StoryConfig, event: string, dayId: string): StoryMark[] {
  return story.marks.filter((m) => m.on === event && (m.day === undefined || m.day === dayId));
}

/** 규칙을 표지에 적용한다 */
export function applyMark(state: Map<string, number>, mark: StoryMark): void {
  for (const f of mark.flags ?? []) state.set(f, Math.max(1, state.get(f) ?? 0));
  for (const c of mark.add ?? []) state.set(c, (state.get(c) ?? 0) + 1);
}

/** 표지에 맞지 않는 전화·목표·사람·소음·안내를 뺀 하루. 빠진 목표를 기다리는 requires도 지운다 */
export function applyStory(day: DayDef, state: StoryState): DayDef {
  const ok = (x: { if?: string[] }) => storyAllows(x.if, state);
  const objectives = day.objectives.filter(ok);
  const ids = new Set(objectives.map((o) => o.id));
  return {
    ...day,
    objectives: objectives.map((o) => (o.requires ? { ...o, requires: o.requires.filter((r) => ids.has(r)) } : o)),
    phone: day.phone.filter(ok),
    npcs: day.npcs.filter(ok),
    areaStimuli: day.areaStimuli?.filter(ok),
    notes: day.notes?.filter(ok),
  };
}

/** 주간 리포트 끝 줄: 줄기마다 조건이 맞는 첫 결말 (맞는 줄이 없는 줄기는 건너뛴다) */
export function epilogueKeys(story: StoryConfig, state: StoryState): string[] {
  return story.threads.flatMap((t) => {
    const line = story.epilogue.find((e) => e.thread === t.id && storyAllows(e.if, state));
    return line ? [line.textKey] : [];
  });
}

/** 데이터에 쓰인 조건 중 어떤 이벤트도 남기지 않는 표지 (오타 찾기) */
export function unknownStoryFlags(story: StoryConfig, conds: readonly (readonly string[] | undefined)[]): string[] {
  const known = new Set(story.marks.flatMap((m) => [...(m.flags ?? []), ...(m.add ?? [])]));
  const out = new Set<string>();
  for (const c of conds) {
    for (const f of c ?? []) {
      const name = f.replace(/^!/, '').replace(/>=\d+$/, '');
      if (!known.has(name)) out.add(name);
    }
  }
  return [...out];
}

/** 저장된 표지 (예전 저장은 이름 목록) */
export function storyFromSave(saved: readonly string[] | Record<string, number> | undefined): Map<string, number> {
  if (!saved) return new Map();
  if (Array.isArray(saved)) return new Map(saved.map((f) => [f, 1]));
  return new Map(Object.entries(saved));
}
