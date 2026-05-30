# PatentsView Re-homing — Self-Hosted Bulk Data via DuckDB on Cloudflare R2

**Date:** 2026-05-30
**Status:** Design — approved for implementation planning
**Related:** `docs/MCP_PLAN-PatentsView-Rehoming_2026-05-30.md` (options comparison), `docs/MCP_PLAN-Lens-Org_2026-03-21.md`, `docs/MCP_PLAN-SerpAPI_2026-03-21.md`

## Problem

PatentsView's PatentSearch API (`search.patentsview.org`) was shut down on **2026-03-20** when PatentsView migrated into USPTO's Open Data Portal (ODP). All 14 `patentsview-*` tools point at a host that now returns NXDOMAIN. There is **no live USPTO API replacement** — the ODP live API (`api.uspto.gov`) is bibliographic file-wrapper data only (no full-text, no classification search, no disambiguated entities). PatentsView's data was republished as **bulk downloadable datasets**, with the search API "to be reintroduced in updated forms" with no ETA.

(The 6 failing tests in `patentsview.client.spec.ts` are DNS-timeout artifacts of the dead host — `withRetry` backoff (2s+4s) exceeds Vitest's 5s default — **not** a regression from the recent dependency bump.)

## Decision

Self-host the PatentsView bulk data (Option B1 from the comparison doc): ingest the ODP bulk TSVs into columnar Parquet + a compact DuckDB index, store the corpus in **Cloudflare R2**, and have the MCP server query it remotely via in-process DuckDB (`httpfs` + `r2://`). This is the only option that restores PatentsView's full capability — including full-text claims/description search and **disambiguated assignee/inventor entities** — with no third-party vendor and no recurring per-query cost, reusing the existing `USPTO_API_KEY`.

### Why R2

- **Zero egress fees** — ideal for a server that repeatedly reads a remote corpus. Storage ≈ $0.35/mo (`pvgpatdis`) to ~$2/mo (with full text); reads effectively free.
- DuckDB has first-class R2 support: `read_parquet('r2://…')` and `ATTACH 'r2://…/x.duckdb' (READ_ONLY)` (verified against current DuckDB docs; remote endpoints default to read-only).
- **Decouples deployment from disk**: the corpus lives in R2, so the server is stateless and lightweight anywhere (laptop, container, edge). Resolves the deferred "where does it run" question — corpus scope becomes a configuration choice, not an infrastructure constraint.

### Bulk data facts (probed 2026-05-30 via ODP Bulk Datasets API)

| Product                     | Compressed | Files | Refresh   | Key tables                                                                                                                                     |
| --------------------------- | ---------- | ----- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pvgpatdis` (disambiguated) | ~23.5 GB   | 36    | Quarterly | `g_patent`, `g_patent_abstract` (1.7 GB), `g_assignee_disambiguated`, `g_inventor_disambiguated`, `g_cpc_current`, `g_ipc_at_issue`, citations |
| `pvgpattxt` (full text)     | ~109 GB    | 200   | Yearly    | `g_claims_*`, `g_detail_desc_text_*` (~4 GB/yr), `g_brf_sum_text_*`, year-partitioned                                                          |

Two facts shape the design:

1. **Abstracts, disambiguated entities, and CPC/IPC all live in the 23.5 GB `pvgpatdis`** — not the 109 GB full-text product. So search/entity tools are servable from a tractable source; full text is a separable, optional tier.
2. **Attorneys are never disambiguated** (only `g_attorney_not_disambiguated`) — so attorney-entity tools cannot be faithfully restored anywhere.

## Architecture

Two deploy units, one monorepo, sharing a schema contract. Ingest writes; serve only reads. Credential separation falls out of the package boundary.

```
INGEST (ops/CI, occasional)                    SERVE (MCP server, continuous)
  USPTO_API_KEY + R2 WRITE                        R2 READ only
  ODP Bulk API → unzip TSV → DuckDB                FastMCP tools
    → project to schema columns                      → PatentsLocalClient
    → build abstract FTS index                       → in-process DuckDB
    → COPY Parquet (partitioned) → R2                  httpfs + r2:// secret
    → upload index.duckdb → R2                         ATTACH index.duckdb (READ_ONLY)
    → write current.json (atomic flip)                 read_parquet('r2://…') for full text
```

### Workspace layout

```
patents-mcp-server/                    # repo root → pnpm workspace
├── pnpm-workspace.yaml
└── packages/
    ├── server/   (patents-mcp-server, PUBLISHED)   # R2 READ creds only
    │   src/clients/patents-local.client.ts          #   read-only DuckDB + r2://
    │   src/clients/{epo,odp,bigquery,…}.client.ts    #   existing clients (moved)
    │   src/tools/…                                   #   patentsview tools: swap client
    ├── ingest/   (patents-ingest, UNPUBLISHED)      # USPTO key + R2 WRITE creds
    │   src/{index,odp-bulk.client,loader,publish}.ts
    └── schema/   (patents-schema, workspace dep)     # write-schema + read-contract types
        src/index.ts
```

Moving the existing clients/tools into `packages/server/` is mechanical. Only the `patentsview-*` tools change behavior (client swap); EPO/ODP/BigQuery/PTAB/etc. are unchanged.

## Components

### Shared — `packages/schema`

`patents-schema` — single source of truth for materialized tables/columns, types, and partition keys. Exports the **write-schema** (used by ingest) and a **read-contract** types subset (column names the server `SELECT`s). Server imports types only; it does not pull ingest dependencies.

### Ingest — `packages/ingest`

- `src/index.ts` — CLI entry. Flags: `--tables`, `--years`, `--cpc <filter>`, `--full-text`, `--target r2://bucket/prefix`. Orchestrates download → load → publish.
- `src/odp-bulk.client.ts` — lists a product's files (`GET /datasets/products/{id}?includeFiles=true`) and streams each `*.tsv.zip` via the `/files/{id}/{fileName}` 302 redirect. Reuses `USPTO_API_KEY` (extends `BaseClient`).
- `src/loader.ts` — DuckDB transform: unzip → `read_csv(delim='\t')` → project to schema columns → derive `grant_year` on `g_patent` → build abstract FTS index (`PRAGMA create_fts_index`) → `COPY … TO 'r2://…' (FORMAT parquet, PARTITION_BY …)` for bulk tables → build/upload the compact `index.duckdb`.
- `src/publish.ts` — atomic swap: write artifacts to a versioned prefix (`…/vYYYY-Qn/`), then write `current.json` pointer **last**.

### Serve — `packages/server`

- `src/clients/patents-local.client.ts` — read client; drop-in for `PatentsViewClient`'s method surface. On construct: open in-process DuckDB, `INSTALL/LOAD httpfs`, `CREATE SECRET (TYPE r2, …)` from env, read `current.json`, `ATTACH 'r2://…/index.duckdb' (READ_ONLY)`, register views over `read_parquet('r2://…')` for full-text tables. Methods: `searchPatents`, `getPatent`, `searchAssignees`, `getAssignee`, `searchInventors`, `getInventor`, `getClaims`, `getDescription`, `searchByCpc`, `searchByIpc` — returning the existing JSON shapes.
- `src/tools/patentsview.tools.ts` — unchanged tool names (`patentsview-*`; same data, self-hosted — preserves the MCP contract) and Zod params; only client construction swaps. `search-attorneys`/`get-attorney` removed. `lookup-cpc`/`lookup-ipc` re-pointed to the static scheme.
- CPC/IPC scheme — `lookup-cpc`/`lookup-ipc` served from bundled classification reference data, no DB hit.

### Config (`packages/server/src/lib/config.ts`)

Add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `PATENTS_CORPUS_PREFIX` (all **read**-scoped). Tools register only when R2 config + a reachable `current.json` are present.

**DuckDB driver:** `@duckdb/node-api` (current official Node Neo client) — API confirmed during planning before wiring.

## Tool → table mapping

| Tool                                    | Source                               | Access pattern                                 |
| --------------------------------------- | ------------------------------------ | ---------------------------------------------- |
| `search-patents`                        | abstract FTS index (`index.duckdb`)  | `match_bm25`, join `g_patent`                  |
| `get-patent`                            | `g_patent` (+abstract)               | point lookup by `patent_id`                    |
| `search-assignees` / `get-assignee`     | `g_assignee_disambiguated`           | name `ILIKE` / id lookup                       |
| `search-inventors` / `get-inventor`     | `g_inventor_disambiguated`           | name / id                                      |
| `search-by-cpc`                         | `g_cpc_current` (sorted by symbol)   | prune by CPC → join `g_patent`                 |
| `search-by-ipc`                         | `g_ipc_at_issue`                     | prune by IPC                                   |
| `get-claims`                            | `g_claims_*` Parquet on R2           | by `patent_id`, routed to grant-year partition |
| `get-description`                       | `g_detail_desc_text_*` Parquet on R2 | by `patent_id`, year-partitioned               |
| `lookup-cpc` / `lookup-ipc`             | static bundled scheme                | reference lookup                               |
| ~~`search-attorneys` / `get-attorney`~~ | —                                    | **dropped** (no disambiguation available)      |

## Data flow

**Ingest:** resolve file list → stream `*.tsv.zip` to temp → DuckDB load + project + derive `grant_year` → build `fts_main_g_patent_abstract` in `index.duckdb` → `COPY` full-text tables to year-partitioned Parquet on R2 → upload `index.duckdb` → write `current.json` last (atomic flip).

**`search-patents` (hot path):** tool → `searchPatents(q, match_type, limit)` → `match_bm25` over the attached abstract FTS index, join `g_patent`, order by score, limit → httpfs range-reads only touched pages → existing JSON shape. `match_type` (all/any/phrase) maps to FTS query operators.

**`get-claims` (full text, by id):** tool → `getClaims(patent_id)` → look up `grant_year` from `g_patent` → `read_parquet('r2://…/g_claims/year=<grant_year>/*.parquet') WHERE patent_id = ?` → partition pruning hits one year's file → JSON. (Routing by grant year means a by-id lookup touches one partition, not all 200 files.)

## Error handling

**Ingest (fail loud):**

- Download: per-file retry via `withRetry`; a failed file aborts that table — never publishes a partial corpus.
- Transform: schema mismatch (USPTO changed columns) → halt naming the offending table/column (validate-schemas-then-halt). The schema package is the single check point.
- Publish: `current.json` written only after all uploads succeed. Crash mid-upload leaves the old pointer intact → server keeps serving the previous corpus.

**Serve (degrade gracefully):**

- Missing/incomplete R2 config → PatentsView tools don't register (existing conditional-registration pattern); server still starts with other sources.
- `current.json` unreachable at startup → tools don't register; clear warning; short DuckDB http timeout (no 6s hang).
- Full text absent (`fullText:false`) → `get-claims`/`get-description` don't register; the rest do.
- Query-time R2 error/timeout → caught by existing `handleApiError`, returned as structured tool error.
- Patent not found → empty result in existing shape, not an exception.

## Testing

Matches the repo's Vitest setup (unit always-on; integration gated by env, like the current `describe.skipIf(!apiKey)`).

- **Unit (no network):** schema projection correctness; per-tool SQL builders (assert generated SQL + params); `match_type` → FTS operator mapping; grant-year partition routing.
- **Integration (gated on R2 creds):** against a tiny seeded corpus (a few hundred patents in a test R2 prefix) — round-trip every tool. Replaces the dead live-API tests in `patentsview.client.spec.ts`.
- **Ingest test:** run `ingest` on one small table → assert Parquet + `index.duckdb` + `current.json` produced and the pointer flips atomically.

### Latency spike — first plan step, decision gate

Before committing the all-on-R2 path, seed a realistic abstract FTS index and measure `match_bm25` latency against remote R2 (warm). **Gate: p50 < 2 s, p95 < 5 s → all-on-R2 (target). Fail → hybrid fallback** (compact abstract/entity index cached locally; full text stays as Parquet on R2). The design supports both branches; the spike picks one based on measurement, not assumption.

## Out of scope (YAGNI)

- Pre-grant publications (`pvpgpubdis`/`pvpgpubtxt`) — granted patents first; pre-grant is a later, additive corpus.
- Citation-graph / litigation tools — already covered by existing ODP citation tools.
- Lens.org / SerpApi — separate plans; this design does not preclude adding them later as alternative backends.
- Attorney-entity tools — dropped, not reimplemented.

## Open questions (resolve during planning)

- Exact internal package names/scoping for `ingest` and `schema`.
- Whether the compact `index.duckdb` should also hold `g_cpc_current`/`g_ipc_at_issue` (small, query-frequent) vs. leaving them as Parquet.
- Refresh orchestration (manual vs. scheduled CI) — out of the code design, but affects `publish` ergonomics.
- CPC/IPC scheme source + bundling format for the static lookup tools.
