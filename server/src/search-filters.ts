import { GameModes } from "./types.js";
import type { SkillFilters } from "./types.js";

export type SqlParts = {
  where: string[];
  params: Record<string, string | number>;
};

type TextFilterDescriptor = {
  column: "profession" | "attribute" | "type" | "campaign" | "game_mode";
  param: "profession" | "attribute" | "type" | "campaign" | "gameMode";
};

type TagFilterDescriptor = {
  kind: "intent" | "mechanic" | "applies_to" | "area";
  param: "intent" | "mechanic" | "appliesTo" | "area";
};

type BooleanFilterDescriptor = {
  column: "elite" | "pve_only";
};

export const TextFacets = {
  Profession: { column: "profession", param: "profession" },
  Attribute: { column: "attribute", param: "attribute" },
  Type: { column: "type", param: "type" },
  Campaign: { column: "campaign", param: "campaign" },
  GameMode: { column: "game_mode", param: "gameMode" },
} as const satisfies Record<string, TextFilterDescriptor>;

export const TagFacets = {
  Intent: { kind: "intent", param: "intent" },
  Mechanic: { kind: "mechanic", param: "mechanic" },
  AppliesTo: { kind: "applies_to", param: "appliesTo" },
  Area: { kind: "area", param: "area" },
} as const satisfies Record<string, TagFilterDescriptor>;

export const BooleanFacets = {
  Elite: { column: "elite" },
  PveOnly: { column: "pve_only" },
} as const satisfies Record<string, BooleanFilterDescriptor>;

export function buildFilterWhere(filters: SkillFilters): SqlParts {
  const where: string[] = [];
  const params: Record<string, string | number> = {};

  addTextFilter(TextFacets.Profession, filters.profession, where, params);
  addTextFilter(TextFacets.Attribute, filters.attribute, where, params);
  addTextFilter(TextFacets.Type, filters.type, where, params);
  addTextFilter(TextFacets.Campaign, filters.campaign, where, params);
  addTextFilter(TextFacets.GameMode, filters.gameMode, where, params);
  addTagFilter(TagFacets.Intent, filters.intent, where, params);
  addTagFilter(TagFacets.Mechanic, filters.mechanic, where, params);
  addTagFilter(TagFacets.AppliesTo, filters.appliesTo, where, params);
  addTagFilter(TagFacets.Area, filters.area, where, params);

  if (filters.hidePvp) {
    where.push("s.game_mode != @hiddenGameMode");
    params.hiddenGameMode = GameModes.Pvp;
  }

  if (filters.elite !== undefined) {
    where.push("s.elite = @elite");
    params.elite = filters.elite ? 1 : 0;
  }

  if (filters.pveOnly !== undefined) {
    where.push("s.pve_only = @pveOnly");
    params.pveOnly = filters.pveOnly ? 1 : 0;
  }

  return { where, params };
}

export function omitFilters(filters: SkillFilters, keys: Array<keyof SkillFilters>): SkillFilters {
  const next = { ...filters };
  for (const key of keys) {
    delete next[key];
  }
  return next;
}

function addTagFilter(
  descriptor: TagFilterDescriptor,
  value: string | undefined,
  where: string[],
  params: Record<string, string | number>,
): void {
  if (!value) {
    return;
  }

  where.push(`EXISTS (
    SELECT 1
    FROM skill_tags st_${descriptor.param}
    WHERE st_${descriptor.param}.page_id = s.page_id
      AND st_${descriptor.param}.kind = @${descriptor.param}Kind
      AND st_${descriptor.param}.value = @${descriptor.param}
  )`);
  params[`${descriptor.param}Kind`] = descriptor.kind;
  params[descriptor.param] = value;
}

function addTextFilter(
  descriptor: TextFilterDescriptor,
  value: string | string[] | undefined,
  where: string[],
  params: Record<string, string | number>,
): void {
  if (!value) {
    return;
  }

  if (Array.isArray(value)) {
    const values = [...new Set(value.map((item) => item.trim()).filter(Boolean))];
    if (values.length === 0) {
      return;
    }

    if (values.length === 1) {
      where.push(`s.${descriptor.column} = @${descriptor.param}`);
      params[descriptor.param] = values[0];
      return;
    }

    const placeholders = values.map((_, index) => `@${descriptor.param}${index}`);
    where.push(`s.${descriptor.column} IN (${placeholders.join(", ")})`);
    values.forEach((item, index) => {
      params[`${descriptor.param}${index}`] = item;
    });
    return;
  }

  where.push(`s.${descriptor.column} = @${descriptor.param}`);
  params[descriptor.param] = value;
}
