#!/usr/bin/env node

import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSchema, DEFAULT_DB_PATH, DEFAULT_SUMMARY_PATH, ensureParentDirectory, insertSkills, openDatabase } from "../src/db.js";
import type { SummarySkill } from "../src/types.js";

type ImportOptions = {
  input: string;
  output: string;
};

export async function importSkills(options: Partial<ImportOptions> = {}): Promise<{ count: number; output: string }> {
  const input = resolve(options.input ?? DEFAULT_SUMMARY_PATH);
  const output = resolve(options.output ?? DEFAULT_DB_PATH);
  const skills = JSON.parse(await readFile(input, "utf8")) as SummarySkill[];

  await mkdir(ensureParentDirectory(output), { recursive: true });
  await removeExistingDatabase(output);

  const db = openDatabase(output, false);
  try {
    createSchema(db);
    insertSkills(db, skills);
    db.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    db.close();
  }

  return { count: skills.length, output };
}

function parseArgs(args: string[]): ImportOptions {
  const options: ImportOptions = {
    input: DEFAULT_SUMMARY_PATH,
    output: DEFAULT_DB_PATH,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === "--input" && next) {
      options.input = next;
      i += 1;
    } else if (arg === "--output" && next) {
      options.output = next;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return options;
}

function printHelpAndExit(): void {
  process.stdout.write(`Guild Wars skill database importer

Usage:
  npm run db:import
  tsx server/scripts/import-skills.ts --input data/wiki-skills/skills.summary.json --output data/search/skills.sqlite

Options:
  --input <file>    Summary JSON input. Defaults to ./data/wiki-skills/skills.summary.json.
  --output <file>   SQLite output. Defaults to ./data/search/skills.sqlite.
`);
  process.exit(0);
}

async function removeExistingDatabase(output: string): Promise<void> {
  await Promise.all([
    rm(output, { force: true }),
    rm(`${output}-shm`, { force: true }),
    rm(`${output}-wal`, { force: true }),
  ]);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  importSkills(parseArgs(process.argv.slice(2)))
    .then(({ count, output }) => {
      process.stdout.write(`Imported ${count} skills into ${output}\n`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
