# ADR 0001: Search Architecture

## Status

Accepted

## Context

This project is a lightweight Guild Wars skill search and buildcrafting tool. The core product need is fast, predictable skill discovery across wiki-derived data, curated buildcraft concepts, and simple filters.

Future features may include saved builds, saved team builds, lightweight auth, and a damage calculator. Those features should grow from the search workflow rather than turning the app into a broad dashboard.

We considered whether semantic models, ONNX, or LLMs should be part of the main search path.

## Decision

The core search stack will stay deterministic and inspectable:

1. SQLite FTS for exact text search.
2. Curated semantic tags for high-value buildcraft concepts.
3. Optional synonym/query expansion for common player language.
4. Optional embeddings, ONNX, or LLM assistance only as a helper layer.

The UI is a simple React search app backed by the Fastify API. It should remain search-first: prominent search box, profession toggles, PvE/PvP filtering, concise result cards, wiki links, and semantic presets such as weapon damage.

## Consequences

- Exact filters, wiki-derived data, and curated semantic tags remain the source of truth.
- Search results should be explainable by text match, filter, or semantic tag.
- LLMs or local semantic models may be useful later for query expansion, tag suggestions, explanations, or buildcraft assistance.
- LLMs or embeddings should not replace deterministic search as the primary engine.
- Repeated failed searches should first be solved with tags, synonyms, ranking improvements, or API filters before adding model-based search.
