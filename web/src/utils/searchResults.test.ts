import { describe, expect, it } from "vitest";

import type { SkillListResponse, SummarySkill } from "../types";
import { mergeSkillResults } from "./searchResults";

function skill(pageId: number, name = `Skill ${pageId}`): SummarySkill {
  return {
    name,
    pageId,
    wiki: `https://wiki.guildwars.com/wiki/${name}`,
    elite: false,
    pveOnly: false,
    gameMode: "default",
    cost: {},
    progression: {
      hasProgression: false,
      columns: [],
      ranks: [],
    },
    areas: [],
    semantic: {
      intents: [],
      mechanics: [],
      appliesTo: [],
    },
    categories: [],
    searchText: name,
  };
}

function response(results: SummarySkill[], offset: number): SkillListResponse {
  return {
    total: 4,
    limit: 2,
    offset,
    results,
  };
}

describe("mergeSkillResults", () => {
  it("replaces current results for the first page", () => {
    expect(mergeSkillResults(response([skill(99)], 99), response([skill(1), skill(2)], 0), 0)).toEqual({
      ...response([skill(1), skill(2)], 0),
      offset: 0,
    });
  });

  it("appends unique later-page results", () => {
    const merged = mergeSkillResults(response([skill(1), skill(2)], 0), response([skill(3), skill(4)], 2), 2);

    expect(merged.results.map((item) => item.pageId)).toEqual([1, 2, 3, 4]);
    expect(merged.offset).toBe(0);
  });

  it("ignores duplicate page ids while appending", () => {
    const merged = mergeSkillResults(response([skill(1), skill(2)], 0), response([skill(2), skill(3)], 2), 2);

    expect(merged.results.map((item) => item.pageId)).toEqual([1, 2, 3]);
  });
});
