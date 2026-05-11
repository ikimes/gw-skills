import type { SkillListResponse } from "../types";

export function mergeSkillResults(
  current: SkillListResponse | null,
  next: SkillListResponse,
  requestOffset: number,
): SkillListResponse {
  if (requestOffset === 0 || !current) {
    return {
      ...next,
      offset: 0,
    };
  }

  const results = [...current.results];
  const seen = new Set(results.map((skill) => skill.pageId));
  for (const skill of next.results) {
    if (!seen.has(skill.pageId)) {
      seen.add(skill.pageId);
      results.push(skill);
    }
  }

  return {
    ...next,
    offset: 0,
    results,
  };
}
