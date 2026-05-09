#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  dedupeIndexEntries,
  readJson,
  SKILL_INDEX_SCHEMA,
  SkillIndexEntry,
  SkillIndexFile,
  SkillIndexSource,
  writeJson,
} from "./wiki-skill-utils";

const DEFAULT_INPUT_DIR = "data/indexes";
const DEFAULT_OUTPUT = "data/indexes/skills.seed.json";

type CliOptions = {
  inputDir: string;
  output: string;
  pretty: boolean;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const files = (await readdir(options.inputDir))
    .filter((file) => file.endsWith(".json"))
    .filter((file) => !file.endsWith(".seed.json"))
    .filter((file) => file !== basename(options.output))
    .sort();

  const indexes: SkillIndexFile[] = [];
  for (const file of files) {
    const fullPath = join(options.inputDir, file);
    const index = await readJson<SkillIndexFile>(fullPath);
    if (index.schema === SKILL_INDEX_SCHEMA && Array.isArray(index.skills)) {
      indexes.push(index);
    }
  }

  if (indexes.length === 0) {
    throw new Error(`No ${SKILL_INDEX_SCHEMA} files found in ${options.inputDir}`);
  }

  const merged = mergeIndexes(indexes);
  await writeJson(options.output, merged, options.pretty);
  process.stdout.write(`Merged ${indexes.length} index files into ${options.output} (${merged.skills.length} skills)\n`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    inputDir: resolve(DEFAULT_INPUT_DIR),
    output: resolve(DEFAULT_OUTPUT),
    pretty: true,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === "--input-dir" && next) {
      options.inputDir = resolve(next);
      i += 1;
    } else if (arg === "--output" && next) {
      options.output = resolve(next);
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
  process.stdout.write(`Guild Wars wiki skill index merger

Usage:
  npx tsx tools/merge-wiki-skill-indexes.ts
  npx tsx tools/merge-wiki-skill-indexes.ts --input-dir data/indexes --output data/indexes/skills.seed.json

Options:
  --input-dir <dir>   Directory containing skill index JSON files. Defaults to ./data/indexes.
  --output <file>     Merged seed output. Defaults to ./data/indexes/skills.seed.json.
  --compact           Write compact JSON.
`);
  process.exit(0);
}

function mergeIndexes(indexes: SkillIndexFile[]): SkillIndexFile {
  const sources: SkillIndexSource[] = [];
  const skills: SkillIndexEntry[] = [];

  for (const index of indexes) {
    sources.push(...index.sources);
    skills.push(...index.skills);
  }

  return {
    schema: SKILL_INDEX_SCHEMA,
    generatedAt: new Date().toISOString(),
    sources: dedupeSources(sources),
    skills: dedupeIndexEntries(skills),
  };
}

function dedupeSources(sources: SkillIndexSource[]): SkillIndexSource[] {
  const byId = new Map<string, SkillIndexSource>();

  for (const source of sources) {
    const existing = byId.get(source.id);
    if (!existing) {
      byId.set(source.id, { ...source });
      continue;
    }

    existing.count = Math.max(existing.count ?? 0, source.count ?? 0);
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
