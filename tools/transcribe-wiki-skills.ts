#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { GameModes, type GameMode, type SkillCost } from "../shared/skills.js";

const API_URL = "https://wiki.guildwars.com/api.php";
const WIKI_URL = "https://wiki.guildwars.com/wiki/";
const DEFAULT_OUT_DIR = "data/wiki-skills";
const DEFAULT_INPUT = "data/indexes/skills.seed.json";
const MAX_ATTRIBUTE_RANK = 21;
const USER_AGENT = "gw-skills-transcriber/0.1 (local data tool; https://wiki.guildwars.com)";

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

function toReportPath(file: string): string {
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
  const progressionTemplate = extractTemplate(wikitext, "Skill progression");
  const progression = progressionTemplate ? parseProgression(parseTemplateParams(progressionTemplate)) : undefined;

  const categories = (data.parse.categories ?? [])
    .filter((category) => !category.hidden)
    .map((category) => category.category.replaceAll("_", " "))
    .sort();

  const name = cleanWikiText(infobox.name ?? data.parse.title);
  const type = cleanOptional(infobox.type);
  const attribute = normalizeAttribute(cleanOptional(infobox.attribute), categories);
  const pveOnly = isPveOnly(type, categories, infobox);
  const gameMode = getGameMode(name, data.parse.title, categories, pveOnly);

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
  const normalizedName = templateName.toLocaleLowerCase();
  let index = 0;

  while (index < wikitext.length) {
    const start = wikitext.indexOf("{{", index);
    if (start === -1) {
      return undefined;
    }

    const nameStart = start + 2;
    const nameEnd = findTemplateNameEnd(wikitext, nameStart);
    const foundName = wikitext.slice(nameStart, nameEnd).trim().toLocaleLowerCase();

    if (foundName === normalizedName) {
      return readBalancedTemplate(wikitext, start);
    }

    index = start + 2;
  }

  return undefined;
}

function findTemplateNameEnd(text: string, start: number): number {
  let i = start;
  while (i < text.length && text[i] !== "|" && text[i] !== "}") {
    i += 1;
  }
  return i;
}

function readBalancedTemplate(text: string, start: number): string {
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

function parseTemplateParams(template: string): TemplateParams {
  const inner = template.slice(2, -2);
  const parts = splitTopLevel(inner, "|");
  const params: TemplateParams = {};

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

function splitTopLevel(text: string, delimiter: string): string[] {
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

function splitFirstTopLevel(text: string, delimiter: string): [string, string] | undefined {
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

function parseProgression(params: TemplateParams): SkillProgression {
  const columns: ProgressionColumn[] = [];

  for (let index = 1; ; index += 1) {
    const prefix = `var${index}`;
    const name = params[`${prefix} name`];

    if (!name) {
      break;
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
    attribute: cleanOptional(params.attribute),
    columns,
  };

  const ranks = buildProgressionRanks(columns);
  if (ranks.length > 0) {
    progression.ranks = ranks;
  }

  return progression;
}

function buildProgressionRanks(columns: ProgressionColumn[]): Array<Record<string, number | string>> {
  if (columns.length === 0) {
    return [];
  }

  return Array.from({ length: MAX_ATTRIBUTE_RANK + 1 }, (_, rank) => {
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

function cleanWikiText(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{gr\|([^|{}]+)\|([^|{}]+)\}\}/g, (_match, start, end) => {
      const startValue = Number(start);
      const endValue = Number(end);
      if (Number.isFinite(startValue) && Number.isFinite(endValue)) {
        const rank12 = Math.round(startValue + ((endValue - startValue) * 12) / 15);
        return `${start}...${rank12}...${end}`;
      }
      return `${start}...${end}`;
    })
    .replace(/\{\{grey\|([^{}]+)\}\}/g, "$1")
    .replace(/\{\{sic\}\}/gi, "[sic]")
    .replace(/\{\{sic\|([^{}]+)\}\}/gi, "$1 [sic]")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{([^|{}]+)\|([^{}]+)\}\}/g, "$2")
    .replace(/\{\{([^{}]+)\}\}/g, "")
    .replace(/'''?/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
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

function slugify(value: string): string {
  return toKey(value).replaceAll("_", "-");
}

function encodeWikiTitle(title: string): string {
  return title
    .replaceAll(" ", "_")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
