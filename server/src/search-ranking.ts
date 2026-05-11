import type { SkillDatabase } from "./db.js";
import type { SqlParts } from "./search-filters.js";

type RelevanceOrder = {
  expression: string;
  params: Record<string, string>;
};

type SearchMode = "name_first" | "metadata_first" | "effect_first";

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

export function buildFtsQuery(query: string): string {
  const terms = getSearchTerms(query);

  return [...new Set(terms)]
    .map((term) => `${term}*`)
    .join(" ");
}

export function getRequiredConceptPhrase(query: string): string | undefined {
  const normalizedQuery = normalizeSearchPhrase(query);
  return REQUIRED_CONCEPT_PHRASES.has(normalizedQuery) ? normalizedQuery : undefined;
}

export function buildConceptPhraseWhere(phrase: string): { sql: string; params: Record<string, string> } {
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

export function detectSearchMode(db: SkillDatabase, query: string, parts: SqlParts): SearchMode {
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

export function buildRelevanceOrder(query: string, mode: SearchMode): RelevanceOrder {
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

export function normalizeSearchPhrase(query: string): string {
  return getSearchTerms(query).join(" ");
}

function getSearchTerms(query: string): string[] {
  return query
    .toLocaleLowerCase()
    .match(/[a-z0-9]+/g)
    ?.slice(0, 12) ?? [];
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
