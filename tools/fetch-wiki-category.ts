#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { slugify, USER_AGENT, wikiApi } from "./wiki-skill-utils";

type CategoryMember = {
  pageid: number;
  ns: number;
  title: string;
};

type CategoryMembersResponse = {
  batchcomplete?: boolean | string;
  continue?: {
    cmcontinue?: string;
  };
  limits?: {
    categorymembers?: number;
  };
  query?: {
    categorymembers?: CategoryMember[];
  };
  error?: {
    info?: string;
  };
};

type RawCategoryFile = {
  batchcomplete: string;
  limits: {
    categorymembers: number;
  };
  meta: {
    category: string;
    fetchedAt: string;
    source: string;
    userAgent: string;
  };
  query: {
    categorymembers: CategoryMember[];
  };
};

type CliOptions = {
  category?: string;
  output?: string;
  namespace?: number;
  pretty: boolean;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options.category) {
    throw new Error("Missing --category. Example: --category \"Elementalist skills\"");
  }

  const members = await fetchCategoryMembers(options.category, options.namespace);
  const output = options.output ?? resolve(`${slugify(options.category)}.json`);
  const payload: RawCategoryFile = {
    batchcomplete: "",
    limits: {
      categorymembers: 500,
    },
    meta: {
      category: options.category,
      fetchedAt: new Date().toISOString(),
      source: `https://wiki.guildwars.com/wiki/Category:${options.category.replaceAll(" ", "_")}`,
      userAgent: USER_AGENT,
    },
    query: {
      categorymembers: members,
    },
  };

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(payload, null, options.pretty ? 2 : 0)}\n`, "utf8");
  process.stdout.write(`Wrote ${members.length} category members to ${output}\n`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    pretty: true,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === "--category" && next) {
      options.category = stripCategoryPrefix(next);
      i += 1;
    } else if (arg === "--output" && next) {
      options.output = resolve(next);
      i += 1;
    } else if (arg === "--namespace" && next) {
      options.namespace = Number(next);
      if (!Number.isInteger(options.namespace)) {
        throw new Error(`Invalid namespace: ${next}`);
      }
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
  process.stdout.write(`Guild Wars wiki category fetcher

Usage:
  npx tsx tools/fetch-wiki-category.ts --category "Elementalist skills" --output elementalist_skills.json
  npx tsx tools/fetch-wiki-category.ts --category "PvE-only skills"
  npx tsx tools/fetch-wiki-category.ts --category "Assassin skills" --namespace 0

Options:
  --category <name>    Wiki category name, with or without the Category: prefix.
  --output <file>      Output file. Defaults to a slug of the category name.
  --namespace <ns>     Optional namespace filter, e.g. 0 for pages or 14 for categories.
  --compact            Write compact JSON.
`);
  process.exit(0);
}

async function fetchCategoryMembers(category: string, namespace?: number): Promise<CategoryMember[]> {
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
      ...(namespace === undefined ? {} : { cmnamespace: String(namespace) }),
      ...(cmcontinue ? { cmcontinue } : {}),
    });

    members.push(...(data.query?.categorymembers ?? []));
    cmcontinue = data.continue?.cmcontinue;
  } while (cmcontinue);

  return members;
}

function stripCategoryPrefix(category: string): string {
  return category.replace(/^Category:/i, "").trim();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
