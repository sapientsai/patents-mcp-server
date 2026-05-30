# Re-homing the PatentsView Tools — Options Comparison

**Status:** Decision doc — no implementation yet
**Date:** 2026-05-30
**Decision owner:** Jordan

## TL;DR

PatentsView's PatentSearch API (`search.patentsview.org`) was shut down on **2026-03-20** when PatentsView migrated into USPTO's Open Data Portal (ODP). All **14 `patentsview-*` tools** now point at a dead host (NXDOMAIN). **There is no live USPTO API replacement** — the ODP live API is bibliographic-only; PatentsView's data was published as **bulk downloads only**, with the search API "to be reintroduced in updated forms" with **no ETA**.

This doc compares the realistic ways to restore the capability. Recommendation is at the bottom.

## What happened

| Fact                                        | Evidence                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `search.patentsview.org` no longer resolves | `NXDOMAIN` (verified, sandbox on and off)                                                                                            |
| `api.patentsview.org` → transition guide    | `301` → `https://data.uspto.gov/support/transition-guide/patentsview`                                                                |
| Shutdown date                               | USPTO: _"migrating to the USPTO's Open Data Portal … starting on March 20, 2026"_                                                    |
| Search/API status                           | USPTO: _"USPTO plans to reintroduce PatentsView API functions in updated forms… There is currently no estimate for the launch date"_ |
| Old API keys dead                           | USPTO: _"Previously-issued API keys for the PatentSearch API will not be compatible with ODP APIs"_                                  |

Sources: [USPTO migration notice](https://www.uspto.gov/subscription-center/2026/patentsview-migrating-uspto-open-data-portal-march-20) · [ODP transition guide](https://data.uspto.gov/support/transition-guide/patentsview) · [USPTO PatentsView (bulk downloads)](https://www.uspto.gov/ip-policy/economic-research/patentsview)

### Test symptom (not a regression)

The 6 "failing" tests in `test/patentsview.client.spec.ts` are **DNS-failure timeouts**, not assertion failures and not caused by the recent dependency bump. A failed lookup (~7 ms) is retried by `withRetry` (`config.ts`: `maxRetries: 3`, `minWait: 2000`) for `2s + 4s ≈ 6s`, exceeding Vitest's 5 s default → "Test timed out in 5000ms". The bump (fastmcp 4, functype 1.0, etc.) typechecks and builds clean; the other 11 tests pass.

### The ODP live API is NOT the replacement

The ODP API (`api.uspto.gov/api/v1/`, already wrapped by `odp.client.ts`) is **patent file-wrapper / prosecution bibliographic data**. A grep of the full ODP OpenAPI spec confirms it by omission:

| Term in full spec                | Count                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `abstract`                       | 0                                                                                  |
| `claim`                          | 0                                                                                  |
| `cpc` / `ipc` / `classification` | 0 / 0 / 0                                                                          |
| `full-text`                      | 0                                                                                  |
| `assignee`                       | 0                                                                                  |
| `disambig`                       | 0                                                                                  |
| `inventorName`                   | 4 (raw `applicationMetaData.inventorBag.inventorNameText`, not a disambiguated ID) |

Every endpoint is tagged `x-content-type: Bibliographic data`. **No full-text search, no classification search, no disambiguated entities.** PatentsView's distinctive capabilities were never ported to this API.

## The 14 tools split into 3 access patterns

Not all 14 need the same answer:

| Pattern             | Tools                                                                                                          | What they need                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Scheme lookup**   | `lookup-cpc`, `lookup-ipc`                                                                                     | CPC/IPC _classification scheme_ definitions — small static reference data, **no API needed** |
| **By-ID retrieval** | `get-patent`, `get-claims`, `get-description`, `get-assignee`, `get-inventor`, `get-attorney`                  | one record on demand                                                                         |
| **Corpus search**   | `search-patents`, `search-by-cpc`, `search-by-ipc`, `search-assignees`, `search-inventors`, `search-attorneys` | a queryable corpus or live search API                                                        |

`lookup-cpc` / `lookup-ipc` are a free win under every option: bundle the CPC/IPC scheme (published by USPTO/EPO/WIPO) as static reference data. The project already ships a CPC resource + `get-cpc-info`.

## PatentsView bulk datasets (for the self-host options)

Downloadable via the **ODP Bulk Datasets API** — `/api/v1/datasets/products/{productId}` + `/files/{productId}/{fileName}` (302 redirect) — using the **same `USPTO_API_KEY`** the project already uses. `odp.client.ts` already has `searchDatasets()` / `getDataset()`.

| Capability                                | Product                    | Sample tables                                                                              |
| ----------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------ |
| Baseline + disambiguated entities + CPC   | `pvgpatdis`                | `g_patent`, `g_assignee_disambiguated`, `g_cpc_current`                                    |
| Long text: claims / description / summary | `pvgpattxt`                | `g_claims_2025`, `g_detail_desc_text_2025`, `g_brf_sum_text_2025`, `g_draw_desc_text_2025` |
| Pre-grant equivalents                     | `pvpgpubdis`, `pvpgpubtxt` | `pg_*`                                                                                     |
| Sorted (beta) / annualized                | `pvsorted`, `pvannual`     | —                                                                                          |

## Options

### Option A — Live third-party API (no data hosting)

One API key, zero ETL, full corpus, always current.

- **A1 — Lens.org** (see `MCP_PLAN-Lens-Org_2026-03-21.md`): single integration; full US text (`claim`, `description`, `full_text`), `applicant.name`, `inventor.name`, `class_cpc.symbol`, `class_ipcr.symbol`. 153M patents, 100+ jurisdictions.
- **A2 — SerpApi Google Patents** (see `MCP_PLAN-SerpAPI_2026-03-21.md`): live search via Google's index + per-patent details (abstract, claims, classifications, citations, legal events). ~$0.01–0.025/search.

|                                | A1 Lens.org               | A2 SerpApi                    |
| ------------------------------ | ------------------------- | ----------------------------- |
| Full-text search (claims/desc) | ✅                        | ✅                            |
| Classification search          | ✅ CPC + IPC              | ✅ (filter)                   |
| Entity search by name          | ✅ name-based             | ⚠️ filter, not entity-centric |
| Disambiguated entity IDs       | ❌ (Lens IDs, not PV IDs) | ❌                            |
| Attorney/agent search          | ❌                        | ❌                            |
| Hosting / ETL                  | none                      | none                          |
| Cost model                     | subscription              | pay-per-query                 |
| Currency                       | live                      | live                          |

**Pros:** lowest friction, no infra, no refresh, whole corpus. **Cons:** recurring cost; external dependency; loses _PatentsView-style disambiguated entity IDs_ and attorney search.

### Option B — Self-host the USPTO bulk data

Pull `pvgpatdis` / `pvgpattxt` via the ODP Bulk Datasets API (existing key, no new vendor) into a store you control, then re-point the tools at it.

- **B1 — DuckDB (embedded)** — fits the stack, no external service, no per-query cost, reads Parquet/CSV directly.
- **B2 — Postgres / Elasticsearch** — better full-text + entity search at scale; standing up infra.
- **B3 — BigQuery** — possible, but conditional credential + the scan-cost path `MCP_PLAN-SerpAPI_2026-03-21.md` is trying to leave. **Not assumed available.**

|                              | B1 DuckDB                                             | B2 Postgres/ES   | B3 BigQuery       |
| ---------------------------- | ----------------------------------------------------- | ---------------- | ----------------- |
| Full-text + classification   | ✅                                                    | ✅               | ✅                |
| **Disambiguated entity IDs** | ✅                                                    | ✅               | ✅                |
| Attorney search              | ✅ if in bulk                                         | ✅ if in bulk    | ✅ if in bulk     |
| External dependency          | none                                                  | self-run service | GCP (conditional) |
| Per-query cost               | none                                                  | none             | scan-based        |
| Effort                       | ETL + refresh                                         | ETL + infra      | ETL + cost mgmt   |
| Coverage scope               | realistically **scoped** (full US text is tens of GB) | full feasible    | full feasible     |

**Pros:** USPTO-native, no recurring API cost, **only path that restores true disambiguated entities offline**. **Cons:** you own an ETL pipeline + periodic refresh; full coverage is heavy (DuckDB realistically wants a scoped corpus, e.g. Civala's oncology/biotech CPC ranges).

### Option C — Per-patent live fetch (minimal surface)

Keep only the by-ID retrieval tools; drop or defer corpus search.

- `get-claims` / `get-description`: **EPO OPS already covers EP/WO** (not US). Add a live US-by-ID source (SerpApi details or Lens by `lens_id`) for US.
- Drop `search-*` and the disambiguated entity tools.

**Pros:** smallest change, minimal cost. **Cons:** you lose US keyword/entity _search_ entirely — a real capability regression for FTO/landscape work.

### Option D — Wait for USPTO's reintroduced API

USPTO says functions return "in updated forms" — **no ETA**. Not actionable now; revisit later.

## Per-tool coverage matrix

✅ full · ⚠️ partial/changed semantics · ❌ not covered

| Tool                         |  A1 Lens   | A2 SerpApi |  B self-host  |     C minimal      | Static bundle |
| ---------------------------- | :--------: | :--------: | :-----------: | :----------------: | :-----------: |
| `search-patents` (full-text) |     ✅     |     ✅     |      ✅       |         ❌         |       —       |
| `get-patent`                 |     ✅     |     ✅     |      ✅       |         ⚠️         |       —       |
| `search-assignees`           |  ⚠️ name   | ⚠️ filter  |      ✅       |         ❌         |       —       |
| `get-assignee` (by ID)       | ⚠️ Lens ID |     ❌     |      ✅       |         ❌         |       —       |
| `search-inventors`           |  ⚠️ name   | ⚠️ filter  |      ✅       |         ❌         |       —       |
| `get-inventor` (by ID)       | ⚠️ Lens ID |     ❌     |      ✅       |         ❌         |       —       |
| `search-attorneys`           |     ❌     |     ❌     | ⚠️ if in bulk |         ❌         |       —       |
| `get-attorney` (by ID)       |     ❌     |     ❌     | ⚠️ if in bulk |         ❌         |       —       |
| `get-claims`                 |     ✅     |     ✅     |      ✅       | ⚠️ US-only via add |       —       |
| `get-description`            |     ✅     |     ✅     |      ✅       | ⚠️ US-only via add |       —       |
| `search-by-cpc`              |     ✅     |     ✅     |      ✅       |         ❌         |       —       |
| `search-by-ipc`              |     ✅     |     ⚠️     |      ✅       |         ❌         |       —       |
| `lookup-cpc`                 |     ❌     |     ❌     |      ❌       |         ❌         |      ✅       |
| `lookup-ipc`                 |     ❌     |     ❌     |      ❌       |         ❌         |      ✅       |

## Decision factors

- **Disambiguated entity IDs** (PatentsView's signature) only survive under **Option B**. If FTO/landscape work depends on deduplicated assignee/inventor identity, that pushes toward self-hosting.
- **Zero hosting / always current** favors **Option A**; Lens.org covers the most in one integration.
- **Cost shape**: A = recurring (subscription/per-query); B = storage + your time (ETL/refresh), no per-query fees.
- **Coverage scope**: A covers the entire corpus with no effort; B realistically means scoping (DuckDB) or running infra (PG/ES) to handle tens of GB of full text.
- **Conditional registration** (existing project design) holds under all options: re-homed tools register only when their backend (Lens key / SerpApi key / local DB) is present — graceful when absent.
- `lookup-cpc` / `lookup-ipc` → **static bundle regardless** of the option chosen.

## Recommendation

1. **Primary: Option A1 (Lens.org)** — lowest friction, no infra/refresh, restores full-text search + CPC/IPC + name-based entity search across the whole corpus in one integration. Reframe `MCP_PLAN-Lens-Org_2026-03-21.md` from _supplement_ to _replacement_ (its premise table still lists PatentsView as a working source — now false).
2. **`lookup-cpc` / `lookup-ipc`** — bundle the CPC/IPC scheme as static reference data; no API dependency.
3. **If disambiguated entity identity is a hard requirement** — add **Option B1 (DuckDB)** over a _scoped_ `pvgpatdis` corpus as a follow-on; this is the only way to recover true PatentsView `assignee_id`/`inventor_id` semantics without a live API.
4. **Drop or clearly deprecate** `search-attorneys` / `get-attorney` unless attorney data is confirmed present in the bulk set — no live option covers it.

## Open questions

- Is disambiguated entity identity (vs. name-based search) actually required by current consumers, or is name search sufficient? (Decides A-only vs. A+B.)
- Lens.org licensing/cost vs. expected query volume?
- For self-host: what corpus scope is acceptable (all US, or tech-area subset), and what refresh cadence?
- Confirm whether attorney/agent data exists in `pvgpatdis` before promising those two tools.

## Immediate, option-independent cleanup

Regardless of the direction chosen: make `test/patentsview.client.spec.ts` skip gracefully when the host is unreachable (so `pnpm validate` is green and the 6 timeouts stop masking real failures), and commit the clean dependency bump.
