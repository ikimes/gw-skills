import { ALL_PROFESSIONS, DEFAULT_LIMIT } from "../constants";
import { SearchModes, type SearchMode, type SearchState } from "../types";

export function readStateFromUrl(): SearchState {
  const params = new URLSearchParams(window.location.search);

  return {
    q: params.get("q")?.trim() ?? "",
    professions: parseProfessions(params.getAll("profession")),
    mode: parseMode(params.get("mode")),
    eliteOnly: parseBoolean(params.get("elite")),
    type: params.get("type")?.trim() || undefined,
    attribute: params.get("attribute")?.trim() || undefined,
    campaign: params.get("campaign")?.trim() || undefined,
    submitted: params.get("browse") === "all",
    limit: parseBoundedInteger(params.get("limit"), DEFAULT_LIMIT, 1, 100),
    offset: 0,
  };
}

export function getDefaultState(): SearchState {
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
  };
}

export function buildUrl(state: SearchState): string {
  const params = new URLSearchParams();

  if (state.q.trim()) {
    params.set("q", state.q.trim());
  }

  if (
    state.submitted &&
    state.q.trim() === "" &&
    state.professions.length === 0 &&
    state.mode === SearchModes.All &&
    !state.eliteOnly &&
    !state.type &&
    !state.attribute &&
    !state.campaign
  ) {
    params.set("browse", "all");
  }

  if (state.professions.length > 0) {
    params.set("profession", state.professions.join(","));
  }

  if (state.mode !== SearchModes.All) {
    params.set("mode", state.mode);
  }

  if (state.eliteOnly) {
    params.set("elite", "true");
  }

  if (state.type) {
    params.set("type", state.type);
  }

  if (state.attribute) {
    params.set("attribute", state.attribute);
  }

  if (state.campaign) {
    params.set("campaign", state.campaign);
  }

  if (state.limit !== DEFAULT_LIMIT) {
    params.set("limit", String(state.limit));
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function parseMode(value: string | null): SearchMode {
  if (value === SearchModes.PveOnly || value === SearchModes.HidePvp) {
    return value;
  }

  if (value === "pvp_usable") {
    return SearchModes.HidePvp;
  }

  return SearchModes.All;
}

function parseProfessions(values: string[]): string[] {
  const requested = values.flatMap((value) => value.split(",").map((item) => item.trim()));
  return ALL_PROFESSIONS.filter((profession) => requested.includes(profession));
}

function parseBoolean(value: string | null): boolean {
  return value === "true" || value === "1";
}

function parseBoundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = value === null ? fallback : Number(value);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}
