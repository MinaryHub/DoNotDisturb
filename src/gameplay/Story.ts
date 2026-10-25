import type { DayDef, StoryConfig } from '../core/configSchemas';

// 한 주를 꿰는 이야기 줄기 (data/story.json).
// 게임 이벤트가 이야기 표지를 남기고, 다음 날들의 전화·목표·사람·독백이 표지를 보고 달라진다.
// 표지는 하루 시작 때 함께 저장돼, 그날을 다시 하면 아침의 표지로 돌아간다.

/** 조건(if) 확인: "flag"는 있어야, "!flag"는 없어야 한다. 조건이 없으면 늘 참 */
export function storyAllows(cond: readonly string[] | undefined, flags: ReadonlySet<string>): boolean {
  return (cond ?? []).every((c) => (c.startsWith('!') ? !flags.has(c.slice(1)) : flags.has(c)));
}

/** 이 이벤트가 남기는 표지 (그날 하루로 한정된 표지는 그날만) */
export function marksFor(story: StoryConfig, event: string, dayId: string): string[] {
  return story.marks.filter((m) => m.on === event && (m.day === undefined || m.day === dayId)).flatMap((m) => m.flags);
}

/** 표지에 맞지 않는 전화·목표·사람·소음·안내를 뺀 하루. 빠진 목표를 기다리는 requires도 지운다 */
export function applyStory(day: DayDef, flags: ReadonlySet<string>): DayDef {
  const ok = (x: { if?: string[] }) => storyAllows(x.if, flags);
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

/** 주간 리포트 끝 줄: 줄기마다 조건이 맞는 첫 결말 */
export function epilogueKeys(story: StoryConfig, flags: ReadonlySet<string>): string[] {
  return story.threads.flatMap((t) => {
    const line = story.epilogue.find((e) => e.thread === t.id && storyAllows(e.if, flags));
    return line ? [line.textKey] : [];
  });
}

/** 데이터에 쓰인 조건 중 어떤 이벤트도 남기지 않는 표지 (오타 찾기) */
export function unknownStoryFlags(story: StoryConfig, conds: readonly (readonly string[] | undefined)[]): string[] {
  const known = new Set(story.marks.flatMap((m) => m.flags));
  const out = new Set<string>();
  for (const c of conds) for (const f of c ?? []) if (!known.has(f.replace(/^!/, ''))) out.add(f.replace(/^!/, ''));
  return [...out];
}
