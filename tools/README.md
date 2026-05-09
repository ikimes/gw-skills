# Guild Wars Skill Data Tools

These tools fetch Guild Wars skill lists from the wiki, merge them into one seed, and transcribe each skill page into app-friendly JSON.

You do not need to install anything permanently. The commands below use `npx` to run TypeScript files with `tsx`.

## Build The Dataset

Run these commands from the project root:

```powershell
npx -y tsx tools/fetch-wiki-skill-indexes.ts
npx -y tsx tools/merge-wiki-skill-indexes.ts
npx -y tsx tools/transcribe-wiki-skills.ts --input data/indexes/skills.seed.json
npx -y tsx tools/build-skills-summary.ts
npm run icons:sync
```

This creates:

- `data/indexes/*.json`: source index files fetched from wiki categories and list pages.
- `data/indexes/skills.seed.json`: one merged list of skill page titles.
- `data/wiki-skills/skills.canonical.json`: the rich wiki-derived skill dataset.
- `data/wiki-skills/skills.report.json`: warnings, failures, and data quality notes.
- `data/wiki-skills/skills.summary.json`: the lightweight search/app dataset.
- `data/overlays/skill-tags.json`: optional sparse semantic tags merged into the summary.
- `web/public/skill-icons/*.jpg`: locally served skill icon images.

## What The Canonical Dataset Contains

Each skill in `data/wiki-skills/skills.canonical.json` includes:

- skill name
- wiki page URL
- icon hotlink
- profession
- attribute
- skill type
- campaign
- elite flag
- PvE-only flag
- game mode: `default`, `pvp`, or `pve_only`
- cost data
- description and concise description
- target
- progression data
- wiki categories
- normalized raw infobox fields

## Recommended Workflow

Use the full pipeline when you want a fresh dataset:

```powershell
npx -y tsx tools/fetch-wiki-skill-indexes.ts
npx -y tsx tools/merge-wiki-skill-indexes.ts
npx -y tsx tools/transcribe-wiki-skills.ts --input data/indexes/skills.seed.json
npx -y tsx tools/build-skills-summary.ts
```

Then check the report:

```powershell
code data/wiki-skills/skills.report.json
```

The report is where you look for missing icons, missing progression tables, failed pages, PvP variants, and other cleanup notes.

For most app/search work, load `data/wiki-skills/skills.summary.json`. It keeps the display and filter fields, icon URLs, compact progression metadata, and prebuilt `searchText`. Use `skills.canonical.json` when you need full wiki details or full progression rows.

### Sync Skill Icons

```powershell
npm run icons:sync
```

Reads skill icon URLs from `data/wiki-skills/skills.summary.json` and writes local images to:

```text
web/public/skill-icons
```

Useful options:

```powershell
npm run icons:sync -- --force
npm run icons:sync -- --concurrency 12
```

## Individual Tools

### Fetch Skill Indexes

```powershell
npx -y tsx tools/fetch-wiki-skill-indexes.ts
```

Fetches profession skill categories and the PvE-only skill list.

Useful options:

```powershell
npx -y tsx tools/fetch-wiki-skill-indexes.ts --source professions
npx -y tsx tools/fetch-wiki-skill-indexes.ts --source pve-only
npx -y tsx tools/fetch-wiki-skill-indexes.ts --validate
```

`--validate` checks every candidate page for a skill infobox. This is slower, but cleaner.

### Merge Indexes

```powershell
npx -y tsx tools/merge-wiki-skill-indexes.ts
```

Reads `data/indexes/*.json` and writes:

```text
data/indexes/skills.seed.json
```

### Transcribe Skills

```powershell
npx -y tsx tools/transcribe-wiki-skills.ts --input data/indexes/skills.seed.json
```

Fetches each skill page and writes:

```text
data/wiki-skills/skills.canonical.json
data/wiki-skills/skills.report.json
```

You can also transcribe one skill:

```powershell
npx -y tsx tools/transcribe-wiki-skills.ts --skill "Brutal Weapon"
```

### Build Summary Skills

```powershell
npx -y tsx tools/build-skills-summary.ts
```

Reads:

```text
data/wiki-skills/skills.canonical.json
```

Writes:

```text
data/wiki-skills/skills.summary.json
```

The summary file is designed for the app/search layer. It excludes raw `wikiFields` and full progression rank rows.

It also merges optional semantic overlays from:

```text
data/overlays/skill-tags.json
```

Semantic overlays are intentionally sparse. Use them to curate high-value search intents such as `buff_weapon_damage`, while normal full-text search remains the fallback for untagged skills.

Most overlays live under `skills` and are keyed by skill name. If two wiki records share a display name, use `skillsByPageId` in `data/overlays/skill-tags.json` so the tag applies only to the intended page.

The summary builder also derives effective-area filters from wiki AoE categories, including:

```text
adjacent
adjacent_to_target
nearby
in_the_area
earshot
spirit_range
party_area
line
half_range
point_blank
```

### Fetch A Raw Category

```powershell
npx -y tsx tools/fetch-wiki-category.ts --category "Elementalist skills" --output data/raw-categories/elementalist_skills.json
```

This is useful when you want a raw category seed file like the existing `assassin_skills.json`.

Namespace examples:

```powershell
npx -y tsx tools/fetch-wiki-category.ts --category "Assassin skills" --namespace 0
npx -y tsx tools/fetch-wiki-category.ts --category "Assassin skills" --namespace 14
```

Namespace `0` means normal wiki pages. Namespace `14` means categories.

## Output Folders

Default output folders:

```text
data/indexes/
data/wiki-skills/
```

Suggested raw seed folder:

```text
data/raw-categories/
```

You can choose another folder:

```powershell
npx -y tsx tools/fetch-wiki-skill-indexes.ts --out-dir data/my-indexes
npx -y tsx tools/transcribe-wiki-skills.ts --input data/my-indexes/skills.seed.json --out-dir data/my-wiki-skills
```

## Notes

- Icons are hotlinked from the Guild Wars Wiki for now.
- The tools use the Guild Wars Wiki API, not browser scraping.
- Some skills do not have progression tables; that can be normal.
- The report file is expected to contain notes. It is a quality-control aid, not necessarily a failure.
