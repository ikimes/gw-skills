import type { SkillDatabase } from "./db.js";
import { parseSkill } from "./db.js";
import { buildFilterWhere } from "./search-filters.js";
import { getFacets } from "./search-facets.js";
import { getString, parseFilters, parsePagination, type QueryInput } from "./search-params.js";
import { getWeaponDamagePreset as buildWeaponDamagePreset } from "./search-presets.js";
import { buildConceptPhraseWhere, buildFtsQuery, buildRelevanceOrder, detectSearchMode, getRequiredConceptPhrase, normalizeSearchPhrase } from "./search-ranking.js";
import type { SearchPresetResponse, SkillListResponse, SkillSearchResponse, SummarySkill } from "./types.js";

type CuratedSearch = {
  sql: string;
  params: Record<string, string | number>;
};

export { getFacets } from "./search-facets.js";

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
  const pagination = parsePagination(input);
  const filters = parseFilters(input);
  const parts = buildFilterWhere(filters);
  const curatedSearch = getCuratedSearch(query);

  if (curatedSearch) {
    const where = [...parts.where, curatedSearch.sql];
    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const params = { ...parts.params, ...curatedSearch.params };

    const total = db.prepare(`
      SELECT COUNT(*) AS total
      FROM skills s
      ${whereSql}
    `).get(params) as { total: number };

    const rows = db.prepare(`
      SELECT s.json
      FROM skills s
      ${whereSql}
      ORDER BY s.name COLLATE NOCASE
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

  const ftsQuery = buildFtsQuery(query);

  if (!ftsQuery) {
    return {
      query,
      ...listSkills(db, input),
    };
  }

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
  return buildWeaponDamagePreset(db, input, searchSkills);
}

function getCuratedSearch(query: string): CuratedSearch | undefined {
  const normalizedQuery = normalizeSearchPhrase(query);

  if (normalizedQuery === "no progression" || normalizedQuery === "without progression") {
    return {
      sql: "json_extract(s.json, '$.progression.hasProgression') = 0",
      params: {},
    };
  }

  return undefined;
}
