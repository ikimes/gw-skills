import { describe, expect, it } from "vitest";

import { DEFAULT_LIMIT } from "../constants";
import { SearchModes, type SearchDraft, type SearchState } from "../types";
import { buildFacetQueryParams, buildRouteSearchParams, buildSkillQueryParams, hasDraftCriteria, hasSearchCriteria, toFacetQueryState } from "./searchParams";
import { buildUrl, parseStateFromSearch } from "./searchUrl";

function state(overrides: Partial<SearchState> = {}): SearchState {
  return {
    q: "",
    professions: [],
    mode: SearchModes.All,
    eliteOnly: false,
    type: undefined,
    attribute: undefined,
    campaign: undefined,
    submitted: false,
    limit: DEFAULT_LIMIT,
    offset: 0,
    ...overrides,
  };
}

describe("search params", () => {
  it("serializes API search params with query, filters, limit, and offset", () => {
    const params = buildSkillQueryParams(state({
      q: " weapon damage ",
      professions: ["Mesmer", "Monk"],
      mode: SearchModes.PveOnly,
      eliteOnly: true,
      type: "Spell",
      attribute: "Domination Magic",
      campaign: "Factions",
      limit: 50,
      offset: 25,
    }));

    expect(params.toString()).toBe(
      "profession=Mesmer%2CMonk&elite=true&type=Spell&attribute=Domination+Magic&campaign=Factions&pveOnly=true&q=weapon+damage&limit=50&offset=25",
    );
  });

  it("serializes facet params without query, limit, or offset", () => {
    const params = buildFacetQueryParams(toFacetQueryState({
      q: "this must not affect facets",
      professions: ["Ritualist"],
      mode: SearchModes.HidePvp,
      eliteOnly: true,
      type: "Weapon Spell",
      attribute: undefined,
      campaign: undefined,
    }));

    expect(params.toString()).toBe("profession=Ritualist&elite=true&type=Weapon+Spell&hidePvp=true");
  });

  it("keeps route mode params distinct from API mode params", () => {
    const route = buildRouteSearchParams(state({
      mode: SearchModes.HidePvp,
      limit: 50,
      submitted: true,
    }));
    const api = buildSkillQueryParams(state({
      mode: SearchModes.HidePvp,
      limit: 50,
      submitted: true,
    }));

    expect(route.toString()).toBe("mode=hide_pvp&limit=50");
    expect(api.toString()).toBe("hidePvp=true&limit=50&offset=0");
  });

  it("serializes browse-all routes without API-only params", () => {
    expect(buildUrl(state({ submitted: true }))).toBe("/?browse=all");
  });

  it("parses route params into search state", () => {
    expect(parseStateFromSearch("?q=touch&profession=Mesmer,Monk&mode=pvp_usable&elite=1&type=Spell&attribute=Fast%20Casting&campaign=Core&limit=500")).toEqual(state({
      q: "touch",
      professions: ["Mesmer", "Monk"],
      mode: SearchModes.HidePvp,
      eliteOnly: true,
      type: "Spell",
      attribute: "Fast Casting",
      campaign: "Core",
      limit: 100,
    }));
  });

  it("detects criteria consistently for submitted state and drafts", () => {
    const draft: SearchDraft = {
      q: "",
      professions: [],
      mode: SearchModes.All,
      eliteOnly: false,
      type: undefined,
      attribute: undefined,
      campaign: undefined,
    };

    expect(hasDraftCriteria(draft)).toBe(false);
    expect(hasSearchCriteria(state({ submitted: true }))).toBe(true);
    expect(hasDraftCriteria({ ...draft, campaign: "Nightfall" })).toBe(true);
  });

  it("does not change facet params when only the query changes", () => {
    const base: SearchDraft = {
      q: "first",
      professions: ["Elementalist"],
      mode: SearchModes.All,
      eliteOnly: false,
      type: "Spell",
      attribute: undefined,
      campaign: undefined,
    };

    expect(buildFacetQueryParams(toFacetQueryState(base)).toString()).toBe(
      buildFacetQueryParams(toFacetQueryState({ ...base, q: "second" })).toString(),
    );
    expect(buildFacetQueryParams(toFacetQueryState({ ...base, type: "Enchantment Spell" })).toString()).not.toBe(
      buildFacetQueryParams(toFacetQueryState(base)).toString(),
    );
  });
});
