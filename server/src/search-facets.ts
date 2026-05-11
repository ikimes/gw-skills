import type { SkillDatabase } from "./db.js";
import { BooleanFacets, buildFilterWhere, omitFilters, TagFacets, TextFacets } from "./search-filters.js";
import { parseFilters, type QueryInput } from "./search-params.js";
import type { SkillFilters } from "./types.js";

export function getFacets(db: SkillDatabase, input: QueryInput = {}): Record<string, Array<{ value: string | boolean; count: number }>> {
  const filters = parseFilters(input);

  return {
    profession: textFacet(db, TextFacets.Profession, omitFilters(filters, ["profession"])),
    attribute: textFacet(db, TextFacets.Attribute, omitFilters(filters, ["attribute"])),
    type: textFacet(db, TextFacets.Type, omitFilters(filters, ["type"])),
    campaign: textFacet(db, TextFacets.Campaign, omitFilters(filters, ["campaign"])),
    gameMode: textFacet(db, TextFacets.GameMode, omitFilters(filters, ["gameMode"])),
    elite: booleanFacet(db, BooleanFacets.Elite, omitFilters(filters, ["elite"])),
    pveOnly: booleanFacet(db, BooleanFacets.PveOnly, omitFilters(filters, ["pveOnly"])),
    intent: tagFacet(db, TagFacets.Intent, filters),
    mechanic: tagFacet(db, TagFacets.Mechanic, filters),
    appliesTo: tagFacet(db, TagFacets.AppliesTo, filters),
    area: tagFacet(db, TagFacets.Area, filters),
  };
}

function textFacet(
  db: SkillDatabase,
  descriptor: typeof TextFacets[keyof typeof TextFacets],
  filters?: SkillFilters,
): Array<{ value: string; count: number }> {
  const parts = buildFilterWhere(filters ?? {});
  const where = [...parts.where, `s.${descriptor.column} IS NOT NULL`, `s.${descriptor.column} != ''`];
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  return db.prepare(`
    SELECT s.${descriptor.column} AS value, COUNT(*) AS count
    FROM skills s
    ${whereSql}
    GROUP BY s.${descriptor.column}
    ORDER BY value COLLATE NOCASE
  `).all(parts.params) as Array<{ value: string; count: number }>;
}

function booleanFacet(
  db: SkillDatabase,
  descriptor: typeof BooleanFacets[keyof typeof BooleanFacets],
  filters?: SkillFilters,
): Array<{ value: boolean; count: number }> {
  const parts = buildFilterWhere(filters ?? {});
  const whereSql = parts.where.length > 0 ? `WHERE ${parts.where.join(" AND ")}` : "";

  return (db.prepare(`
    SELECT s.${descriptor.column} AS value, COUNT(*) AS count
    FROM skills s
    ${whereSql}
    GROUP BY s.${descriptor.column}
    ORDER BY s.${descriptor.column}
  `).all(parts.params) as Array<{ value: number; count: number }>).map((row) => ({
    value: row.value === 1,
    count: row.count,
  }));
}

function tagFacet(
  db: SkillDatabase,
  descriptor: typeof TagFacets[keyof typeof TagFacets],
  filters?: SkillFilters,
): Array<{ value: string; count: number }> {
  const parts = buildFilterWhere(filters ?? {});
  const whereSql = parts.where.length > 0 ? `AND ${parts.where.join(" AND ")}` : "";

  return db.prepare(`
    SELECT st.value AS value, COUNT(*) AS count
    FROM skill_tags st
    JOIN skills s ON s.page_id = st.page_id
    WHERE st.kind = @kind
    ${whereSql}
    GROUP BY st.value
    ORDER BY value COLLATE NOCASE
  `).all({ ...parts.params, kind: descriptor.kind }) as Array<{ value: string; count: number }>;
}
