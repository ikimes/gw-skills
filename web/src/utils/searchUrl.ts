import { ALL_PROFESSIONS, DEFAULT_LIMIT } from "../constants";
import { SearchModes, type SearchMode, type SearchState } from "../types";

export function readStateFromUrl(): SearchState {
  const params = new URLSearchParams(window.location.search);

  return {
    q: params.get("q")?.trim() ?? "",
    professions: parseProfessions(params.getAll("profession")),
    mode: parseMode(params.get("mode")),
    eliteOnly: parseBoolean(params.get("elite")),
    submitted: params.get("browse") === "all",
    limit: parseBoundedInteger(params.get("limit"), DEFAULT_LIMIT, 1, 100),
    offset: parseBoundedInteger(params.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function getDefaultState(): SearchState {
  return {
    q: "",
    professions: [],
    mode: SearchModes.All,
    eliteOnly: false,
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
    !state.eliteOnly
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

  if (state.limit !== DEFAULT_LIMIT) {
    params.set("limit", String(state.limit));
  }

  if (state.offset > 0) {
    params.set("offset", String(state.offset));
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function parseMode(value: string | null): SearchMode {
  return value === SearchModes.PveOnly || value === SearchModes.PvpUsable ? value : SearchModes.All;
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
