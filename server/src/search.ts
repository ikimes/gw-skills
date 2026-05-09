import type { SkillDatabase } from "./db.js";
import { parseSkill } from "./db.js";
import { GameModes } from "./types.js";
import type { GameMode, Pagination, SearchPresetResponse, SkillFilters, SkillListResponse, SkillSearchResponse, SummarySkill } from "./types.js";

type QueryInput = Record<string, unknown>;

type SqlParts = {
  where: string[];
  params: Record<string, string | number>;
};

type RelevanceOrder = {
  expression: string;
  params: Record<string, string>;
};

type SearchMode = "name_first" | "metadata_first" | "effect_first";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const METADATA_FIRST_QUERIES = new Set([
  "attack",
  "binding ritual",
  "bow attack",
  "chant",
  "dervish enchantment",
  "dual attack",
  "enchantment",
  "enchantment spell",
  "form",
  "glyph",
  "hex",
  "hex spell",
  "item spell",
  "lead attack",
  "off hand attack",
  "preparation",
  "ritual",
  "shout",
  "signet",
  "spell",
  "stance",
  "touch",
  "touch skill",
  "trap",
  "ward spell",
  "weapon spell",
]);
const REQUIRED_CONCEPT_PHRASES = new Set([
  "adrenaline gain",
  "adrenaline loss",
  "armor penetration",
  "condition removal",
  "deep wound",
  "enchantment removal",
  "energy gain",
  "energy loss",
  "health gain",
  "health loss",
  "hex removal",
  "life stealing",
]);

export function listSkills(db: SkillDatabase, input: QueryInput): SkillListResponse {
  const pagination = parsePagination(input);
  const filters = parseFilters(input);
  const parts = buildFilterWhere(filters);
  const whereSql = parts.where.length > 0 ? `WHERE ${parts.where.join(" AND ")}` : "";

  const total = db.prepare(`SELECT COUNT(*) AS total FROM skills s ${whereSql}`).get(parts.params) as { total: number };
  const rows = db.prepare(`
    SELECT s.json
    FROM skills s
    ${whereSql}
    ORDER BY s.name COLLATE NOCASE
    LIMIT @limit OFFSET @offset
  `).all({ ...parts.params, limit: pagination.limit, offset: pagination.offset }) as Array<{ json: string }>;

  return {
    total: total.total,
    limit: pagination.limit,
    offset: pagination.offset,
    results: rows.map(parseSkill),
  };
}

export function searchSkills(db: SkillDatabase, input: QueryInput): SkillSearchResponse {
  const query = getString(input.q);
  const ftsQuery = buildFtsQuery(query);

  if (!ftsQuery) {
    return {
      query,
      ...listSkills(db, input),
    };
  }

  const pagination = parsePagination(input);
  const filters = parseFilters(input);
  const parts = buildFilterWhere(filters);
  const conceptPhrase = getRequiredConceptPhrase(query);
  const conceptWhere = conceptPhrase ? buildConceptPhraseWhere(conceptPhrase) : undefined;
  const where = ["skills_fts MATCH @fts", ...parts.where, ...(conceptWhere ? [conceptWhere.sql] : [])];
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const searchMode = detectSearchMode(db, query, parts);
  const relevance = buildRelevanceOrder(query, searchMode);
  const params = { ...parts.params, ...relevance.params, ...(conceptWhere?.params ?? {}), fts: ftsQuery };

  const total = db.prepare(`
    SELECT COUNT(*) AS total
    FROM skills_fts
    JOIN skills s ON s.page_id = skills_fts.page_id
    ${whereSql}
  `).get(params) as { total: number };

  const rows = db.prepare(`
    SELECT s.json
    FROM skills_fts
    JOIN skills s ON s.page_id = skills_fts.page_id
    ${whereSql}
    ORDER BY ${relevance.expression}, s.name COLLATE NOCASE, bm25(skills_fts)
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: pagination.limit, offset: pagination.offset }) as Array<{ json: string }>;

  return {
    query,
    total: total.total,
    limit: pagination.limit,
    offset: pagination.offset,
    results: rows.map(parseSkill),
  };
}

export function getSkillByPageId(db: SkillDatabase, pageId: number): SummarySkill | undefined {
  const row = db.prepare("SELECT json FROM skills WHERE page_id = ?").get(pageId) as { json: string } | undefined;
  return row ? parseSkill(row) : undefined;
}

export function getWeaponDamagePreset(db: SkillDatabase, input: QueryInput): SearchPresetResponse {
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

export function getFacets(db: SkillDatabase): Record<string, Array<{ value: string | boolean; count: number }>> {
  return {
    profession: textFacet(db, "profession"),
    attribute: textFacet(db, "attribute"),
    type: textFacet(db, "type"),
    campaign: textFacet(db, "campaign"),
    gameMode: textFacet(db, "game_mode"),
    elite: booleanFacet(db, "elite"),
    pveOnly: booleanFacet(db, "pve_only"),
    intent: tagFacet(db, "intent"),
    mechanic: tagFacet(db, "mechanic"),
    appliesTo: tagFacet(db, "applies_to"),
    area: tagFacet(db, "area"),
  };
}

function presetBaseInput(input: QueryInput): {
  raw: QueryInput;
  query: Record<string, string>;
} {
  const keys = ["q", "profession", "attribute", "type", "campaign", "gameMode", "elite", "pveOnly", "limit", "offset"];
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

function buildFilterWhere(filters: SkillFilters): SqlParts {
  const where: string[] = [];
  const params: Record<string, string | number> = {};

  addTextFilter("profession", "profession", filters.profession, where, params);
  addTextFilter("attribute", "attribute", filters.attribute, where, params);
  addTextFilter("type", "type", filters.type, where, params);
  addTextFilter("campaign", "campaign", filters.campaign, where, params);
  addTextFilter("game_mode", "gameMode", filters.gameMode, where, params);
  addTagFilter("intent", "intent", filters.intent, where, params);
  addTagFilter("mechanic", "mechanic", filters.mechanic, where, params);
  addTagFilter("applies_to", "appliesTo", filters.appliesTo, where, params);
  addTagFilter("area", "area", filters.area, where, params);

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

function addTagFilter(
  kind: string,
  param: string,
  value: string | undefined,
  where: string[],
  params: Record<string, string | number>,
): void {
  if (!value) {
    return;
  }

  where.push(`EXISTS (
    SELECT 1
    FROM skill_tags st_${param}
    WHERE st_${param}.page_id = s.page_id
      AND st_${param}.kind = '${kind}'
      AND st_${param}.value = @${param}
  )`);
  params[param] = value;
}

function addTextFilter(
  column: string,
  param: string,
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
      where.push(`s.${column} = @${param}`);
      params[param] = values[0];
      return;
    }

    const placeholders = values.map((_, index) => `@${param}${index}`);
    where.push(`s.${column} IN (${placeholders.join(", ")})`);
    values.forEach((item, index) => {
      params[`${param}${index}`] = item;
    });
    return;
  }

  where.push(`s.${column} = @${param}`);
  params[param] = value;
}

function parseFilters(input: QueryInput): SkillFilters {
  return {
    profession: parseStringList(input.profession),
    attribute: getStringOrUndefined(input.attribute),
    type: getStringOrUndefined(input.type),
    campaign: getStringOrUndefined(input.campaign),
    gameMode: parseGameMode(input.gameMode),
    elite: parseBoolean(input.elite),
    pveOnly: parseBoolean(input.pveOnly),
    intent: normalizeTagInput(input.intent),
    mechanic: normalizeTagInput(input.mechanic),
    appliesTo: normalizeTagInput(input.appliesTo),
    area: normalizeTagInput(input.area),
  };
}

function parsePagination(input: QueryInput): Pagination {
  return {
    limit: clampInteger(input.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: clampInteger(input.offset, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function buildFtsQuery(query: string): string {
  const terms = getSearchTerms(query);

  return [...new Set(terms)]
    .map((term) => `${term}*`)
    .join(" ");
}

function getRequiredConceptPhrase(query: string): string | undefined {
  const normalizedQuery = normalizeSearchPhrase(query);
  return REQUIRED_CONCEPT_PHRASES.has(normalizedQuery) ? normalizedQuery : undefined;
}

function buildConceptPhraseWhere(phrase: string): { sql: string; params: Record<string, string> } {
  const params = {
    conceptPhrase: `%${escapeLike(phrase)}%`,
  };

  return {
    params,
    sql: `(
      lower(skills_fts.description) LIKE @conceptPhrase ESCAPE '\\'
      OR lower(skills_fts.concise_description) LIKE @conceptPhrase ESCAPE '\\'
      OR lower(skills_fts.categories) LIKE @conceptPhrase ESCAPE '\\'
      OR lower(skills_fts.search_text) LIKE @conceptPhrase ESCAPE '\\'
    )`,
  };
}

function detectSearchMode(db: SkillDatabase, query: string, parts: SqlParts): SearchMode {
  const normalizedQuery = normalizeSearchPhrase(query);
  if (!normalizedQuery) {
    return "effect_first";
  }

  const exactNameWhere = [...parts.where, "lower(s.name) = @modeExactName"];
  const exactNameSql = exactNameWhere.length > 0 ? `WHERE ${exactNameWhere.join(" AND ")}` : "";
  const exactName = db.prepare(`
    SELECT 1
    FROM skills s
    ${exactNameSql}
    LIMIT 1
  `).get({ ...parts.params, modeExactName: normalizedQuery }) as unknown;

  if (exactName) {
    return "name_first";
  }

  if (METADATA_FIRST_QUERIES.has(normalizedQuery)) {
    return "metadata_first";
  }

  const terms = getSearchTerms(query).slice(0, 6);
  if (terms.length > 1) {
    const params: Record<string, string | number> = { ...parts.params };
    const nameTermWhere = terms.map((term, index) => {
      params[`modeNameTerm${index}`] = `%${escapeLike(term)}%`;
      return `lower(s.name) LIKE @modeNameTerm${index} ESCAPE '\\'`;
    });
    const where = [...parts.where, ...nameTermWhere];
    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const allNameTerms = db.prepare(`
      SELECT 1
      FROM skills s
      ${whereSql}
      LIMIT 1
    `).get(params) as unknown;

    if (allNameTerms) {
      return "name_first";
    }
  }

  return "effect_first";
}

function buildRelevanceOrder(query: string, mode: SearchMode): RelevanceOrder {
  const normalizedQuery = query.toLocaleLowerCase();
  const terms = getSearchTerms(query).slice(0, 6);
  const phraseEffectMatch = terms.length > 1
    ? `lower(skills_fts.description) LIKE @relevanceContainsName ESCAPE '\\'
      OR lower(skills_fts.concise_description) LIKE @relevanceContainsName ESCAPE '\\'`
    : "0";
  const phraseMetadataMatch = terms.length > 1
    ? `lower(skills_fts.categories) LIKE @relevanceContainsName ESCAPE '\\'`
    : "0";
  const params: Record<string, string> = {
    relevanceExactName: normalizedQuery,
    relevancePrefixName: `${escapeLike(normalizedQuery)}%`,
    relevanceContainsName: `%${escapeLike(normalizedQuery)}%`,
  };

  terms.forEach((term, index) => {
    params[`relevanceTerm${index}`] = `%${escapeLike(term)}%`;
  });

  const allNameTerms = terms.length > 1
    ? terms.map((_, index) => `lower(skills_fts.name) LIKE @relevanceTerm${index} ESCAPE '\\'`).join(" AND ")
    : "0";
  const anyNameTerm = terms.length > 0
    ? terms.map((_, index) => `lower(skills_fts.name) LIKE @relevanceTerm${index} ESCAPE '\\'`).join(" OR ")
    : "0";
  const metadataPhraseMatch = terms.length > 1
    ? `lower(skills_fts.type) LIKE @relevanceContainsName ESCAPE '\\'
      OR lower(skills_fts.categories) LIKE @relevanceContainsName ESCAPE '\\'`
    : `lower(skills_fts.type) LIKE @relevancePrefixName ESCAPE '\\'
      OR lower(skills_fts.categories) LIKE @relevanceContainsName ESCAPE '\\'`;

  if (mode === "metadata_first") {
    return {
      params,
      expression: `CASE
        WHEN ${metadataPhraseMatch} THEN 0
        WHEN ${phraseEffectMatch} THEN 1
        WHEN lower(s.name) = @relevanceExactName THEN 2
        WHEN lower(s.name) LIKE @relevancePrefixName ESCAPE '\\' THEN 3
        WHEN lower(s.name) LIKE @relevanceContainsName ESCAPE '\\' THEN 4
        WHEN ${allNameTerms} THEN 5
        WHEN ${anyNameTerm} THEN 6
        WHEN ${phraseMetadataMatch} THEN 7
        ELSE 8
      END`,
    };
  }

  if (mode === "effect_first") {
    return {
      params,
      expression: `CASE
        WHEN ${phraseEffectMatch} THEN 0
        WHEN ${phraseMetadataMatch} THEN 1
        WHEN lower(s.name) = @relevanceExactName THEN 2
        WHEN lower(s.name) LIKE @relevancePrefixName ESCAPE '\\' THEN 3
        WHEN lower(s.name) LIKE @relevanceContainsName ESCAPE '\\' THEN 4
        WHEN ${allNameTerms} THEN 5
        WHEN ${anyNameTerm} THEN 6
        ELSE 7
      END`,
    };
  }

  return {
    params,
    expression: `CASE
      WHEN lower(s.name) = @relevanceExactName THEN 0
      WHEN lower(s.name) LIKE @relevancePrefixName ESCAPE '\\' THEN 1
      WHEN lower(s.name) LIKE @relevanceContainsName ESCAPE '\\' THEN 2
      WHEN ${phraseEffectMatch} THEN 3
      WHEN ${phraseMetadataMatch} THEN 4
      WHEN ${allNameTerms} THEN 5
      WHEN ${anyNameTerm} THEN 6
      ELSE 7
    END`,
  };
}

function getSearchTerms(query: string): string[] {
  return query
    .toLocaleLowerCase()
    .match(/[a-z0-9]+/g)
    ?.slice(0, 12) ?? [];
}

function normalizeSearchPhrase(query: string): string {
  return getSearchTerms(query).join(" ");
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function getString(value: unknown): string {
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

function textFacet(db: SkillDatabase, column: string): Array<{ value: string; count: number }> {
  return db.prepare(`
    SELECT ${column} AS value, COUNT(*) AS count
    FROM skills
    WHERE ${column} IS NOT NULL AND ${column} != ''
    GROUP BY ${column}
    ORDER BY value COLLATE NOCASE
  `).all() as Array<{ value: string; count: number }>;
}

function booleanFacet(db: SkillDatabase, column: string): Array<{ value: boolean; count: number }> {
  return (db.prepare(`
    SELECT ${column} AS value, COUNT(*) AS count
    FROM skills
    GROUP BY ${column}
    ORDER BY ${column}
  `).all() as Array<{ value: number; count: number }>).map((row) => ({
    value: row.value === 1,
    count: row.count,
  }));
}

function tagFacet(db: SkillDatabase, kind: string): Array<{ value: string; count: number }> {
  return db.prepare(`
    SELECT value, COUNT(*) AS count
    FROM skill_tags
    WHERE kind = ?
    GROUP BY value
    ORDER BY value COLLATE NOCASE
  `).all(kind) as Array<{ value: string; count: number }>;
}
