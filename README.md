# Guild Wars Skills Search

A lightweight Guild Wars skill search and buildcrafting tool.

The project keeps wiki-derived Guild Wars skill data in generated JSON, imports the app-facing summary into SQLite FTS, serves it through a small Fastify API, and provides a React/Vite search UI. The app is search-first: it is built for quickly finding useful skills, narrowing results with filters, and following wiki links when deeper detail is needed.

## Current Shape

The app currently includes:

- a React frontend in `web/`
- a Fastify API in `server/`
- shared TypeScript skill types in `shared/`
- wiki data tooling in `tools/`
- generated wiki-derived data in `data/`
- local skill and metadata icons in `web/public/`

The core search experience includes:

- full-text skill search
- profession toggles
- PvE/PvP filtering
- type, attribute, campaign, elite, and semantic filters
- concise result cards with icons, costs, progression, and wiki links
- semantic routes such as the weapon damage preset

Longer-term features may include saved builds, saved team builds, lightweight auth, and a damage calculator. Those should grow from the search workflow rather than turning the app into a broad dashboard.

## Public Repo Notes

This repository is intended to be safe to publish publicly. Runtime secrets are not stored in the codebase. Deployment-specific values, such as the public API base URL used by the GitHub Pages build, should be configured as GitHub Actions variables or hosting-provider environment variables.

Do not commit `.env` files, API tokens, service credentials, private keys, or generated SQLite databases. The `.gitignore` excludes those local/runtime artifacts.

This is an unofficial, non-commercial fan/reference project and is not endorsed by ArenaNet or NCSOFT. Guild Wars names, skill data, descriptions, images, and marks belong to their respective rights holders. The repository license covers original project code/docs only; see [Notice](NOTICE.md).

## Architecture Decisions

- [ADR 0001: Search Architecture](docs/adr/0001-search-architecture.md)
- [Deploy the API on Render](docs/deploy-render.md)
- [Notice](NOTICE.md)

## Deployment

The production-style deployment is split:

- GitHub Pages hosts the static frontend from the `release` branch.
- Render hosts the Fastify API from the `release` branch.
- GitHub Actions variable `VITE_API_BASE_URL` points the frontend build at the Render API URL.

GitHub Pages cannot run the API. It only serves the static frontend.

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

Local development usually uses two terminals:

```powershell
npm run db:import
npm run dev
```

```powershell
npm run web:dev
```

When refreshing wiki-derived skill data, rebuild the summary before importing SQLite:

```powershell
npx -y tsx tools/build-skills-summary.ts
npm run db:import
```

Run those sequentially, not in parallel, so the DB import always reads the latest summary file.
