# Add SerpAPI Google Patents Search to patents-mcp-server

## Context

The `bigquery-patent-search` tool scans **227 GB per query** across the `patents-public-data.patents.publications` table (90M+ patents). This burns through BigQuery's 1 TB/month free tier in ~4 queries, and costs ~$1.13/query on paid tier. Multi-word searches were failing silently due to quota exhaustion.

**Solution**: Replace `bigquery-patent-search` with SerpAPI Google Patents, which uses Google's own search index. SerpAPI costs ~$0.01-0.025/search with rich filtering (assignee, inventor, country, date, status). Keep the other 3 BigQuery tools (`patent-family`, `citation-network`, `cpc-analytics`) which are scoped by specific IDs/codes and scan far less data.

Also add a `serpapi-patent-details` tool that retrieves full patent info (abstract, claims, classifications, citations, legal events) — high value for Civala's pharma IP landscape work.

## Design Decisions

- **Native fetch via BaseClient** — no `serpapi` npm package. SerpAPI is just GET requests with query params; consistent with existing codebase pattern
- **Separate files** — `serpapi.client.ts` + `serpapi.tools.ts` following one-source-per-file convention
- **Remove `bigquery-patent-search`** entirely — SerpAPI is a direct replacement; no fallback needed
- **Expose SerpAPI's filtering natively** — assignee, inventor, country, date range, status, sort all as tool parameters

## Files to Create

### 1. `src/clients/serpapi.client.ts` — SerpAPI Client

Compose `BaseClient` with `baseUrl: "https://serpapi.com"`. Two methods:

- `searchPatents(params)` → GET `/search?engine=google_patents&api_key=...&q=...`
- `getPatentDetails(patentId)` → GET `/search?engine=google_patents_details&api_key=...&patent_id=...`

API key passed as query param (not header). BaseClient's `get()` accepts `Record<string, string>` params and filters undefined/empty values automatically (`base.client.ts:51-53`).

Define types for search params, organic results, and details response.

### 2. `src/tools/serpapi.tools.ts` — Tool Registrations

Export `registerSerpApiTools(server: FastMCP)` with two tools:

**`serpapi-patent-search`** — Google Patents full-text search
- `query` (string, required)
- `page` (number, optional, default 1)
- `num` (number, optional, 10-100, default 10)
- `inventor` (string, optional)
- `assignee` (string, optional)
- `country` (string, optional)
- `before` (string, optional, YYYYMMDD)
- `after` (string, optional, YYYYMMDD)
- `status` (enum "Grant" | "Application", optional)
- `sort` (enum "new" | "old" | "relevance", optional)

**`serpapi-patent-details`** — Full patent details
- `patent_id` (string, required) — e.g., "US-10301314-B2"

Both use `readOnlyAnnotations`.

## Files to Modify

### 3. `src/lib/config.ts`
- Add `serpApiKey: string | undefined` to `AppConfig` type
- Add `serpApiKey: envOrUndefined("SERPAPI_API_KEY")` to `loadConfig()`
- Add SerpAPI entry to `getAvailableSources()`:
  ```
  { name: "SerpAPI Google Patents", configured: cfg.serpApiKey !== undefined, healthy: false }
  ```

### 4. `src/tools/index.ts`
- Import `registerSerpApiTools`
- Add: `if (config.serpApiKey) { registerSerpApiTools(server) }`

### 5. `src/tools/bigquery.tools.ts`
- Remove `bigquery-patent-search` tool registration (keep other 3)
- Remove `bigqueryPatentSearch` import

### 6. `src/clients/bigquery.client.ts`
- Remove `bigqueryPatentSearch` export function
- Keep `bigqueryPatentFamily`, `bigqueryCitationNetwork`, `bigqueryCpcAnalytics`

### 7. `src/tools/utility.tools.ts`
- Add SerpAPI health check in `check-api-status` tool (use `https://serpapi.com/account?api_key=...` endpoint)
- Update tool description to mention SerpAPI

### 8. `src/resources/index.ts`
- Add SerpAPI section to `patents://sources` resource
- Add SerpAPI syntax to `patents://search-syntax` resource
- Update BigQuery section to note it no longer has full-text search

### 9. `.env.example`
- Add `SERPAPI_API_KEY=` with comment
- Update BigQuery comment (no longer for full-text search)

## Implementation Order

1. `src/lib/config.ts` — add `serpApiKey` (everything depends on this)
2. `src/clients/serpapi.client.ts` — create client (tools depend on this)
3. `src/tools/serpapi.tools.ts` — create tool registrations
4. `src/tools/index.ts` — wire up SerpAPI registration
5. `src/clients/bigquery.client.ts` — remove `bigqueryPatentSearch`
6. `src/tools/bigquery.tools.ts` — remove `bigquery-patent-search` tool
7. `src/tools/utility.tools.ts` — add SerpAPI health check
8. `src/resources/index.ts` — update source docs
9. `.env.example` — add SerpAPI env var

## Verification

1. `pnpm validate` — format, lint, typecheck, test all pass
2. Commit + push → Dokploy auto-deploy
3. Set `SERPAPI_API_KEY` env var on Dokploy patents app
4. Redeploy if needed
5. `check-api-status` — verify SerpAPI shows configured + healthy
6. `serpapi-patent-search` with query "metarrestin" — verify results
7. `serpapi-patent-search` with multi-word query + filters — verify filtering works
8. `serpapi-patent-details` with a known patent ID — verify full details returned
9. Verify BigQuery tools still work: `bigquery-cpc-analytics` with a CPC prefix
