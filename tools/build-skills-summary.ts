#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  GameModes,
  type GameMode,
  type SkillArea,
  type SkillCost,
  type SkillProgressionSummary,
  type SkillProgressionValue,
  type SkillSemantic,
  type SummarySkill,
} from "../shared/skills.js";

const DEFAULT_INPUT = "data/wiki-skills/skills.canonical.json";
const DEFAULT_OUTPUT = "data/wiki-skills/skills.summary.json";
const DEFAULT_OVERLAY = "data/overlays/skill-tags.json";

type CanonicalSkill = {
  name: string;
  pageId: number;
  wiki: string;
  source?: {
    categories?: string[];
  };
  profession?: string;
  attribute?: string;
  type?: string;
  campaign?: string;
  icon?: {
    url?: string;
  };
  elite: boolean;
  pveOnly: boolean;
  gameMode?: GameMode;
  cost: SkillCost;
  description?: string;
  conciseDescription?: string;
  target?: string;
  progression?: {
    attribute?: string;
    columns?: Array<{
      key: string;
      name: string;
    }>;
    ranks?: Array<Record<string, SkillProgressionValue>>;
  };
  wikiFields?: Record<string, string | number | boolean | null>;
};

type SkillOverlay = Partial<SkillSemantic> & {
  areas?: string[];
};

type OverlayFile = {
  schema?: string;
  taxonomy?: Record<string, string[]>;
  skills?: Record<string, SkillOverlay>;
  skillsByPageId?: Record<string, SkillOverlay>;
};

type SkillOverlays = {
  byName: Record<string, SkillOverlay>;
  byPageId: Record<string, SkillOverlay>;
};

type CliOptions = {
  input: string;
  output: string;
  overlay: string;
  pretty: boolean;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const canonical = JSON.parse(await readFile(options.input, "utf8")) as CanonicalSkill[];
  const overlays = await readOverlays(options.overlay);
  const iconFallbacks = buildIconFallbacks(canonical);
  const summary = canonical.map((skill) => toSummarySkill(skill, overlays, iconFallbacks));

  await mkdir(dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(summary, null, options.pretty ? 2 : 0)}\n`, "utf8");

  process.stdout.write(`Wrote ${summary.length} summary skill${summary.length === 1 ? "" : "s"} to ${options.output}\n`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    input: resolve(DEFAULT_INPUT),
    output: resolve(DEFAULT_OUTPUT),
    overlay: resolve(DEFAULT_OVERLAY),
    pretty: true,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === "--input" && next) {
      options.input = resolve(next);
      i += 1;
    } else if (arg === "--output" && next) {
      options.output = resolve(next);
      i += 1;
    } else if (arg === "--overlay" && next) {
      options.overlay = resolve(next);
      i += 1;
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

function printHelpAndExit(): void {
  process.stdout.write(`Guild Wars skill summary builder

Usage:
  npx tsx tools/build-skills-summary.ts
  npx tsx tools/build-skills-summary.ts --input data/wiki-skills/skills.canonical.json --output data/wiki-skills/skills.summary.json

Options:
  --input <file>    Canonical skills input. Defaults to ./data/wiki-skills/skills.canonical.json.
  --output <file>   Summary output. Defaults to ./data/wiki-skills/skills.summary.json.
  --overlay <file>  Optional semantic overlay. Defaults to ./data/overlays/skill-tags.json.
  --compact         Write compact JSON.
`);
  process.exit(0);
}

async function readOverlays(file: string): Promise<SkillOverlays> {
  try {
    const overlay = JSON.parse(await readFile(file, "utf8")) as OverlayFile;
    return {
      byName: overlay.skills ?? {},
      byPageId: overlay.skillsByPageId ?? {},
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        byName: {},
        byPageId: {},
      };
    }

    throw error;
  }
}

function toSummarySkill(skill: CanonicalSkill, overlays: SkillOverlays, iconFallbacks: Map<string, string>): SummarySkill {
  const categories = skill.source?.categories ?? [];
  const progression = buildProgressionSummary(skill.progression);
  const gameMode = skill.gameMode ?? inferGameMode(skill, categories);
  const overlay = mergeOverlays(overlays.byName[skill.name], overlays.byPageId[String(skill.pageId)]);
  const areas = mergeAreas(getAreasFromCategories(categories), overlay.areas ?? []);
  const semantic = normalizeSemantic(overlay);

  const summary: SummarySkill = {
    name: skill.name,
    pageId: skill.pageId,
    wiki: skill.wiki,
    iconUrl: skill.icon?.url ?? iconFallbacks.get(skill.name),
    profession: skill.profession,
    attribute: skill.attribute,
    type: skill.type,
    campaign: skill.campaign,
    elite: skill.elite,
    pveOnly: skill.pveOnly,
    gameMode,
    cost: skill.cost,
    description: skill.description,
    conciseDescription: skill.conciseDescription,
    target: skill.target,
    progression,
    areas,
    semantic,
    categories,
    searchText: "",
  };

  summary.searchText = buildSearchText(skill, summary);
  return summary;
}

function buildProgressionSummary(skillProgression: CanonicalSkill["progression"]): SkillProgressionSummary {
  const columns = skillProgression?.columns?.map((column) => ({
    key: column.key,
    name: column.name,
  })) ?? [];
  const ranks = (skillProgression?.ranks ?? [])
    .map((rank) => {
      const rankNumber = typeof rank.rank === "number" ? rank.rank : Number(rank.rank);
      if (!Number.isFinite(rankNumber)) {
        return undefined;
      }

      const values = Object.fromEntries(
        columns.flatMap((column) => {
          const value = rank[column.key];
          return value !== undefined ? [[column.key, value]] : [];
        }),
      );

      return {
        rank: rankNumber,
        values,
      };
    })
    .filter((rank): rank is SkillProgressionSummary["ranks"][number] => rank !== undefined);

  return {
    hasProgression: columns.length > 0,
    attribute: skillProgression?.attribute,
    columns,
    ranks,
  };
}

function buildIconFallbacks(skills: CanonicalSkill[]): Map<string, string> {
  const iconByName = new Map(skills.flatMap((skill) => (
    skill.icon?.url ? [[skill.name, skill.icon.url] as const] : []
  )));
  const fallbacks = new Map<string, string>();

  for (const skill of skills) {
    if (skill.icon?.url) {
      continue;
    }

    const baseName = getPvpVariantBaseName(skill.name);
    const baseIcon = baseName ? iconByName.get(baseName) : undefined;
    if (baseIcon) {
      fallbacks.set(skill.name, baseIcon);
    }
  }

  return fallbacks;
}

function getPvpVariantBaseName(name: string): string | undefined {
  return name.endsWith(" (PvP)") ? name.slice(0, -" (PvP)".length) : undefined;
}

function mergeOverlays(nameOverlay: SkillOverlay | undefined, pageOverlay: SkillOverlay | undefined): SkillOverlay {
  if (!nameOverlay && !pageOverlay) {
    return {};
  }

  return {
    intents: mergeOverlayTags(nameOverlay?.intents, pageOverlay?.intents),
    mechanics: mergeOverlayTags(nameOverlay?.mechanics, pageOverlay?.mechanics),
    appliesTo: mergeOverlayTags(nameOverlay?.appliesTo, pageOverlay?.appliesTo),
    areas: mergeOverlayTags(nameOverlay?.areas, pageOverlay?.areas),
    notes: [nameOverlay?.notes, pageOverlay?.notes].filter(Boolean).join(" "),
  };
}

function mergeOverlayTags(first: string[] | undefined, second: string[] | undefined): string[] | undefined {
  const values = [...(first ?? []), ...(second ?? [])];
  return values.length > 0 ? values : undefined;
}

function inferGameMode(skill: CanonicalSkill, categories: string[]): GameMode {
  if (/\(PvP\)$/.test(skill.name) || hasCategory(categories, "PvP versions of skills")) {
    return GameModes.Pvp;
  }

  return skill.pveOnly ? GameModes.PveOnly : GameModes.Default;
}

function buildSearchText(skill: CanonicalSkill, summary: SummarySkill): string {
  const values: Array<string | number | boolean | null | undefined> = [
    summary.name,
    summary.profession,
    summary.attribute,
    summary.type,
    summary.campaign,
    summary.gameMode,
    summary.elite ? "elite" : undefined,
    summary.pveOnly ? "pve pve-only pve only" : undefined,
    summary.gameMode === GameModes.Pvp ? "pvp pvp variant" : undefined,
    summary.gameMode === GameModes.Default ? "default standard" : undefined,
    summary.description,
    summary.conciseDescription,
    summary.target,
    summary.progression.attribute,
    ...summary.progression.columns.map((column) => column.name),
    ...summary.areas.flatMap((area) => [area.key, area.label]),
    ...summary.semantic.intents,
    ...summary.semantic.mechanics,
    ...summary.semantic.appliesTo,
    summary.semantic.notes,
    ...summary.categories,
    ...usefulWikiFieldValues(skill.wikiFields ?? {}),
  ];

  return normalizeSearchText(values);
}

function getAreasFromCategories(categories: string[]): SkillArea[] {
  const mappings: Array<{ category: string; key: string; label: string }> = [
    { category: "Point blank area of effect", key: "point_blank", label: "Point Blank" },
    { category: "Skills with adjacent AoE", key: "adjacent", label: "Adjacent" },
    { category: "Skills with adjacent to target AoE", key: "adjacent_to_target", label: "Adjacent to Target" },
    { category: "Skills with nearby AoE", key: "nearby", label: "Nearby" },
    { category: "Skills with in the area AoE", key: "in_the_area", label: "In the Area" },
    { category: "Skills with earshot AoE", key: "earshot", label: "Earshot" },
    { category: "Skills with spirit AoE", key: "spirit_range", label: "Spirit Range" },
    { category: "Skills with large spirit AoE", key: "spirit_range", label: "Spirit Range" },
    { category: "Skills with party AoE", key: "party_area", label: "Party Area" },
    { category: "Skills with linear AoE", key: "line", label: "Line" },
    { category: "Skills with half range AoE", key: "half_range", label: "Half Range" },
  ];

  return mappings
    .filter((mapping) => hasCategory(categories, mapping.category))
    .map(({ key, label }) => ({ key, label }));
}

function mergeAreas(baseAreas: SkillArea[], overlayAreas: string[]): SkillArea[] {
  const byKey = new Map(baseAreas.map((area) => [area.key, area]));

  for (const area of overlayAreas) {
    const key = normalizeTag(area);
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        label: labelFromTag(key),
      });
    }
  }

  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function normalizeSemantic(overlay: SkillOverlay): SkillSemantic {
  return {
    intents: normalizeTags(overlay.intents),
    mechanics: normalizeTags(overlay.mechanics),
    appliesTo: normalizeTags(overlay.appliesTo),
    notes: overlay.notes,
  };
}

function normalizeTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map(normalizeTag).filter(Boolean))].sort();
}

function normalizeTag(tag: string): string {
  return tag
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function labelFromTag(tag: string): string {
  return tag
    .split("_")
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(" ");
}

function usefulWikiFieldValues(fields: Record<string, string | number | boolean | null>): Array<string | number | boolean | null> {
  return Object.entries(fields)
    .filter(([key]) => /^(causes|requires|removes)\d*$/i.test(key))
    .map(([, value]) => value)
    .filter((value) => value !== null && value !== "");
}

function normalizeSearchText(values: Array<string | number | boolean | null | undefined>): string {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const value of values) {
    if (value === undefined || value === null || value === false) {
      continue;
    }

    const normalized = String(value)
      .toLocaleLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9+%'"!.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      terms.push(normalized);
    }
  }

  return terms.join(" ");
}

function hasCategory(categories: string[], category: string): boolean {
  return categories.some((candidate) => candidate.toLocaleLowerCase() === category.toLocaleLowerCase());
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "ENOENT";
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
