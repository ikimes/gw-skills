# Guild Wars Skills Search

A lightweight Guild Wars skill search and buildcrafting tool.

The project keeps wiki-derived data in generated JSON, imports the app-facing summary into SQLite FTS, and serves it through a small Fastify API. The planned UI is a simple React search app focused on quickly finding useful skills and narrowing results with clear filters.

## Direction

The first UI should stay search-first:

- a prominent search box
- profession toggles
- PvE/PvP filtering
- concise result cards with icons and wiki links
- semantic presets such as weapon damage

Longer-term features may include saved builds, saved team builds, lightweight auth, and a damage calculator. Those should grow from the search workflow rather than turning the app into a broad dashboard.

## Architecture Decisions

- [ADR 0001: Search Architecture](docs/adr/0001-search-architecture.md)

## Current App/API Shape

Useful API routes:

```text
GET /api/search
GET /api/skills
GET /api/skills/:pageId
GET /api/facets
GET /api/presets/weapon-damage
```

Useful development commands:

```powershell
npm run db:import
npm run dev
npm run web:dev
npm run web:build
npm test
```
