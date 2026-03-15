# patents-mcp-server

FastMCP TypeScript patent intelligence MCP server. 55 tools across USPTO, EPO, and Google Patents for IP landscape analysis, freedom-to-operate research, and patent monitoring.

## Data Sources

| Source              | Tools | Key Capability                                                                |
| ------------------- | ----- | ----------------------------------------------------------------------------- |
| **PatentsView**     | 14    | US patent search, disambiguated entities (assignees, inventors, attorneys)    |
| **USPTO ODP**       | 29    | Applications, PTAB proceedings, citations, litigation, office actions         |
| **EPO OPS**         | 8     | INPADOC patent families, legal status across ~44 offices, claims/descriptions |
| **Google BigQuery** | 4     | Full-text search across 90M+ patents, citation networks, CPC analytics        |

Tools only register when their required API keys are configured — no broken tools cluttering the MCP client.

## Quick Start

```bash
pnpm install
cp .env.example .env    # Add your API keys
pnpm build
```

### Run via stdio (Claude Desktop / Claude Code)

```bash
node dist/index.js
```

### Run via HTTP (remote deployment)

```bash
TRANSPORT=httpStream PORT=8080 node dist/index.js
```

### MCP Configuration (.mcp.json)

```json
{
  "mcpServers": {
    "patents": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "USPTO_API_KEY": "${USPTO_API_KEY}",
        "PATENTSVIEW_API_KEY": "${PATENTSVIEW_API_KEY}",
        "EPO_CONSUMER_KEY": "${EPO_CONSUMER_KEY}",
        "EPO_CONSUMER_SECRET": "${EPO_CONSUMER_SECRET}",
        "GOOGLE_APPLICATION_CREDENTIALS": "${GOOGLE_APPLICATION_CREDENTIALS}",
        "GOOGLE_CLOUD_PROJECT": "${GOOGLE_CLOUD_PROJECT}"
      }
    }
  }
}
```

### Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Configuration

### API Keys

| Source      | Env Var(s)                                                | Where to Get                                                               |
| ----------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| PatentsView | `PATENTSVIEW_API_KEY`                                     | [patentsview.org/apis/keyrequest](https://patentsview.org/apis/keyrequest) |
| USPTO ODP   | `USPTO_API_KEY`                                           | [data.uspto.gov](https://data.uspto.gov/) → MyODP                          |
| EPO OPS     | `EPO_CONSUMER_KEY` + `EPO_CONSUMER_SECRET`                | [developers.epo.org](https://developers.epo.org/)                          |
| BigQuery    | `GOOGLE_APPLICATION_CREDENTIALS` + `GOOGLE_CLOUD_PROJECT` | GCP Console (service account with BigQuery roles)                          |

Missing API keys disable related tools gracefully — the server still starts with whatever sources are configured. Use the `check-api-status` tool to verify which sources are available.

### Credential Management with envpkt

This project uses [envpkt](https://github.com/jordanburke/envpkt) for credential management. API keys are stored as sealed (age-encrypted) packets and non-secret config as `[env.*]` entries in `envpkt.toml`. The `.mcp.json` references env vars via `${VAR}` syntax, which are loaded by `eval "$(envpkt env export)"` in your shell profile.

### Path Expansion

`GOOGLE_APPLICATION_CREDENTIALS` supports tilde (`~`) and environment variable (`$HOME`, `${HOME}`) expansion via [functype-os](https://github.com/jordanburke/functype-os). Use paths like `~/.config/gcloud/key.json` instead of absolute paths.

### BigQuery Cost Notes

- Free tier: **1TB/month** of queries scanned
- A broad full-text search across 90M patents scans ~200-300GB per query
- Targeted queries (patent number, family, CPC with date range) scan much less
- Every query runs a dry run first; estimated cost is included in the response

## Tools

### PatentsView (14 tools)

Search and retrieve US patent data with disambiguated entities.

- `patentsview-search-patents` — Full-text search by text, assignee, or inventor
- `patentsview-get-patent` — Get patent by ID
- `patentsview-search-assignees` / `get-assignee` — Disambiguated assignee search
- `patentsview-search-inventors` / `get-inventor` — Disambiguated inventor search
- `patentsview-search-attorneys` / `get-attorney` — Attorney search
- `patentsview-get-claims` — Full claims text
- `patentsview-get-description` — Patent description
- `patentsview-search-by-cpc` / `lookup-cpc` — CPC classification search
- `patentsview-search-by-ipc` / `lookup-ipc` — IPC classification search

### USPTO ODP (12 tools)

Official USPTO Open Data Portal — applications, prosecution history, assignments.

- `odp-search-applications` — Search patent applications (2001+)
- `odp-get-application` / `metadata` / `continuity` / `assignment` / `adjustment` / `attorney` / `foreign-priority` / `transactions` / `documents`
- `odp-search-datasets` / `get-dataset` — Bulk data products

### PTAB (7 tools)

Post-grant proceedings — IPR, PGR, CBM, ex parte appeals.

- `ptab-search-proceedings` / `get-proceeding` / `get-documents`
- `ptab-search-decisions` / `get-decision`
- `ptab-search-appeals` / `get-appeal`

### Citations & Litigation (6 tools)

Patent citations and litigation data.

- `citations-get-enriched` / `search` / `get-metrics`
- `litigation-search` / `get-case` / `get-patent`

### EPO OPS (8 tools)

European Patent Office — international coverage, INPADOC families, legal status.

- `epo-search-patents` — CQL search (title, abstract, applicant, inventor, CPC, date)
- `epo-get-biblio` / `abstract` / `claims` / `description` — Patent document sections
- `epo-family-lookup` — INPADOC family members across all jurisdictions
- `epo-legal-status` — Legal status across ~44 patent offices
- `epo-number-convert` — Convert between number formats

### Google BigQuery (4 tools)

Full-text search across 90M+ patent documents. Replaces PPUBS for claims search.

- `bigquery-patent-search` — Full-text search across titles and abstracts
- `bigquery-patent-family` — Family members by INPADOC family ID
- `bigquery-citation-network` — Citation graph (depth 1 or 2)
- `bigquery-cpc-analytics` — Filing statistics by CPC classification

### Office Actions (4 tools)

USPTO office action data (migrating to ODP in 2026).

- `office-action-get-text` / `search` / `get-citations` / `get-rejections`

### Utility (3 tools)

- `check-api-status` — Health check all configured APIs
- `get-cpc-info` — CPC classification lookup
- `get-status-code` — USPTO status code meanings

## Prompts

Six workflow prompt templates for common patent analysis tasks:

| Prompt                 | Purpose                                    |
| ---------------------- | ------------------------------------------ |
| `prior_art_search`     | Multi-source prior art search workflow     |
| `patent_validity`      | Structured validity analysis (102/103/112) |
| `competitor_portfolio` | Competitor patent portfolio analysis       |
| `ptab_research`        | PTAB proceedings research (IPR/PGR/CBM)    |
| `freedom_to_operate`   | FTO analysis methodology                   |
| `patent_landscape`     | Technology area landscape mapping          |

## Resources

| URI                       | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `patents://cpc/{code}`    | CPC classification info                                  |
| `patents://status-codes`  | USPTO status code definitions                            |
| `patents://sources`       | Data source overview                                     |
| `patents://search-syntax` | Query syntax guide (PatentsView, EPO CQL, ODP, BigQuery) |

## Development

```bash
pnpm validate        # Format + lint + typecheck + test + build
pnpm test            # Run tests
pnpm build           # Production build
pnpm typecheck       # Type check only
pnpm codegen         # Regenerate Zod schemas from OpenAPI specs
pnpm fetch-specs     # Re-download OpenAPI specs from upstream
```

### OpenAPI Codegen

Response schemas are generated from upstream OpenAPI specs using [Hey API](https://heyapi.dev/) with the Zod plugin:

```bash
pnpm fetch-specs     # Download PatentsView + USPTO ODP specs
pnpm codegen         # Generate src/generated/{patentsview,odp}/zod.gen.ts
```

Generated code is committed to the repo so CI doesn't need the codegen step.

### Testing

Integration tests run against live APIs when credentials are available:

```bash
# Requires PATENTS_VIEW_API_KEY or PATENTSVIEW_API_KEY in env
# Requires USPTO_API_KEY in env
pnpm test
```

Tests skip gracefully when API keys are absent.

## Architecture

Built with [FastMCP](https://github.com/punkpeye/fastmcp) + [Zod](https://zod.dev/) + [ts-builds](https://github.com/jordanburke/ts-builds) + [functype-os](https://github.com/jordanburke/functype-os).

```
src/
├── index.ts                    # Entry point
├── server.ts                   # FastMCP instance
├── tools/                      # 55 tools across 8 modules (conditional registration)
├── clients/                    # API clients (base, PatentsView, ODP, EPO, BigQuery)
├── generated/                  # Zod schemas from OpenAPI specs (Hey API codegen)
├── specs/                      # Local copies of OpenAPI specs
├── resources/                  # 4 MCP resources
├── prompts/                    # 6 prompt templates
└── lib/                        # Config, retry, errors, patent number normalization
```

## License

MIT

## Acknowledgments

- [USPTO](https://www.uspto.gov/) - US Patent and Trademark Office
- [EPO OPS](https://www.epo.org/en/searching-for-patents/data/web-services/ops) - European Patent Office Open Patent Services
- [PatentsView](https://patentsview.org/) - USPTO patent data platform
- [Google Patents Public Data](https://console.cloud.google.com/marketplace/product/google_patents_public_datasets/google-patents-public-data) - BigQuery patent dataset

---

**Sponsored by <a href="https://sapientsai.com/"><img src="https://sapientsai.com/images/logo.svg" alt="SapientsAI" width="20" style="vertical-align: middle;"> SapientsAI</a>** — Building agentic AI for businesses
