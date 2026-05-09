#!/usr/bin/env node

import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  cleanWikiText,
  dedupeIndexEntries,
  extractTemplates,
  fetchCategoryMembers,
  fetchPageWikitext,
  hasSkillInfobox,
  parseTemplateParams,
  SKILL_INDEX_SCHEMA,
  SkillIndexEntry,
  SkillIndexFile,
  SkillIndexSource,
  sleep,
  slugify,
  wikiTitleUrl,
  writeJson,
} from "./wiki-skill-utils";

const DEFAULT_OUT_DIR = "data/indexes";
const PROFESSIONS = [
  "Assassin",
  "Dervish",
  "Elementalist",
  "Mesmer",
  "Monk",
  "Necromancer",
  "Paragon",
  "Ranger",
  "Ritualist",
  "Warrior",
] as const;

const PVE_ONLY_PAGE = "List of PvE-only skills";
const PVE_TRANSCLUDED_CATEGORIES = ["Anniversary Celebration elite skills"];

type SourceMode = "all" | "professions" | "pve-only";

type CliOptions = {
  source: SourceMode;
  outDir: string;
  validateAll: boolean;
  validatePve: boolean;
  pretty: boolean;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await mkdir(options.outDir, { recursive: true });

  const indexes: SkillIndexFile[] = [];

  if (options.source === "all" || options.source === "professions") {
    for (const profession of PROFESSIONS) {
      const source = professionSource(profession);
      process.stdout.write(`Fetching ${source.title}...\n`);
      indexes.push(await fetchCategoryIndex(source, options.validateAll));
      await sleep(150);
    }
  }

  if (options.source === "all" || options.source === "pve-only") {
    process.stdout.write(`Fetching ${PVE_ONLY_PAGE}...\n`);
    indexes.push(await fetchPveOnlyIndex(options.validateAll || options.validatePve));
  }

  for (const index of indexes) {
    const sourceId = index.sources[0]?.id ?? "skills";
    const outFile = join(options.outDir, `${sourceId}.json`);
    await writeJson(outFile, index, options.pretty);
    process.stdout.write(`Wrote ${index.skills.length} skill candidates to ${outFile}\n`);
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    source: "all",
    outDir: resolve(DEFAULT_OUT_DIR),
    validateAll: false,
    validatePve: true,
    pretty: true,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === "--source" && isSourceMode(next)) {
      options.source = next;
      i += 1;
    } else if (arg === "--out-dir" && next) {
      options.outDir = resolve(next);
      i += 1;
    } else if (arg === "--validate") {
      options.validateAll = true;
    } else if (arg === "--no-validate") {
      options.validateAll = false;
      options.validatePve = false;
    } else if (arg === "--compact") {
      options.pretty = false;
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return options;
}

function isSourceMode(value: string | undefined): value is SourceMode {
  return value === "all" || value === "professions" || value === "pve-only";
}

function printHelpAndExit(): void {
  process.stdout.write(`Guild Wars wiki skill index fetcher

Usage:
  npx tsx tools/fetch-wiki-skill-indexes.ts
  npx tsx tools/fetch-wiki-skill-indexes.ts --source professions
  npx tsx tools/fetch-wiki-skill-indexes.ts --source pve-only --validate

Options:
  --source <mode>    all, professions, or pve-only. Defaults to all.
  --out-dir <dir>    Output directory. Defaults to ./data/indexes.
  --validate         Validate every candidate page with {{Skill infobox}}.
  --no-validate      Skip validation. PvE-only validation is on by default.
  --compact          Write compact JSON.
`);
  process.exit(0);
}

function professionSource(profession: (typeof PROFESSIONS)[number]): SkillIndexSource {
  const category = `${profession} skills`;
  return {
    id: `profession-${slugify(profession)}`,
    kind: "category",
    title: category,
    wiki: wikiTitleUrl(`Category:${category}`),
    category,
    group: "profession",
    profession,
  };
}

async function fetchCategoryIndex(source: SkillIndexSource, validate: boolean): Promise<SkillIndexFile> {
  if (!source.category) {
    throw new Error(`Category source is missing category: ${source.id}`);
  }

  const members = await fetchCategoryMembers(source.category);
  const entries = await membersToEntries(members, source, validate);
  return buildIndex([withCount(source, entries.length)], entries);
}

async function fetchPveOnlyIndex(validate: boolean): Promise<SkillIndexFile> {
  const page = await fetchPageWikitext(PVE_ONLY_PAGE);
  const skillTableSources = extractPveSkillTableSources(page.wikitext);
  const transcludedSources = PVE_TRANSCLUDED_CATEGORIES.map((category) => pveCategorySource(category, page.title));
  const sources = [...skillTableSources, ...transcludedSources];
  const entries: SkillIndexEntry[] = [];

  for (const source of sources) {
    if (!source.category) {
      continue;
    }

    process.stdout.write(`Fetching ${source.category}...\n`);
    const members = await fetchCategoryMembers(source.category);
    entries.push(...(await membersToEntries(members, source, validate)));
    await sleep(150);
  }

  const dedupedEntries = dedupeIndexEntries(entries);
  const countedSources = sources.map((source) => withCount(
    source,
    dedupedEntries.filter((entry) => entry.sources.some((entrySource) => entrySource.id === source.id)).length,
  ));

  return buildIndex([
    {
      id: "list-pve-only-skills",
      kind: "list-page",
      title: page.title,
      page: page.title,
      wiki: wikiTitleUrl(page.title),
      group: "pve-only",
      fetchedAt: new Date().toISOString(),
      count: dedupedEntries.length,
    },
    ...countedSources,
  ], dedupedEntries);
}

function extractPveSkillTableSources(wikitext: string): SkillIndexSource[] {
  return extractTemplates(wikitext, "skill table")
    .map(parseTemplateParams)
    .map((params) => ({
      category: cleanWikiText(params.category ?? "").split("|")[0]?.trim(),
      notcategory: cleanWikiText(params.notcategory ?? ""),
      notcategory2: cleanWikiText(params.notcategory2 ?? ""),
    }))
    .filter((source) => source.category)
    .map((source) => pveCategorySource(
      source.category,
      PVE_ONLY_PAGE,
      [source.notcategory, source.notcategory2].filter(Boolean),
    ));
}

function pveCategorySource(category: string, page: string, filters: string[] = []): SkillIndexSource {
  return {
    id: `pve-${slugify(category)}`,
    kind: "category",
    title: category,
    wiki: wikiTitleUrl(`Category:${category}`),
    category,
    page,
    group: "pve-only",
    filters,
  };
}

async function membersToEntries(
  members: Array<{ pageid: number; ns: number; title: string }>,
  source: SkillIndexSource,
  validate: boolean,
): Promise<SkillIndexEntry[]> {
  const entries: SkillIndexEntry[] = [];

  for (const member of members) {
    if (member.ns !== 0) {
      continue;
    }

    if (validate) {
      process.stdout.write(`Validating ${member.title}...\n`);
      if (!(await safeHasSkillInfobox(member.title))) {
        await sleep(75);
        continue;
      }
      await sleep(75);
    }

    entries.push({
      title: member.title,
      pageId: member.pageid,
      ns: member.ns,
      wiki: wikiTitleUrl(member.title),
      sources: [{
        id: source.id,
        title: source.title,
        kind: source.kind,
        group: source.group,
        profession: source.profession,
        category: source.category,
      }],
    });
  }

  return dedupeIndexEntries(entries);
}

async function safeHasSkillInfobox(title: string): Promise<boolean> {
  try {
    return await hasSkillInfobox(title);
  } catch {
    return false;
  }
}

function buildIndex(sources: SkillIndexSource[], skills: SkillIndexEntry[]): SkillIndexFile {
  return {
    schema: SKILL_INDEX_SCHEMA,
    generatedAt: new Date().toISOString(),
    sources: sources.map((source) => ({
      ...source,
      fetchedAt: source.fetchedAt ?? new Date().toISOString(),
    })),
    skills: dedupeIndexEntries(skills),
  };
}

function withCount(source: SkillIndexSource, count: number): SkillIndexSource {
  return {
    ...source,
    fetchedAt: new Date().toISOString(),
    count,
  };
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
