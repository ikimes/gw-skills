import type { SkillDatabase } from "./db.js";
import type { QueryInput } from "./search-params.js";
import type { SearchPresetResponse, SkillSearchResponse } from "./types.js";

type SearchFn = (db: SkillDatabase, input: QueryInput) => SkillSearchResponse;

export function getWeaponDamagePreset(
  db: SkillDatabase,
  input: QueryInput,
  searchSkills: SearchFn,
): SearchPresetResponse {
  const base = presetBaseInput(input);
  const primaryQuery = {
    ...base.query,
    intent: "buff_weapon_damage",
    mechanic: "flat_damage_bonus",
  };
  const primary = searchSkills(db, {
    ...base.raw,
    intent: "buff_weapon_damage",
    mechanic: "flat_damage_bonus",
  });

  const chips = [
    {
      key: "splash_damage",
      label: "Splash Damage",
      query: { ...base.query, intent: "buff_weapon_damage", mechanic: "splash_damage" },
    },
    {
      key: "health_steal",
      label: "Health Steal",
      query: { ...base.query, intent: "buff_weapon_damage", mechanic: "health_steal" },
    },
    {
      key: "arrow_damage_buff",
      label: "Arrow Buffs",
      query: { ...base.query, intent: "arrow_damage_buff" },
    },
    {
      key: "damage_type_conversion",
      label: "Damage Conversion",
      query: { ...base.query, intent: "damage_type_conversion" },
    },
  ].map((chip) => ({
    ...chip,
    total: searchSkills(db, { ...chip.query, limit: "1", offset: "0" }).total,
  }));

  return {
    id: "weapon_damage",
    label: "Weapon Damage",
    description: "Primary results prioritize direct flat weapon or attack damage bonuses. Chips expose related lanes.",
    primary: {
      label: "Flat Damage Bonuses",
      query: primaryQuery,
      total: primary.total,
      limit: primary.limit,
      offset: primary.offset,
      results: primary.results,
    },
    chips,
  };
}

function presetBaseInput(input: QueryInput): {
  raw: QueryInput;
  query: Record<string, string>;
} {
  const keys = ["q", "profession", "attribute", "type", "campaign", "gameMode", "hidePvp", "elite", "pveOnly", "limit", "offset"];
  const raw: QueryInput = {};
  const query: Record<string, string> = {};

  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim().length > 0) {
      raw[key] = value;
      query[key] = value.trim();
    } else if (key === "profession" && Array.isArray(value)) {
      const professions = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      if (professions.length > 0) {
        raw[key] = professions;
        query[key] = professions.map((item) => item.trim()).join(",");
      }
    }
  }

  return { raw, query };
}
