# Skills API

This API serves `data/wiki-skills/skills.summary.json` through a SQLite FTS database.

The API does not scrape the wiki. Regenerate the JSON data with the tools first, then import it into SQLite.

## Setup

From the project root:

```powershell
npm install
npm run db:import
npm run dev
```

The default API URL is:

```text
http://127.0.0.1:3000
```

## Scripts

```powershell
npm run db:import
```

Builds:

```text
data/search/skills.sqlite
```

from:

```text
data/wiki-skills/skills.summary.json
```

```powershell
npm run dev
```

Starts the API in watch mode.

```powershell
npm test
```

Runs API endpoint tests with a temporary SQLite database.

## Endpoints

```text
GET /health
GET /api/skills
GET /api/skills/:pageId
GET /api/search
GET /api/facets
```

Search examples:

```text
/api/search?q=weapon%20damage
/api/search?q=touch&gameMode=pvp
/api/search?q=weapon%20damage&gameMode=pve_only
/api/search?intent=buff_weapon_damage
/api/search?area=nearby
```

Filter parameters:

```text
profession
attribute
type
campaign
gameMode
elite
pveOnly
intent
mechanic
appliesTo
area
limit
offset
```

`gameMode` values:

```text
default
pvp
pve_only
```

Semantic filter examples:

```text
intent=buff_weapon_damage
mechanic=flat_damage_bonus
appliesTo=weapon_attacks
area=earshot
area=in_the_area
area=nearby
area=adjacent
```

Semantic tags come from `data/overlays/skill-tags.json`. Effective-area tags are mostly derived automatically from wiki AoE categories.
