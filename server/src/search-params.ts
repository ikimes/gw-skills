import { GameModes } from "./types.js";
import type { GameMode, Pagination, SkillFilters } from "./types.js";

export type QueryInput = Record<string, unknown>;

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

export function parseFilters(input: QueryInput): SkillFilters {
  return {
    profession: parseStringList(input.profession),
    attribute: getStringOrUndefined(input.attribute),
    type: getStringOrUndefined(input.type),
    campaign: getStringOrUndefined(input.campaign),
    gameMode: parseGameMode(input.gameMode),
    hidePvp: parseBoolean(input.hidePvp),
    elite: parseBoolean(input.elite),
    pveOnly: parseBoolean(input.pveOnly),
    intent: normalizeTagInput(input.intent),
    mechanic: normalizeTagInput(input.mechanic),
    appliesTo: normalizeTagInput(input.appliesTo),
    area: normalizeTagInput(input.area),
  };
}

export function parsePagination(input: QueryInput): Pagination {
  return {
    limit: clampInteger(input.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: clampInteger(input.offset, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getStringOrUndefined(value: unknown): string | undefined {
  const text = getString(value);
  return text.length > 0 ? text : undefined;
}

function parseStringList(value: unknown): string[] | undefined {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const normalized = [...new Set(items.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean))];
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeTagInput(value: unknown): string | undefined {
  const text = getString(value)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return text.length > 0 ? text : undefined;
}

function parseGameMode(value: unknown): GameMode | undefined {
  const text = getString(value);
  return text === GameModes.Default || text === GameModes.Pvp || text === GameModes.PveOnly ? text : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === true || value === false) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  if (/^(true|1)$/i.test(value)) {
    return true;
  }

  if (/^(false|0)$/i.test(value)) {
    return false;
  }

  return undefined;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "string" ? Number(value) : typeof value === "number" ? value : fallback;
  if (!Number.isInteger(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}
