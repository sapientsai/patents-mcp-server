# Add Lens.org Patent Search to patents-mcp-server

## Problem

No current patent API can search US patent **claims and description text** by keyword:

| Source | Title/Abstract | Claims/Description | US Patents |
|--------|:-:|:-:|:-:|
| PatentsView | Yes | No | Yes |
| USPTO ODP | No (bibliographic only) | No | Yes |
| EPO OPS | Yes (worldwide) | EP/WO only, **not US** | No |
| BigQuery | Yes | Yes | Yes, but **227 GB/query** burns quota |
| **Lens.org** | **Yes** | **Yes** | **Yes** |

Google Patents finds "metarrestin" in US 10,301,314 because it indexes claims + description. None of our APIs can replicate that search — except Lens.org.

## Why Lens.org

- **WIPO-recognized** — listed in WIPO Manual on Open Source Patent Analytics and WIPO Inspire
- **Cambia non-profit** — funded by Rockefeller, Gates, Moore, Wellcome Trust foundations
- **153M patents** across 100+ countries with full US patent text (claims + description)
- **Elasticsearch query DSL** — `claim`, `description`, `full_text` fields all searchable
- **120+ searchable fields** — assignee, inventor, CPC, dates, legal status, citations, sequences
- **Legitimate** — not a scraper like SerpAPI

### Pricing

- **14-day free trial**: 5 req/min, 1,000 req/month (requires approval, 1-2 business days)
- **Production**: Contract with Cambia (pricing not public)

### Rate Limits

- 5 requests/minute
- 1,000 requests/month (trial/standard)
- Response headers: `x-rate-limit-remaining-request-per-minute`, `x-rate-limit-remaining-request-per-month`

## API Details

### Authentication

Token-based. Include in request header:
```
Authorization: Bearer <token>
```

### Search Endpoint

`POST https://api.lens.org/patent/search`

Content-Type: `application/json`

### Query Syntax (Elasticsearch DSL)

**Simple string query:**
```json
{
  "query": "claim:metarrestin AND jurisdiction:US",
  "size": 10
}
```

**Boolean query with field-specific search:**
```json
{
  "query": {
    "bool": {
      "must": [
        {"match": {"claim": "metarrestin"}}
      ],
      "filter": [
        {"term": {"jurisdiction": "US"}}
      ]
    }
  },
  "size": 10,
  "include": ["lens_id", "jurisdiction", "doc_number", "kind", "title", "abstract", "date_published"]
}
```

**Full-text search across claims + description:**
```json
{
  "query": {
    "bool": {
      "must": [
        {"match": {"full_text": "perinucleolar compartment inhibitor"}}
      ],
      "filter": [
        {"term": {"jurisdiction": "US"}},
        {"range": {"year_published": {"gte": 2015}}}
      ]
    }
  }
}
```

### Key Searchable Fields

| Field | Description |
|-------|-------------|
| `title` | Patent title |
| `abstract` | Patent abstract |
| `claim` | Claims text |
| `description` | Description/specification text |
| `full_text` | Complete patent text (title+abstract+claims+description) |
| `applicant.name` | Applicant/assignee name |
| `inventor.name` | Inventor name |
| `class_cpc.symbol` | CPC classification code |
| `class_ipcr.symbol` | IPC classification code |
| `jurisdiction` | Country code (US, EP, WO, etc.) |
| `date_published` | Publication date |
| `year_published` | Publication year |
| `patent_status` | ACTIVE, PENDING, EXPIRED, etc. |
| `doc_number` | Patent/application number |
| `lens_id` | Unique Lens identifier |
| `cited_by.patent.lens_id` | Forward citations |
| `reference_cited.patent.lens_id` | Backward citations |

### Response Structure

```json
{
  "total": 42,
  "data": [
    {
      "lens_id": "015-234-567-890-123",
      "jurisdiction": "US",
      "doc_number": "10301314",
      "kind": "B2",
      "date_published": "2019-05-28",
      "title": "Compounds and methods for...",
      "abstract": "...",
      "claim": "1. A method comprising...",
      "description": "...metarrestin...",
      "applicant": [{"name": "Northwestern University"}],
      "inventor": [{"name": "Frankowski Kevin"}],
      "class_cpc": [{"symbol": "C07D487/04"}],
      "patent_status": "ACTIVE"
    }
  ]
}
```

## Implementation Plan

### Design Decisions

- **Native fetch via BaseClient** — POST JSON to `api.lens.org/patent/search`. No npm package (none exists)
- **Separate files** — `lens.client.ts` + `lens.tools.ts` following one-source-per-file convention
- **Keep BigQuery `patent-search`** — Lens replaces the *need* for BigQuery full-text, but don't remove it; fix BigQuery separately if desired
- **Expose Lens's power** — full-text search, field-specific search, CPC/assignee/inventor filters, date ranges, jurisdiction
- **Two tools** — `lens-patent-search` (search with filters) + `lens-get-patent` (get full record by lens_id)

### Files to Create

#### 1. `src/clients/lens.client.ts` — Lens API Client

```typescript
// BaseClient with baseUrl "https://api.lens.org"
// Auth via Authorization: Bearer header (not query param)
// POST /patent/search with JSON body
// Two methods:
//   searchPatents(params) -> POST /patent/search
//   getPatent(lensId) -> POST /patent/search with lens_id filter

type LensSearchParams = {
  query: string               // Free-text or Elasticsearch query string
  claim?: string              // Search claims specifically
  description?: string        // Search description specifically
  fullText?: string           // Search all text fields
  applicant?: string          // Filter by applicant/assignee
  inventor?: string           // Filter by inventor
  cpc?: string                // CPC code filter
  jurisdiction?: string       // Country code (US, EP, WO)
  dateFrom?: string           // YYYY-MM-DD
  dateTo?: string             // YYYY-MM-DD
  status?: string             // ACTIVE, PENDING, EXPIRED
  size?: number               // Results per page (default 10, max 100)
  from?: number               // Offset for pagination
  sort?: string               // Field to sort by
  include?: string[]          // Fields to include in response
}
```

Build Elasticsearch DSL from params:
- If only `query` provided, use query string syntax
- If `claim`/`description`/`fullText` provided, build bool query with must clauses
- Add filters for jurisdiction, date range, CPC, status

#### 2. `src/tools/lens.tools.ts` — Tool Registrations

**`lens-patent-search`** — Full-text patent search via Lens.org
- `query` (string, optional) — Free-text search (searches all fields)
- `claim` (string, optional) — Search within claims text
- `description` (string, optional) — Search within description text
- `full_text` (string, optional) — Search across all text fields
- `applicant` (string, optional) — Filter by applicant/assignee name
- `inventor` (string, optional) — Filter by inventor name
- `cpc` (string, optional) — CPC classification filter
- `jurisdiction` (string, optional, default "US") — Country code
- `date_from` (string, optional) — Start date YYYY-MM-DD
- `date_to` (string, optional) — End date YYYY-MM-DD
- `status` (enum, optional) — ACTIVE, PENDING, EXPIRED
- `size` (number, optional, default 10, max 50) — Results count
- At least one of query/claim/description/full_text required

**`lens-get-patent`** — Get full patent record by Lens ID or patent number
- `lens_id` (string, optional) — Lens unique ID
- `doc_number` (string, optional) — Patent number (e.g., "10301314")
- `jurisdiction` (string, optional, default "US") — Country code
- One of lens_id or doc_number required

### Files to Modify

#### 3. `src/lib/config.ts`
- Add `lensApiToken: string | undefined` to `AppConfig`
- Add `lensApiToken: envOrUndefined("LENS_API_TOKEN")` to `loadConfig()`
- Add to `getAvailableSources()`:
  ```
  { name: "Lens.org", configured: cfg.lensApiToken !== undefined, healthy: false }
  ```

#### 4. `src/tools/index.ts`
- Import `registerLensTools`
- Add: `if (config.lensApiToken) { registerLensTools(server) }`

#### 5. `src/tools/utility.tools.ts`
- Add Lens health check in `check-api-status`
- Could ping `https://api.lens.org/patent/search` with a minimal query

#### 6. `src/resources/index.ts`
- Add Lens.org section to `patents://sources`
- Add Lens query syntax to `patents://search-syntax`

#### 7. `.env.example`
- Add `LENS_API_TOKEN=` with comment

### Implementation Order

1. `src/lib/config.ts` — add `lensApiToken`
2. `src/clients/lens.client.ts` — create client
3. `src/tools/lens.tools.ts` — create tool registrations
4. `src/tools/index.ts` — wire up registration
5. `src/tools/utility.tools.ts` — add health check
6. `src/resources/index.ts` — update docs
7. `.env.example` — add env var
8. `pnpm validate` — verify everything passes

### Deployment

1. Set `LENS_API_TOKEN` env var on Dokploy patents app (`UPEqVjGUmFPfH1EblCkk8`)
2. Commit + push → auto-deploy
3. Verify with `check-api-status`
4. Test: `lens-patent-search` with `claim: "metarrestin"` — should find US 10,301,314

## Prerequisites

- [ ] Sign up at https://www.lens.org/
- [ ] Request API trial access (Settings → API & Data → Request Trial)
- [ ] Wait for approval (1-2 business days)
- [ ] Generate API token
- [ ] Store token in envpkt as `LENS_API_TOKEN`

## Verification Queries

1. `lens-patent-search` with `claim: "metarrestin"` → should return US 10,301,314
2. `lens-patent-search` with `full_text: "perinucleolar compartment inhibitor"` → should find related patents
3. `lens-patent-search` with `applicant: "Northwestern University", cpc: "C07D487/04"` → should find pyrrolopyrimidine patents
4. `lens-get-patent` with `doc_number: "10301314", jurisdiction: "US"` → should return full patent record

## Current Patent Tool Coverage After Lens Integration

| Need | Tool |
|------|------|
| US patent search (title/abstract) | `patentsview-search-patents` |
| **US patent search (claims/description)** | **`lens-patent-search`** |
| International patent search | `epo-search-patents` (CQL) + `lens-patent-search` |
| Patent details by number | `patentsview-get-patent`, `epo-get-biblio`, `lens-get-patent` |
| Full claims text | `epo-get-claims`, `patentsview-get-claims` |
| Full description text | `epo-get-description`, `patentsview-get-description` |
| CPC analytics | `bigquery-cpc-analytics` |
| Citation networks | `bigquery-citation-network` |
| Patent families | `epo-family-lookup`, `bigquery-patent-family` |
| Legal status | `epo-legal-status` |
| PTAB proceedings | `ptab-search-proceedings` |
| Office actions | `office-action-search` |
| Litigation | `litigation-search` |

**55+ tools across 6 data sources** — comprehensive patent intelligence coverage.
