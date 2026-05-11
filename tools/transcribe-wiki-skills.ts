#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { GameModes, type GameMode, type SkillCost } from "../shared/skills.js";
import {
  API_URL,
  cleanWikiText,
  encodeWikiTitle,
  findTemplateNameEnd,
  parseTemplateParams,
  readBalancedTemplate,
  sleep,
  slugify,
  USER_AGENT,
  WIKI_URL,
} from "./wiki-skill-utils.js";

const DEFAULT_OUT_DIR = "data/wiki-skills";
const DEFAULT_INPUT = "data/indexes/skills.seed.json";
const MAX_ATTRIBUTE_RANK = 21;

type CategoryMember = {
  pageid: number;
  ns: number;
  title: string;
};

type SeedFile = {
  schema?: string;
  skills?: Array<{
    title: string;
  }>;
  query?: {
    categorymembers?: CategoryMember[];
  };
};

type TemplateParams = Record<string, string>;

type WikiParseResponse = {
  parse: {
    title: string;
    pageid: number;
    wikitext: string;
    images?: string[];
    categories?: Array<{
      category: string;
      hidden?: boolean;
    }>;
  };
};

type WikiApiResponse = WikiParseResponse & {
  error?: {
    info?: string;
  };
};

type SkillIcon = {
  file: string;
  url: string;
  wiki: string;
  width?: number;
  height?: number;
  mime?: string;
};

type ProgressionColumn = {
  key: string;
  name: string;
  points: Record<string, number | string>;
};

type SkillProgression = {
  attribute?: string;
  columns: ProgressionColumn[];
  ranks?: Array<Record<string, number | string>>;
};

type ExtractedTemplate = {
  name: string;
  body: string;
};

type ProgressionSource = {
  name?: string;
  attribute?: string;
  description?: string;
  conciseDescription?: string;
};

type WikiSkill = {
  name: string;
  pageId: number;
  wiki: string;
  fetchedAt: string;
  source: {
    title: string;
    seedFile?: string;
    categories: string[];
  };
  profession?: string;
  attribute?: string;
  type?: string;
  campaign?: string;
  icon?: SkillIcon;
  elite: boolean;
  pveOnly: boolean;
  gameMode: GameMode;
  cost: SkillCost;
  description?: string;
  conciseDescription?: string;
  target?: string;
  progression?: SkillProgression;
  wikiFields: Record<string, string | number | boolean | null>;
};

type ReportIssue = {
  severity: "info" | "warning";
  code: string;
  title: string;
  name?: string;
  pageId?: number;
  message: string;
};

type ReportFailure = {
  title: string;
  seedFile?: string;
  error: string;
};

type TranscriptionReport = {
  schema: "gw-skills.transcription-report.v1";
  generatedAt: string;
  input: {
    skill?: string;
    input?: string;
    outDir: string;
    seedCount: number;
  };
  output: {
    canonical: string;
    report: string;
  };
  totals: {
    seeds: number;
    transcribed: number;
    failed: number;
    issues: number;
    warnings: number;
    infos: number;
    missingIcons: number;
    missingProgression: number;
  };
  failures: ReportFailure[];
  issues: ReportIssue[];
};

type ImageInfoResponse = {
  query?: {
    pages?: Array<{
      title: string;
      imageinfo?: Array<{
        width?: number;
        height?: number;
        url?: string;
        descriptionurl?: string;
        mime?: string;
      }>;
    }>;
  };
  error?: {
    info?: string;
  };
};

type CliOptions = {
  skill?: string;
  input?: string;
  outDir: string;
  pretty: boolean;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const seeds = await getSeeds(options);

  if (seeds.length === 0) {
    throw new Error("No skill pages found. Pass --skill, --input, or run from a folder with *_skills.json seed files.");
  }

  await mkdir(options.outDir, { recursive: true });

  const results: WikiSkill[] = [];
  const failures: ReportFailure[] = [];
  for (const seed of seeds) {
    process.stdout.write(`Fetching ${seed.title}...\n`);
    try {
      const skill = await fetchAndTranscribeSkill(seed.title, seed.seedFile);
      results.push(skill);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({
        title: seed.title,
        seedFile: seed.seedFile,
        error: message,
      });
      process.stderr.write(`Failed ${seed.title}: ${message}\n`);
    }
    await sleep(150);
  }

  results.sort((a, b) => a.name.localeCompare(b.name));

  const outputBase = options.skill && results[0] ? slugify(results[0].name) : "skills";
  const canonicalFile = join(options.outDir, options.skill ? `${outputBase}.json` : "skills.canonical.json");
  const reportFile = join(options.outDir, options.skill ? `${outputBase}.report.json` : "skills.report.json");
  const issues = results.flatMap((skill) => buildReportIssues(skill));
  const report = buildReport(options, seeds.length, canonicalFile, reportFile, results, failures, issues);

  await writeJson(canonicalFile, results, options.pretty);
  await writeJson(reportFile, report, options.pretty);

  process.stdout.write(`Wrote ${results.length} skill${results.length === 1 ? "" : "s"} to ${canonicalFile}\n`);
  process.stdout.write(`Wrote transcription report to ${reportFile}\n`);

  if (results.length === 0 && failures.length > 0) {
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    outDir: DEFAULT_OUT_DIR,
    pretty: true,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === "--skill" && next) {
      options.skill = next;
      i += 1;
    } else if (arg === "--input" && next) {
      options.input = next;
      i += 1;
    } else if (arg === "--out-dir" && next) {
      options.outDir = next;
      i += 1;
    } else if (arg === "--compact") {
      options.pretty = false;
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  options.outDir = resolve(options.outDir);
  return options;
}

function printHelpAndExit(): void {
  process.stdout.write(`Guild Wars wiki skill transcription

Usage:
  npx tsx tools/transcribe-wiki-skills.ts --skill "Brutal Weapon"
  npx tsx tools/transcribe-wiki-skills.ts --input ritualist_skills.json
  npx tsx tools/transcribe-wiki-skills.ts --input data/indexes/skills.seed.json
  npx tsx tools/transcribe-wiki-skills.ts

Options:
  --skill <title>     Fetch one wiki skill page.
  --input <file>      Read one categorymembers JSON file or merged skill seed.
                      Defaults to ./data/indexes/skills.seed.json.
  --out-dir <dir>     Output directory. Defaults to ./data/wiki-skills.
  --compact           Write compact JSON.

Outputs:
  Multi-skill runs write skills.canonical.json and skills.report.json.
  Single-skill runs write <skill-slug>.json and <skill-slug>.report.json.
`);
  process.exit(0);
}

async function writeJson(file: string, value: unknown, pretty: boolean): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`, "utf8");
}

function buildReport(
  options: CliOptions,
  seedCount: number,
  canonicalFile: string,
  reportFile: string,
  results: WikiSkill[],
  failures: ReportFailure[],
  issues: ReportIssue[],
): TranscriptionReport {
  return {
    schema: "gw-skills.transcription-report.v1",
    generatedAt: new Date().toISOString(),
    input: {
      skill: options.skill,
      input: toReportPath(options.input),
      outDir: toReportPath(options.outDir),
      seedCount,
    },
    output: {
      canonical: toReportPath(canonicalFile),
      report: toReportPath(reportFile),
    },
    totals: {
      seeds: seedCount,
      transcribed: results.length,
      failed: failures.length,
      issues: issues.length,
      warnings: issues.filter((issue) => issue.severity === "warning").length,
      infos: issues.filter((issue) => issue.severity === "info").length,
      missingIcons: issues.filter((issue) => issue.code === "missing_icon").length,
      missingProgression: issues.filter((issue) => issue.code === "missing_progression").length,
    },
    failures,
    issues: issues.sort((a, b) => a.title.localeCompare(b.title) || a.code.localeCompare(b.code)),
  };
}

function toReportPath(file?: string): string | undefined {
  if (!file) {
    return undefined;
  }

  const absolutePath = resolve(file);
  const relativePath = relative(process.cwd(), absolutePath);

  if (relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return relativePath.replaceAll("\\", "/");
  }

  return file.replaceAll("\\", "/");
}

function buildReportIssues(skill: WikiSkill): ReportIssue[] {
  const issues: ReportIssue[] = [];
  const add = (issue: Omit<ReportIssue, "title" | "name" | "pageId">): void => {
    issues.push({
      title: skill.source.title,
      name: skill.name,
      pageId: skill.pageId,
      ...issue,
    });
  };

  if (!skill.icon) {
    add({
      severity: "warning",
      code: "missing_icon",
      message: "No skill icon image was resolved from the wiki page images.",
    });
  }

  if (!skill.progression || skill.progression.columns.length === 0) {
    add({
      severity: "info",
      code: "missing_progression",
      message: "No skill progression table was found. This can be normal for fixed-value skills.",
    });
  }

  if (!skill.description) {
    add({
      severity: "warning",
      code: "missing_description",
      message: "The skill infobox did not include a description.",
    });
  }

  if (!skill.conciseDescription) {
    add({
      severity: "info",
      code: "missing_concise_description",
      message: "The skill infobox did not include a concise description.",
    });
  }

  if (!skill.profession) {
    add({
      severity: skill.pveOnly ? "info" : "warning",
      code: "missing_profession",
      message: skill.pveOnly
        ? "The skill infobox did not include a profession. This can be normal for PvE-only common or title-rank skills."
        : "The skill infobox did not include a profession.",
    });
  }

  if (skill.attribute === "No Attribute") {
    add({
      severity: "info",
      code: "no_attribute_skill",
      message: "This skill is categorized as a No Attribute skill.",
    });
  } else if (!skill.attribute) {
    add({
      severity: "info",
      code: "missing_attribute",
      message: "The skill infobox did not include an attribute. This can be normal for No Attribute, special, or PvE-only skills.",
    });
  }

  if (!skill.type) {
    add({
      severity: "warning",
      code: "missing_type",
      message: "The skill infobox did not include a skill type.",
    });
  }

  if (Object.keys(skill.cost).length === 0) {
    add({
      severity: "info",
      code: "missing_cost",
      message: "No energy, adrenaline, upkeep, activation, recharge, or sacrifice cost was found.",
    });
  }

  if (skill.gameMode === "pvp") {
    add({
      severity: "info",
      code: "pvp_variant",
      message: "This page appears to be a PvP variant.",
    });
  }

  if (skill.pveOnly) {
    add({
      severity: "info",
      code: "pve_only",
      message: "This skill is marked as PvE-only.",
    });
  }

  return issues;
}

async function getSeeds(options: CliOptions): Promise<Array<{ title: string; seedFile?: string }>> {
  if (options.skill) {
    return [{ title: options.skill }];
  }

  if (options.input) {
    return readSeedFile(options.input);
  }

  try {
    return await readSeedFile(DEFAULT_INPUT);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  const files = (await readdir(process.cwd()))
    .filter((file) => file.endsWith("_skills.json"))
    .sort();

  const nestedSeeds = await Promise.all(files.map((file) => readSeedFile(file)));
  return dedupeSeeds(nestedSeeds.flat());
}

async function readSeedFile(file: string): Promise<Array<{ title: string; seedFile: string }>> {
  const text = await readFile(file, "utf8");
  const data = JSON.parse(text) as SeedFile;
  if (Array.isArray(data.skills)) {
    return data.skills
      .filter((skill) => skill.title)
      .map((skill) => ({
        title: skill.title,
        seedFile: basename(file),
      }));
  }

  const members = data.query?.categorymembers ?? [];

  return members
    .filter((member) => member.ns === 0)
    .map((member) => ({
      title: member.title,
      seedFile: basename(file),
    }));
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "ENOENT";
}

function dedupeSeeds(seeds: Array<{ title: string; seedFile?: string }>): Array<{ title: string; seedFile?: string }> {
  const seen = new Set<string>();
  const deduped: Array<{ title: string; seedFile?: string }> = [];

  for (const seed of seeds) {
    const key = seed.title.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(seed);
    }
  }

  return deduped;
}

async function fetchAndTranscribeSkill(title: string, seedFile?: string): Promise<WikiSkill> {
  let data = await fetchWikiParse(title);
  if (isMissingPageError(data) && !isQuotedTitle(title)) {
    data = await fetchWikiParse(`"${title}"`);
  }

  if (data.error) {
    throw new Error(`Wiki API error for ${title}: ${data.error.info ?? "unknown error"}`);
  }

  const icon = await fetchSkillIcon(data);
  return transcribeSkill(data, seedFile, icon);
}

async function fetchWikiParse(title: string): Promise<WikiApiResponse> {
  const url = new URL(API_URL);
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", title);
  url.searchParams.set("prop", "wikitext|categories|images");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("redirects", "1");

  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${title}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as WikiApiResponse;
}

async function fetchSkillIcon(data: WikiParseResponse): Promise<SkillIcon | undefined> {
  const file = selectSkillIconFile(data.parse.images ?? [], data.parse.title);
  if (!file) {
    return undefined;
  }

  const url = new URL(API_URL);
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", `File:${file}`);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|size");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch icon ${file}: ${response.status} ${response.statusText}`);
  }

  const imageData = (await response.json()) as ImageInfoResponse;
  if (imageData.error) {
    throw new Error(`Wiki API error for icon ${file}: ${imageData.error.info ?? "unknown error"}`);
  }

  const image = imageData.query?.pages?.[0]?.imageinfo?.[0];
  if (!image?.url) {
    return undefined;
  }

  return {
    file,
    url: image.url,
    wiki: image.descriptionurl ?? `${WIKI_URL}File:${encodeWikiTitle(file)}`,
    width: image.width,
    height: image.height,
    mime: image.mime,
  };
}

function selectSkillIconFile(images: string[], title: string): string | undefined {
  const imageFiles = images.filter((image) => /\.(jpe?g|png)$/i.test(image));
  const titleKey = normalizeImageKey(title);
  const exact = imageFiles.find((image) => normalizeImageKey(stripExtension(image)) === titleKey);

  return exact ?? imageFiles.find((image) => !/^Tango-/i.test(image));
}

function stripExtension(file: string): string {
  return file.replace(/\.[^.]+$/, "");
}

function normalizeImageKey(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function isMissingPageError(data: WikiApiResponse): boolean {
  return /doesn't exist/i.test(data.error?.info ?? "");
}

function isQuotedTitle(title: string): boolean {
  return title.startsWith("\"") && title.endsWith("\"");
}

function transcribeSkill(data: WikiParseResponse, seedFile?: string, icon?: SkillIcon): WikiSkill {
  const wikitext = data.parse.wikitext;
  const infoboxTemplate = extractTemplate(wikitext, "Skill infobox");
  if (!infoboxTemplate) {
    throw new Error(`Page ${data.parse.title} does not contain {{Skill infobox}}`);
  }

  const infobox = parseTemplateParams(infoboxTemplate);
  const categories = (data.parse.categories ?? [])
    .filter((category) => !category.hidden)
    .map((category) => category.category.replaceAll("_", " "))
    .sort();

  const name = cleanWikiText(infobox.name ?? data.parse.title);
  const type = normalizeType(cleanOptional(infobox.type));
  const attribute = normalizeAttribute(cleanOptional(infobox.attribute), categories);
  const pveOnly = isPveOnly(type, categories, infobox);
  const gameMode = getGameMode(name, data.parse.title, categories, pveOnly);
  const progressionTemplates = extractTemplatesByPrefix(wikitext, "Skill progression");
  const progression = (
    progressionTemplates.length > 0
      ? mergeProgressions(progressionTemplates.map(parseProgression))
      : parseRawProgression(wikitext, {
        name,
        attribute,
        description: cleanOptional(infobox.description),
        conciseDescription: cleanOptional(infobox["concise description"]),
      })
  );

  return {
    name,
    pageId: data.parse.pageid,
    wiki: `${WIKI_URL}${encodeWikiTitle(data.parse.title)}`,
    fetchedAt: new Date().toISOString(),
    source: {
      title: data.parse.title,
      seedFile,
      categories,
    },
    profession: cleanOptional(infobox.profession),
    attribute,
    type,
    campaign: cleanOptional(infobox.campaign),
    icon,
    elite: isElite(type, categories),
    pveOnly,
    gameMode,
    cost: parseCost(infobox),
    description: cleanOptional(infobox.description),
    conciseDescription: cleanOptional(infobox["concise description"]),
    target: cleanOptional(infobox.target),
    progression,
    wikiFields: serializeWikiFields(infobox),
  };
}

function extractTemplate(wikitext: string, templateName: string): string | undefined {
  return extractTemplateWithPredicate(wikitext, (foundName) => foundName === templateName.toLocaleLowerCase())?.body;
}

function extractTemplatesByPrefix(wikitext: string, templateNamePrefix: string): ExtractedTemplate[] {
  const normalizedPrefix = templateNamePrefix.toLocaleLowerCase();
  return extractTemplatesWithPredicate(wikitext, (foundName) => foundName.startsWith(normalizedPrefix));
}

function extractTemplateWithPredicate(
  wikitext: string,
  matches: (templateName: string) => boolean,
): ExtractedTemplate | undefined {
  return extractTemplatesWithPredicate(wikitext, matches)[0];
}

function extractTemplatesWithPredicate(
  wikitext: string,
  matches: (templateName: string) => boolean,
): ExtractedTemplate[] {
  const templates: ExtractedTemplate[] = [];
  let index = 0;

  while (index < wikitext.length) {
    const start = wikitext.indexOf("{{", index);
    if (start === -1) {
      break;
    }

    const nameStart = start + 2;
    const nameEnd = findTemplateNameEnd(wikitext, nameStart);
    const foundName = wikitext.slice(nameStart, nameEnd).trim().toLocaleLowerCase();

    if (matches(foundName)) {
      const body = readBalancedTemplate(wikitext, start);
      templates.push({
        name: foundName,
        body,
      });
      index = start + body.length;
      continue;
    }

    index = start + 2;
  }

  return templates;
}

function parseProgression(template: ExtractedTemplate): SkillProgression {
  const params = parseTemplateParams(template.body);
  const columns: ProgressionColumn[] = [];
  const variableIndexes = [...new Set(
    Object.keys(params)
      .map((key) => key.match(/^var(\d+)\s+name$/)?.[1])
      .filter((value): value is string => value !== undefined)
      .map(Number),
  )].sort((a, b) => a - b);

  for (const index of variableIndexes) {
    const prefix = `var${index}`;
    const name = params[`${prefix} name`];
    if (!name) {
      continue;
    }

    const points: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(params)) {
      const match = key.match(new RegExp(`^${prefix} at(\\d+)$`));
      if (match) {
      points[match[1]] = parseNumberOrString(value);
      }
    }

    columns.push({
      key: toKey(cleanWikiText(name)),
      name: cleanWikiText(name),
      points,
    });
  }

  const progression: SkillProgression = {
    attribute: cleanOptional(params.attribute ?? params["title track"]),
    columns,
  };

  const ranks = buildProgressionRanks(columns, getProgressionMaxRank(template.name));
  if (ranks.length > 0) {
    progression.ranks = ranks;
  }

  return progression;
}

function mergeProgressions(progressions: SkillProgression[]): SkillProgression | undefined {
  const candidates = progressions.filter((progression) => progression.columns.length > 0);
  if (candidates.length === 0) {
    return undefined;
  }

  const attribute = candidates.find((progression) => progression.attribute)?.attribute;
  const columnMap = new Map<string, ProgressionColumn>();
  const rankMap = new Map<number, Record<string, number | string>>();

  for (const progression of candidates) {
    for (const column of progression.columns) {
      if (!columnMap.has(column.key)) {
        columnMap.set(column.key, column);
      }
    }

    for (const rank of progression.ranks ?? []) {
      const rankNumber = typeof rank.rank === "number" ? rank.rank : Number(rank.rank);
      if (!Number.isFinite(rankNumber)) {
        continue;
      }

      const existing = rankMap.get(rankNumber) ?? { rank: rankNumber };
      for (const [key, value] of Object.entries(rank)) {
        if (key !== "rank") {
          existing[key] = value;
        }
      }
      rankMap.set(rankNumber, existing);
    }
  }

  const columns = [...columnMap.values()];
  const ranks = [...rankMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, rank]) => rank);

  return {
    attribute,
    columns,
    ranks,
  };
}

function parseRawProgression(wikitext: string, source: ProgressionSource): SkillProgression | undefined {
  const progressionSection = extractSection(wikitext, "Progression");
  const table = progressionSection ? extractFirstWikiTable(progressionSection) : findProgressionTable(wikitext);
  const tableProgression = table ? parseRawProgressionTable(table, source.attribute) : undefined;
  if (tableProgression && tableProgression.columns.length > 0) {
    return tableProgression;
  }

  return inferProgressionFromDescription(source);
}

function extractSection(wikitext: string, heading: string): string | undefined {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = wikitext.match(new RegExp(`==\\s*${escapedHeading}\\s*==\\s*([\\s\\S]*?)(?=\\n==[^=]+==|$)`, "i"));
  return match?.[1];
}

function extractFirstWikiTable(text: string): string | undefined {
  return extractWikiTables(text)[0];
}

function extractWikiTables(text: string): string[] {
  const tables: string[] = [];
  if (text.indexOf("{|") === -1) {
    return tables;
  }

  let searchIndex = 0;
  while (searchIndex < text.length) {
    const tableStart = text.indexOf("{|", searchIndex);
    if (tableStart === -1) {
      break;
    }

    let depth = 0;
    let foundEnd = -1;
    for (let index = tableStart; index < text.length - 1; index += 1) {
      const pair = text.slice(index, index + 2);
      if (pair === "{|") {
        depth += 1;
        index += 1;
      } else if (pair === "|}") {
        depth -= 1;
        index += 1;
        if (depth === 0) {
          foundEnd = index + 1;
          tables.push(text.slice(tableStart, foundEnd));
          searchIndex = foundEnd;
          break;
        }
      }
    }

    if (foundEnd === -1) {
      break;
    }
  }

  return tables;
}

function findProgressionTable(wikitext: string): string | undefined {
  return extractWikiTables(wikitext).find((table) => (
    /skill-progression/i.test(table)
    || /'''Progression'''/i.test(table)
    || /! colspan="2" \| Progression/i.test(table)
  ));
}

function parseRawProgressionTable(table: string, fallbackAttribute?: string): SkillProgression | undefined {
  if (table.includes("class=\"skill-progression\"")) {
    return parseDivProgressionTable(table, fallbackAttribute);
  }

  if (table.includes("'''Progression'''")) {
    return parseSimpleProgressionTable(table, fallbackAttribute);
  }

  return undefined;
}

function parseDivProgressionTable(table: string, fallbackAttribute?: string): SkillProgression | undefined {
  const columnsStart = table.indexOf("<div class=\"column\"");
  if (columnsStart === -1) {
    return undefined;
  }

  const leftPart = table.slice(0, columnsStart);
  const columnBlocks = extractClassDivBlocks(table, "column");
  if (columnBlocks.length === 0) {
    return undefined;
  }

  const attributeMatches = [...leftPart.matchAll(/<div class="attr">([\s\S]*?)<\/div>/g)];
  const labelMatches = [...leftPart.matchAll(/<div class="var">([\s\S]*?)<\/div>/g)];
  const attribute = cleanOptional(attributeMatches[0]?.[1]) ?? fallbackAttribute;
  const columns = labelMatches.map((match) => ({
    key: toKey(cleanWikiText(match[1])),
    name: cleanWikiText(match[1]),
    points: {},
  }));

  const ranks: Array<Record<string, number | string>> = [];
  for (const block of columnBlocks) {
    const rankMatch = block.match(/<div class="attr">([\s\S]*?)<\/div>/);
    const rank = Number(cleanWikiText(rankMatch?.[1] ?? ""));
    if (!Number.isFinite(rank)) {
      continue;
    }

    const values = [...block.matchAll(/<div class="var">([\s\S]*?)<\/div>/g)];
    const row: Record<string, number | string> = { rank };
    values.forEach((match, index) => {
      const column = columns[index];
      if (column) {
        row[column.key] = parseNumberOrString(cleanWikiText(match[1]));
      }
    });
    ranks.push(row);
  }

  return columns.length > 0 && ranks.length > 0 ? { attribute, columns, ranks } : undefined;
}

function extractClassDivBlocks(text: string, className: string): string[] {
  const blocks: string[] = [];
  const marker = `<div class="${className}"`;
  let index = 0;

  while (index < text.length) {
    const start = text.indexOf(marker, index);
    if (start === -1) {
      break;
    }

    let depth = 0;
    for (let cursor = start; cursor < text.length; cursor += 1) {
      if (text.startsWith("<div", cursor)) {
        depth += 1;
      } else if (text.startsWith("</div>", cursor)) {
        depth -= 1;
        cursor += "</div>".length - 1;
        if (depth === 0) {
          blocks.push(text.slice(start, cursor + 1));
          index = cursor + 1;
          break;
        }
      }
    }

    if (index <= start) {
      break;
    }
  }

  return blocks;
}

function parseSimpleProgressionTable(table: string, fallbackAttribute?: string): SkillProgression | undefined {
  const lines = table.split("\n").map((line) => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) => line.startsWith("!"));
  if (headerIndex === -1 || headerIndex + 1 >= lines.length) {
    return undefined;
  }

  const attribute = cleanOptional(lines[headerIndex].replace(/^!\s*/, "")) ?? fallbackAttribute;
  const rankValues = parseTableCells(lines[headerIndex + 1]).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (rankValues.length === 0) {
    return undefined;
  }

  const columns: ProgressionColumn[] = [];
  const rowValues: string[][] = [];

  for (let index = headerIndex + 2; index < lines.length - 1; index += 1) {
    if (!lines[index].startsWith("!")) {
      continue;
    }

    const label = cleanOptional(lines[index].replace(/^!\s*/, ""));
    const valuesLine = lines[index + 1];
    if (!label || !valuesLine?.startsWith("|")) {
      continue;
    }

    columns.push({
      key: toKey(label),
      name: label,
      points: {},
    });
    rowValues.push(parseTableCells(valuesLine));
    index += 1;
  }

  const ranks = rankValues.map((rank, rankIndex) => {
    const row: Record<string, number | string> = { rank };
    columns.forEach((column, columnIndex) => {
      row[column.key] = parseNumberOrString(rowValues[columnIndex]?.[rankIndex] ?? "");
    });
    return row;
  });

  return columns.length > 0 ? { attribute, columns, ranks } : undefined;
}

function parseTableCells(line: string): string[] {
  return line
    .replace(/^[|!]\s*/, "")
    .split("||")
    .map((cell) => cleanWikiText(cell.replace(/^([|!])\s*/, "").replace(/'''/g, "").trim()))
    .filter(Boolean);
}

function inferProgressionFromDescription(source: ProgressionSource): SkillProgression | undefined {
  const description = `${source.description ?? ""} ${source.conciseDescription ?? ""}`.toLocaleLowerCase();
  const maxRank = source.attribute ? getTrackMaxRank(source.attribute) : undefined;

  if (!maxRank) {
    return undefined;
  }

  if (/one additional foe .* for each rank/.test(description)) {
    return {
      attribute: source.attribute,
      columns: [
        {
          key: "additional_foes_hit",
          name: "Additional foes hit",
          points: {},
        },
      ],
      ranks: Array.from({ length: maxRank + 1 }, (_, rank) => ({
        rank,
        additional_foes_hit: rank,
      })),
    };
  }

  return undefined;
}

function getTrackMaxRank(attribute: string): number | undefined {
  const normalized = attribute.toLocaleLowerCase();
  if (normalized === "lightbringer rank") {
    return 8;
  }

  if (normalized.endsWith("rank")) {
    return 10;
  }

  return undefined;
}

function getProgressionMaxRank(templateName: string): number {
  const explicitMax = templateName.match(/\bmax(\d+)\b/i)?.[1];
  if (explicitMax) {
    return Number(explicitMax);
  }

  return MAX_ATTRIBUTE_RANK;
}

function buildProgressionRanks(columns: ProgressionColumn[], maxRank: number): Array<Record<string, number | string>> {
  if (columns.length === 0) {
    return [];
  }

  return Array.from({ length: maxRank + 1 }, (_, rank) => {
    const row: Record<string, number | string> = { rank };

    for (const column of columns) {
      row[column.key] = interpolateProgressionValue(column.points, rank);
    }

    return row;
  });
}

function interpolateProgressionValue(points: Record<string, number | string>, rank: number): number | string {
  if (Object.prototype.hasOwnProperty.call(points, String(rank))) {
    return points[String(rank)];
  }

  const numericPoints: Array<[number, number]> = Object.entries(points)
    .flatMap(([pointRank, value]) => (typeof value === "number" ? [[Number(pointRank), value] as [number, number]] : []))
    .sort(([a], [b]) => a - b);

  if (numericPoints.length < 2) {
    return numericPoints[0]?.[1] ?? "";
  }

  let lower = [...numericPoints].reverse().find(([pointRank]) => pointRank <= rank);
  let upper = numericPoints.find(([pointRank]) => pointRank >= rank);

  if (!lower) {
    [lower, upper] = [numericPoints[0], numericPoints[1]];
  } else if (!upper) {
    [lower, upper] = [numericPoints[numericPoints.length - 2], numericPoints[numericPoints.length - 1]];
  }

  if (lower[0] === upper[0]) {
    return lower[1];
  }

  const ratio = (rank - lower[0]) / (upper[0] - lower[0]);
  return Math.round(lower[1] + (upper[1] - lower[1]) * ratio);
}

function parseCost(params: TemplateParams): SkillCost {
  return compactObject({
    energy: parseNumberOrString(params.energy),
    adrenaline: parseNumberOrString(params.adrenaline),
    upkeep: parseNumberOrString(params.upkeep),
    activation: parseNumberOrString(params.activation),
    recharge: parseNumberOrString(params.recharge),
    sacrifice: parseNumberOrString(params.sacrifice),
  });
}

function serializeWikiFields(params: TemplateParams): Record<string, string | number | boolean | null> {
  const fields: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(params)) {
    fields[toKey(key)] = parseScalar(cleanWikiText(value));
  }

  return fields;
}

function cleanOptional(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const cleaned = cleanWikiText(value);
  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeAttribute(attribute: string | undefined, categories: string[]): string | undefined {
  if (attribute) {
    return attribute;
  }

  return hasCategory(categories, "No Attribute skills") ? "No Attribute" : undefined;
}

function normalizeType(type: string | undefined): string | undefined {
  if (!type) {
    return undefined;
  }

  return type
    .split(" ")
    .map((word) => normalizeTypeWord(word))
    .join(" ");
}

function normalizeTypeWord(word: string): string {
  return word
    .split("-")
    .map((segment) => {
      if (segment.length === 0) {
        return segment;
      }

      const lower = segment.toLocaleLowerCase();
      return `${lower[0]?.toLocaleUpperCase() ?? ""}${lower.slice(1)}`;
    })
    .join("-");
}

function parseScalar(value: string | undefined): string | number | boolean | null {
  if (value === undefined) {
    return null;
  }

  const cleaned = cleanWikiText(value);
  if (cleaned === "") {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return Number(cleaned);
  }

  if (/^(true|yes)$/i.test(cleaned)) {
    return true;
  }

  if (/^(false|no)$/i.test(cleaned)) {
    return false;
  }

  return cleaned;
}

function parseNumberOrString(value: string | undefined): string | number | undefined {
  const scalar = parseScalar(value);
  if (typeof scalar === "number" || typeof scalar === "string") {
    return scalar;
  }

  return undefined;
}

function isElite(type: string | undefined, categories: string[]): boolean {
  return /(^|\s)elite(\s|$)/i.test(type ?? "") || categories.some((category) => category === "Elite skills");
}

function getGameMode(name: string, title: string, categories: string[], pveOnly: boolean): GameMode {
  if (isPvpVariant(name, title, categories)) {
    return GameModes.Pvp;
  }

  return pveOnly ? GameModes.PveOnly : GameModes.Default;
}

function isPvpVariant(name: string, title: string, categories: string[]): boolean {
  return /\(PvP\)$/.test(name)
    || /\(PvP\)$/.test(title)
    || hasCategory(categories, "PvP versions of skills");
}

function isPveOnly(type: string | undefined, categories: string[], params: TemplateParams): boolean {
  return /pve-only/i.test(type ?? "")
    || categories.some((category) => /PvE-only skills/i.test(category))
    || categories.some((category) => /^(Allegiance|Asura|Deldrimor|Ebon Vanguard|Lightbringer|Norn|Sunspear) rank skills$/i.test(category))
    || hasCategory(categories, "Anniversary Celebration elite skills")
    || hasCategory(categories, "Core PvE-only skills")
    || /pve-only/i.test(params.special ?? "");
}

function hasCategory(categories: string[], category: string): boolean {
  return categories.some((candidate) => candidate.toLocaleLowerCase() === category.toLocaleLowerCase());
}

function compactObject<T extends Record<string, unknown>>(object: T): T {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  ) as T;
}

function toKey(value: string): string {
  return value
    .replace(/^\+\s*/, "plus ")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLocaleLowerCase();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
