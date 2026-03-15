# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FastMCP TypeScript patent intelligence MCP server. Provides ~55 tools across 5 data sources (PatentsView, USPTO ODP, EPO OPS, BigQuery, PTAB) for competitive IP landscape analysis, freedom-to-operate research, and patent monitoring.

Ported from Python `riemannzeta/patent_mcp_server` (51 tools) with EPO OPS and BigQuery added. PPUBS dependency killed (broken auth, reverse-engineered API).

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
│   ├── patentsview.tools.ts    # 14 tools — PatentsView API
│   ├── odp.tools.ts            # 12 tools — USPTO Open Data Portal
│   ├── ptab.tools.ts           # 7 tools — PTAB proceedings
│   ├── citations.tools.ts      # 6 tools — Citations & Litigation
│   ├── epo.tools.ts            # 8 tools — EPO OPS (international)
│   ├── bigquery.tools.ts       # 4 tools — Google Patents BigQuery
│   ├── office-actions.tools.ts # 4 tools — Office Actions
│   └── utility.tools.ts        # 3 tools — Health check, CPC, status codes
├── clients/
│   ├── base.client.ts          # Shared fetch wrapper with retry
│   ├── patentsview.client.ts   # PatentsView client (Zod-validated responses)
│   ├── odp.client.ts           # USPTO ODP client (incl. PTAB, citations, OA)
│   ├── epo-ops.client.ts       # EPO OAuth 2.0 + XML parsing
│   └── bigquery.client.ts      # Google BigQuery client
├── generated/
│   ├── patentsview/            # Zod schemas from PatentsView OpenAPI spec
│   └── odp/                    # Zod schemas from USPTO ODP OpenAPI spec
├── specs/
│   ├── patentsview.json        # PatentsView OpenAPI spec (local copy)
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

| Source      | Auth                | Tools    | Key Capability                                |
| ----------- | ------------------- | -------- | --------------------------------------------- |
| PatentsView | API key (X-Api-Key) | 14       | US patent search, disambiguated entities      |
| USPTO ODP   | API key (X-API-KEY) | 12+7+6+4 | Applications, PTAB, citations, office actions |
| EPO OPS     | OAuth 2.0           | 8        | INPADOC families, legal status, claims text   |
| BigQuery    | GCP service account | 4        | Full-text claims search across 90M+ patents   |

### Configuration

Environment variables are managed via [envpkt](https://github.com/jordanburke/envpkt) and referenced in `.mcp.json` as `${VAR}`. Missing API keys disable related tools gracefully — the server only registers tools whose required credentials are present.

Required env vars per source:

- **PatentsView**: `PATENTSVIEW_API_KEY`
- **USPTO ODP/PTAB/Citations/Office Actions**: `USPTO_API_KEY`
- **EPO OPS**: `EPO_CONSUMER_KEY` + `EPO_CONSUMER_SECRET`
- **BigQuery**: `GOOGLE_APPLICATION_CREDENTIALS` (path, supports `~` expansion) + `GOOGLE_CLOUD_PROJECT`

### OpenAPI Codegen

PatentsView and ODP clients use Zod schemas generated from their OpenAPI specs via [Hey API](https://heyapi.dev/):

```bash
pnpm fetch-specs     # Download latest specs
pnpm codegen         # Regenerate src/generated/
```

Generated schemas provide typed response validation. The PatentsView client uses `looseParse` (safeParse with fallback) to handle the API returning `null` for optional fields that the OpenAPI spec marks as `string | undefined`.

## Key Design Decisions

- **No PPUBS**: Killed — reverse-engineered, broken auth, EPO/BigQuery cover the need
- **Conditional tool registration**: Tools only appear when their API keys are configured
- **functype-os**: Used for `~` and `$HOME` path expansion in `GOOGLE_APPLICATION_CREDENTIALS`
- **PatentsView GET-only**: API key grants GET but not POST access; all queries use GET with JSON-encoded query params
- **Native fetch**: Node 22 built-in, no axios dependency
- **EPO XML**: Parsed with fast-xml-parser, namespace-aware
- **BigQuery**: Mandatory dryRun before every query, cost reported in responses; full-text search uses UNNEST for array struct fields
- **Response validation**: Generated Zod schemas validate API responses; `looseParse` falls back to raw data when API returns null for optional fields
