#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SummarySkill } from "../shared/skills.js";

type CliOptions = {
  input: string;
  output: string;
  concurrency: number;
  force: boolean;
};

type IconTask = {
  name: string;
  pageId: number;
  sourceUrl: string;
  outputPath: string;
};

type IconResult =
  | { status: "downloaded"; task: IconTask; bytes: number }
  | { status: "skipped"; task: IconTask }
  | { status: "failed"; task: IconTask; error: string };

const DEFAULT_INPUT = "data/wiki-skills/skills.summary.json";
const DEFAULT_OUTPUT = "web/public/skill-icons";
const DEFAULT_CONCURRENCY = 8;

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const input = resolve(options.input);
  const output = resolve(options.output);
  const skills = JSON.parse(await readFile(input, "utf8")) as SummarySkill[];
  const tasks = skills.flatMap((skill) => toIconTask(skill, output));

  await mkdir(output, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  for (let index = 0; index < tasks.length; index += options.concurrency) {
    const batch = tasks.slice(index, index + options.concurrency);
    const results = await Promise.all(batch.map((task) => syncIcon(task, options.force)));

    for (const result of results) {
      if (result.status === "downloaded") {
        downloaded += 1;
      } else if (result.status === "skipped") {
        skipped += 1;
      } else {
        failed += 1;
        process.stderr.write(`Failed ${result.task.pageId}.jpg ${result.task.name}: ${result.error}\n`);
      }

      processed += 1;
    }

    if (processed === tasks.length || processed % 100 < options.concurrency) {
      process.stdout.write(`Synced ${processed}/${tasks.length} skill icons...\n`);
    }
  }

  process.stdout.write(`Skill icons: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed\n`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

function toIconTask(skill: SummarySkill, output: string): IconTask[] {
  if (!skill.iconUrl) {
    return [];
  }

  return [{
    name: skill.name,
    pageId: skill.pageId,
    sourceUrl: skill.iconUrl,
    outputPath: resolve(output, `${skill.pageId}${getIconExtension(skill.iconUrl)}`),
  }];
}

function getIconExtension(url: string): string {
  const pathname = new URL(url).pathname;
  const extension = extname(pathname).toLowerCase();
  return extension || ".jpg";
}

async function syncIcon(task: IconTask, force: boolean): Promise<IconResult> {
  if (!force && await fileExists(task.outputPath)) {
    return { status: "skipped", task };
  }

  try {
    const response = await fetch(task.sourceUrl, {
      headers: {
        "User-Agent": "gw-skills icon sync",
      },
    });

    if (!response.ok) {
      return { status: "failed", task, error: `HTTP ${response.status}` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(task.outputPath, buffer);
    return { status: "downloaded", task, bytes: buffer.byteLength };
  } catch (error: unknown) {
    return { status: "failed", task, error: error instanceof Error ? error.message : String(error) };
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    concurrency: DEFAULT_CONCURRENCY,
    force: false,
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
    } else if (arg === "--concurrency" && next) {
      const value = Number(next);
      if (!Number.isInteger(value) || value < 1 || value > 32) {
        throw new Error("--concurrency must be an integer from 1 to 32");
      }
      options.concurrency = value;
      i += 1;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return options;
}

function printHelpAndExit(): void {
  process.stdout.write(`Guild Wars skill icon sync

Usage:
  npx -y tsx tools/sync-skill-icons.ts
  npx -y tsx tools/sync-skill-icons.ts --force --concurrency 12

Options:
  --input <file>        Summary JSON input. Defaults to ./data/wiki-skills/skills.summary.json.
  --output <directory>  Icon output directory. Defaults to ./web/public/skill-icons.
  --concurrency <n>     Parallel downloads from 1 to 32. Defaults to 8.
  --force               Redownload icons that already exist.
`);
  process.exit(0);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
