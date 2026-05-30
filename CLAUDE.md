# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FastMCP TypeScript patent intelligence MCP server. Provides ~45 tools across 4 data sources (USPTO ODP, EPO OPS, BigQuery, PTAB) for competitive IP landscape analysis, freedom-to-operate research, and patent monitoring.

Ported from Python `riemannzeta/patent_mcp_server` (51 tools) with EPO OPS and BigQuery added. PPUBS dependency killed (broken auth, reverse-engineered API). \*\*PatentsView removed (2026-05): its API host `search.patentsview.org` was decommissioned March 20, 2026 when PatentsView migrated to USPTO ODP as bulk-download datasets only — no live API replacement exists. See `docs/MCP_PLAN-PatentsView-Rehoming_2026-05-30.md` and `docs/superpowers/specs/2026-05-30-patentsview-duckdb-r2-design.md`.

## Development Commands

```bash
pnpm validate        # Main command: format + lint + test + build (use before commits)
pnpm format          # Format code with Prettier
pnpm lint            # Fix ESLint issues
pnpm test            # Run tests once
pnpm build           # Production build (outputs to dist/)
pnpm typecheck       # Check TypeScript types
pnpm codegen         # Regenerate Zod schemas from OpenAPI specs
pnpm fetch-specs     # Re-download OpenAPI specs from upstream
```

## Architecture

### MCP Server: FastMCP + Zod

- **FastMCP** ^3.34.0 — MCP server framework
- **Zod** ^4 — parameter validation for all tools + response validation via generated schemas
- **Transport**: stdio (default) or httpStream (for deployment)
- **Tool naming**: kebab-case with source prefix (e.g., `epo-family-lookup`)
- **Tool registration**: Conditional — tools only register when their required API keys are present

### Project Structure

```
src/
├── index.ts                    # Entry point: register tools, start server
├── server.ts                   # FastMCP instance
├── tools/
│   ├── index.ts                # registerAllTools — conditional on API key presence
│   ├── odp.tools.ts            # 13 tools — USPTO Open Data Portal (incl. document download)
│   ├── ptab.tools.ts           # 7 tools — PTAB proceedings
│   ├── citations.tools.ts      # 6 tools — Citations & Litigation
│   ├── epo.tools.ts            # 8 tools — EPO OPS (international)
│   ├── bigquery.tools.ts       # 4 tools — Google Patents BigQuery
│   ├── office-actions.tools.ts # 4 tools — Office Actions
│   └── utility.tools.ts        # 3 tools — Health check, CPC, status codes
├── clients/
│   ├── base.client.ts          # Shared fetch wrapper with retry (incl. getBinary for downloads)
│   ├── odp.client.ts           # USPTO ODP client (incl. PTAB, citations, OA, document download)
│   ├── epo-ops.client.ts       # EPO OAuth 2.0 + XML parsing
│   └── bigquery.client.ts      # Google BigQuery client
├── generated/
│   └── odp/                    # Zod schemas from USPTO ODP OpenAPI spec
├── specs/
│   └── uspto-odp.yaml          # USPTO ODP OpenAPI spec (local copy)
├── resources/
│   └── index.ts                # 4 MCP resources (CPC, status codes, sources, syntax)
├── prompts/
│   └── index.ts                # 6 prompt templates (prior art, FTO, landscape, etc.)
└── lib/
    ├── config.ts               # Env var loading + path expansion (functype-os)
    ├── retry.ts                # Exponential backoff with jitter
    ├── patent-number.ts        # Patent number normalization
    ├── types.ts                # Shared types
    └── errors.ts               # Error handling
```

### Data Sources

| Source    | Auth                | Tools    | Key Capability                                           |
| --------- | ------------------- | -------- | -------------------------------------------------------- |
| USPTO ODP | API key (X-API-KEY) | 13+7+6+4 | Applications, document PDF download, PTAB, citations, OA |
| EPO OPS   | OAuth 2.0           | 8        | INPADOC families, legal status, claims text              |
| BigQuery  | GCP service account | 4        | Full-text claims search across 90M+ patents              |

### Configuration

Environment variables are managed via [envpkt](https://github.com/jordanburke/envpkt) and referenced in `.mcp.json` as `${VAR}`. Missing API keys disable related tools gracefully — the server only registers tools whose required credentials are present.

Required env vars per source:

- **USPTO ODP/PTAB/Citations/Office Actions**: `USPTO_API_KEY`
- **EPO OPS**: `EPO_CONSUMER_KEY` + `EPO_CONSUMER_SECRET`
- **BigQuery**: `GOOGLE_APPLICATION_CREDENTIALS` (path, supports `~` expansion) + `GOOGLE_CLOUD_PROJECT`

### OpenAPI Codegen

The ODP client uses Zod schemas generated from its OpenAPI spec via [Hey API](https://heyapi.dev/):

```bash
pnpm fetch-specs     # Download latest spec
pnpm codegen         # Regenerate src/generated/
```

Generated schemas provide typed response validation.

## Key Design Decisions

- **No PPUBS**: Killed — reverse-engineered, broken auth, EPO/BigQuery cover the need
- **No PatentsView**: Removed — `search.patentsview.org` decommissioned 2026-03-20 (migrated to ODP bulk datasets only; no live API). US full-text search now via BigQuery; bibliographic via ODP
- **Conditional tool registration**: Tools only appear when their API keys are configured
- **functype-os**: Used for `~` and `$HOME` path expansion in `GOOGLE_APPLICATION_CREDENTIALS`
- **ODP document download**: `odp-download-document` proxies the binary PDF fetch through the server's `USPTO_API_KEY`; `BaseClient.getBinary` follows ODP's 302 redirect to the pre-signed download URL and returns a base64 PDF resource
- **Native fetch**: Node 22 built-in, no axios dependency
- **EPO XML**: Parsed with fast-xml-parser, namespace-aware
- **BigQuery**: Mandatory dryRun before every query, cost reported in responses; full-text search uses UNNEST for array struct fields
- **Response validation**: Generated Zod schemas validate API responses; `looseParse` falls back to raw data when API returns null for optional fields
