import { ALL_PROFESSIONS, DEFAULT_LIMIT } from "../constants";
import { SearchModes, type SearchMode, type SearchState } from "../types";
import { buildRouteSearchParams } from "./searchParams";

export function readStateFromUrl(): SearchState {
  return parseStateFromSearch(window.location.search);
}

export function parseStateFromSearch(search: string): SearchState {
  const params = new URLSearchParams(search);

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
  const params = buildRouteSearchParams(state);
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
