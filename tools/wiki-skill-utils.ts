import { readFile, writeFile } from "node:fs/promises";

export const API_URL = "https://wiki.guildwars.com/api.php";
export const WIKI_URL = "https://wiki.guildwars.com/wiki/";
export const USER_AGENT = "gw-skills-tools/0.1 (local data tool; https://wiki.guildwars.com)";
export const SKILL_INDEX_SCHEMA = "gw-skills.skill-index.v1";

export type CategoryMember = {
  pageid: number;
  ns: number;
  title: string;
};

export type SkillIndexSource = {
  id: string;
  kind: "category" | "list-page" | "merged";
  title: string;
  wiki: string;
  category?: string;
  page?: string;
  group?: string;
  profession?: string;
  filters?: string[];
  fetchedAt?: string;
  count?: number;
};

export type SkillIndexEntry = {
  title: string;
  pageId?: number;
  ns: number;
  wiki: string;
  sources: Array<{
    id: string;
    title: string;
    kind: SkillIndexSource["kind"];
    group?: string;
    profession?: string;
    category?: string;
  }>;
};

export type SkillIndexFile = {
  schema: typeof SKILL_INDEX_SCHEMA;
  generatedAt: string;
  sources: SkillIndexSource[];
  skills: SkillIndexEntry[];
};

type WikiApiError = {
  error?: {
    info?: string;
  };
};

type CategoryMembersResponse = WikiApiError & {
  continue?: {
    cmcontinue?: string;
  };
  query?: {
    categorymembers?: CategoryMember[];
  };
};

type ParseWikitextResponse = WikiApiError & {
  parse?: {
    title: string;
    pageid: number;
    wikitext: string;
  };
};

export async function wikiApi<T extends WikiApiError>(params: Record<string, string>): Promise<T> {
  const url = new URL(API_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Wiki API request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as T;
  if (data.error) {
    throw new Error(`Wiki API error: ${data.error.info ?? "unknown error"}`);
  }

  return data;
}

export async function fetchCategoryMembers(category: string): Promise<CategoryMember[]> {
  const members: CategoryMember[] = [];
  let cmcontinue: string | undefined;

  do {
    const data = await wikiApi<CategoryMembersResponse>({
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmlimit: "max",
      format: "json",
      formatversion: "2",
      ...(cmcontinue ? { cmcontinue } : {}),
    });

    members.push(...(data.query?.categorymembers ?? []));
    cmcontinue = data.continue?.cmcontinue;
  } while (cmcontinue);

  return members;
}

export async function fetchPageWikitext(title: string): Promise<{ title: string; pageId: number; wikitext: string }> {
  const data = await wikiApi<ParseWikitextResponse>({
    action: "parse",
    page: title,
    prop: "wikitext",
    redirects: "1",
    format: "json",
    formatversion: "2",
  });

  if (!data.parse) {
    throw new Error(`Wiki page did not return parse data: ${title}`);
  }

  return {
    title: data.parse.title,
    pageId: data.parse.pageid,
    wikitext: data.parse.wikitext,
  };
}

export async function hasSkillInfobox(title: string): Promise<boolean> {
  const page = await fetchPageWikitext(title);
  return extractTemplates(page.wikitext, "Skill infobox").length > 0;
}

export function extractTemplates(wikitext: string, templateName: string): string[] {
  const normalizedName = templateName.toLocaleLowerCase();
  const templates: string[] = [];
  let index = 0;

  while (index < wikitext.length) {
    const start = wikitext.indexOf("{{", index);
    if (start === -1) {
      break;
    }

    const nameStart = start + 2;
    const nameEnd = findTemplateNameEnd(wikitext, nameStart);
    const foundName = wikitext.slice(nameStart, nameEnd).trim().toLocaleLowerCase();

    if (foundName === normalizedName) {
      const template = readBalancedTemplate(wikitext, start);
      templates.push(template);
      index = start + template.length;
    } else {
      index = start + 2;
    }
  }

  return templates;
}

export function parseTemplateParams(template: string): Record<string, string> {
  const inner = template.slice(2, -2);
  const parts = splitTopLevel(inner, "|");
  const params: Record<string, string> = {};

  for (const part of parts.slice(1)) {
    const assignment = splitFirstTopLevel(part, "=");
    if (!assignment) {
      continue;
    }

    const [key, value] = assignment;
    params[key.trim()] = value.trim();
  }

  return params;
}

export function cleanWikiText(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{pipe\}\}/gi, "|")
    .replace(/\{\{gr\|([^|{}]+)\|([^|{}]+)(?:\|([^|{}]*))?\}\}/gi, (_match, start, end, negativeMarker) => {
      const startValue = Number(start);
      const endValue = Number(end);
      const prefix = negativeMarker !== undefined && String(negativeMarker).trim().length > 0 ? "-" : "";
      if (Number.isFinite(startValue) && Number.isFinite(endValue)) {
        const rank12 = Math.round(startValue + ((endValue - startValue) * 12) / 15);
        return `${prefix}${start}...${rank12}...${end}`;
      }
      return `${prefix}${start}...${end}`;
    })
    .replace(/\{\{gr2\|([^|{}]+)\|([^|{}]+)\}\}/gi, (_match, start, end) => `${start}...${end}`)
    .replace(/\{\{grey\|([^{}]+)\}\}/g, "$1")
    .replace(/\{\{sic\}\}/gi, "[sic]")
    .replace(/\{\{sic\|([^{}]+)\}\}/gi, "$1 [sic]")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{([^|{}]+)\|([^{}]+)\}\}/g, "$2")
    .replace(/\{\{([^{}]+)\}\}/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/'''?/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function wikiTitleUrl(title: string): string {
  return `${WIKI_URL}${encodeWikiTitle(title)}`;
}

export function encodeWikiTitle(title: string): string {
  return title.replaceAll(" ", "_").split("/").map(encodeURIComponent).join("/");
}

export function slugify(value: string): string {
  return value
    .replace(/^\+\s*/, "plus ")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLocaleLowerCase();
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

export async function writeJson(file: string, value: unknown, pretty: boolean): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, "utf8");
}

export function dedupeIndexEntries(entries: SkillIndexEntry[]): SkillIndexEntry[] {
  const byTitle = new Map<string, SkillIndexEntry>();

  for (const entry of entries) {
    const key = entry.title.toLocaleLowerCase();
    const existing = byTitle.get(key);

    if (!existing) {
      byTitle.set(key, {
        ...entry,
        sources: [...entry.sources],
      });
      continue;
    }

    existing.pageId ??= entry.pageId;
    existing.sources.push(...entry.sources);
  }

  return [...byTitle.values()]
    .map((entry) => ({
      ...entry,
      sources: dedupeSources(entry.sources),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dedupeSources(sources: SkillIndexEntry["sources"]): SkillIndexEntry["sources"] {
  const seen = new Set<string>();
  const deduped: SkillIndexEntry["sources"] = [];

  for (const source of sources) {
    const key = `${source.id}:${source.category ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(source);
    }
  }

  return deduped;
}

export function findTemplateNameEnd(text: string, start: number): number {
  let i = start;
  while (i < text.length && text[i] !== "|" && text[i] !== "}") {
    i += 1;
  }
  return i;
}

export function readBalancedTemplate(text: string, start: number): string {
  let depth = 0;

  for (let i = start; i < text.length - 1; i += 1) {
    const pair = text.slice(i, i + 2);
    if (pair === "{{") {
      depth += 1;
      i += 1;
    } else if (pair === "}}") {
      depth -= 1;
      i += 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  throw new Error("Unclosed template in wiki text");
}

export function splitTopLevel(text: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let templateDepth = 0;
  let linkDepth = 0;

  for (let i = 0; i < text.length; i += 1) {
    const pair = text.slice(i, i + 2);

    if (pair === "{{") {
      templateDepth += 1;
      current += pair;
      i += 1;
    } else if (pair === "}}") {
      templateDepth = Math.max(0, templateDepth - 1);
      current += pair;
      i += 1;
    } else if (pair === "[[") {
      linkDepth += 1;
      current += pair;
      i += 1;
    } else if (pair === "]]") {
      linkDepth = Math.max(0, linkDepth - 1);
      current += pair;
      i += 1;
    } else if (text[i] === delimiter && templateDepth === 0 && linkDepth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += text[i];
    }
  }

  parts.push(current);
  return parts;
}

export function splitFirstTopLevel(text: string, delimiter: string): [string, string] | undefined {
  let templateDepth = 0;
  let linkDepth = 0;

  for (let i = 0; i < text.length; i += 1) {
    const pair = text.slice(i, i + 2);

    if (pair === "{{") {
      templateDepth += 1;
      i += 1;
    } else if (pair === "}}") {
      templateDepth = Math.max(0, templateDepth - 1);
      i += 1;
    } else if (pair === "[[") {
      linkDepth += 1;
      i += 1;
    } else if (pair === "]]") {
      linkDepth = Math.max(0, linkDepth - 1);
      i += 1;
    } else if (text[i] === delimiter && templateDepth === 0 && linkDepth === 0) {
      return [text.slice(0, i), text.slice(i + 1)];
    }
  }

  return undefined;
}
