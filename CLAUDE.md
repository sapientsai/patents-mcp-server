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
```

## Architecture

### MCP Server: FastMCP + Zod

- **FastMCP** ^3.34.0 — MCP server framework
- **Zod** ^4 — parameter validation for all tools
- **Transport**: stdio (default) or httpStream (for deployment)
- **Tool naming**: kebab-case with source prefix (e.g., `epo-family-lookup`)

### Project Structure

```
src/
├── index.ts                    # Entry point: register tools, start server
├── server.ts                   # FastMCP instance
├── tools/
│   ├── index.ts                # registerAllTools — wires all tool modules
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
│   ├── patentsview.client.ts   # PatentsView client
│   ├── odp.client.ts           # USPTO ODP client (incl. PTAB, citations, OA)
│   ├── epo-ops.client.ts       # EPO OAuth 2.0 + XML parsing
│   └── bigquery.client.ts      # Google BigQuery client
├── resources/
│   └── index.ts                # 4 MCP resources (CPC, status codes, sources, syntax)
├── prompts/
│   └── index.ts                # 6 prompt templates (prior art, FTO, landscape, etc.)
└── lib/
    ├── config.ts               # Env var loading
    ├── retry.ts                # Exponential backoff with jitter
    ├── patent-number.ts        # Patent number normalization
    ├── types.ts                # Shared types
    └── errors.ts               # Error handling
```

### Data Sources

| Source      | Auth                | Tools    | Key Capability                                |
| ----------- | ------------------- | -------- | --------------------------------------------- |
| PatentsView | Optional API key    | 14       | US patent search, disambiguated entities      |
| USPTO ODP   | API key (x-api-key) | 12+7+6+4 | Applications, PTAB, citations, office actions |
| EPO OPS     | OAuth 2.0           | 8        | INPADOC families, legal status, claims text   |
| BigQuery    | GCP service account | 4        | Full-text claims search across 90M+ patents   |

### Configuration

See `.env.example` for all environment variables. Missing API keys disable related tools gracefully.

## Key Design Decisions

- **No PPUBS**: Killed — reverse-engineered, broken auth, EPO/BigQuery cover the need
- **functype**: Not currently used in codebase (available for future FP patterns)
- **Native fetch**: Node 22 built-in, no axios dependency
- **EPO XML**: Parsed with fast-xml-parser, namespace-aware
- **BigQuery**: Mandatory dryRun before every query, cost reported in responses
