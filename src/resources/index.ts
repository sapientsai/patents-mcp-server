import type { FastMCP } from "fastmcp"

const STATUS_CODES: Record<string, string> = {
  "30": "Docketed New Case - Ready for Examination",
  "40": "Non Final Action Mailed",
  "41": "Non Final Action - Loss of Right to Respond",
  "60": "Final Rejection Mailed",
  "61": "Final Rejection - Loss of Right to Respond",
  "71": "Response After Final Action Forwarded to Examiner",
  "100": "Request for Prioritized Examination",
  "110": "RCE Filed",
  "120": "Case Reopened After Allowance",
  "150": "Patent Granted",
  "161": "Patent Expired Due to NonPayment of Maintenance Fees",
  "250": "Application Disposed of / Abandoned",
  "500": "Notice of Allowance Mailed",
  "600": "Appeal - Awaiting Decision",
  "700": "Interference Proceeding",
  "800": "Interference Proceeding - Patent Case",
  "900": "Petition Granted",
}

const SOURCES_DESCRIPTION = `# Patent Data Sources

## PatentsView (search.patentsview.org)
- **Coverage**: Granted US patents 1976–present, pre-grant publications 2001–present
- **Strengths**: Full-text search, disambiguated entities (assignees, inventors, attorneys)
- **Auth**: Optional API key (key grants suspended March 2026)
- **Rate limit**: 45 req/min
- **Note**: Migrating to USPTO Open Data Portal (ODP). May return 403 after March 20, 2026.

## USPTO Open Data Portal - ODP (api.uspto.gov)
- **Coverage**: Patent applications filed January 1, 2001+
- **Strengths**: Official USPTO data, prosecution history, assignments, continuity
- **Auth**: API key required (x-api-key header)
- **Rate limit**: 60 req/min, 4 req/min for downloads
- **Includes**: PTAB proceedings (v3), litigation data, office actions

## EPO Open Patent Services - OPS (ops.epo.org)
- **Coverage**: Worldwide patent data, ~100M+ documents
- **Strengths**: INPADOC patent families, legal status across ~44 offices, full-text claims/descriptions
- **Auth**: OAuth 2.0 client credentials (register at developers.epo.org)
- **Rate limit**: Traffic light system (Green/Yellow/Red/Black)
- **Free tier**: ~3.5 GB/week
- **Query**: CQL syntax (ti, ab, pa, in, pn, cpc, pd fields)

## Google Patents BigQuery (patents-public-data)
- **Coverage**: 90M+ patent documents worldwide
- **Strengths**: Full-text SQL search across claims/abstracts, citation networks, analytics
- **Auth**: GCP service account
- **Free tier**: 1 TB/month query processing, then $5/TB
- **Note**: Always uses dryRun to estimate cost before executing queries

## PTAB (via ODP)
- **Coverage**: IPR, PGR, CBM proceedings and ex parte appeals
- **Strengths**: Trial documents, decisions, institution records
- **Auth**: Same as ODP (API key)

## Litigation (via ODP)
- **Coverage**: 74K+ patent litigation cases
- **Strengths**: Case details, parties, courts, outcomes

## Office Actions (migrating to ODP)
- **Coverage**: USPTO office actions
- **Strengths**: Rejection text, examiner citations, response history`

const SEARCH_SYNTAX = `# Patent Search Syntax Guide

## PatentsView Query Format
PatentsView uses a JSON query format with q/f/s/o parameters:

### Query operators (q):
- \`{"_text_any": {"patent_abstract": "drug delivery"}}\` — text search
- \`{"_eq": {"patent_number": "11646472"}}\` — exact match
- \`{"_begins": {"cpc_group_id": "A61K"}}\` — prefix match
- \`{"_and": [{...}, {...}]}\` — combine conditions
- \`{"_or": [{...}, {...}]}\` — alternative conditions

### Fields (f): Array of field names to return
### Sort (s): Array of {field: "asc"|"desc"} objects
### Options (o): {"limit": 25, "offset": 0}

## EPO CQL (Contextual Query Language)
Used with epo-search-patents tool:

### Fields:
- \`ti\` — Title: \`ti="antibody drug conjugate"\`
- \`ab\` — Abstract: \`ab=metarrestin\`
- \`ta\` — Title + Abstract: \`ta=perinucleolar\`
- \`pa\` — Applicant: \`pa="Northwestern University"\`
- \`in\` — Inventor: \`in="Sui Huang"\`
- \`pn\` — Publication number: \`pn=US10301314\`
- \`cpc\` — CPC code: \`cpc=C07D487/04\`
- \`pd\` — Publication date: \`pd>=20200101\`

### Operators: AND, OR, NOT
### Truncation: * (multi-char), ? (single-char)
### Limits: Max 10 query terms, max 2000 results per query

## USPTO ODP
ODP uses simple text search:
- \`searchText\` parameter with free-text query
- Patent number formats: 17248024, 17/248,024, US 17/248,024, US-11646472-B2

## Google BigQuery SQL
Standard SQL against patents-public-data.patents.publications:
- Full-text: \`WHERE SEARCH(abstract_localized.text, 'metarrestin')\`
- CPC: \`CROSS JOIN UNNEST(cpc) AS c WHERE c.code LIKE 'A61K%'\`
- Claims: \`CROSS JOIN UNNEST(claims_localized) AS cl WHERE SEARCH(cl.text, 'antibody')\`
- Date: \`WHERE publication_date >= 20200101\`
- Publication number in DOCDB format: US-7650331-B1`

export const registerResources = (server: FastMCP): void => {
  server.addResourceTemplate({
    uriTemplate: "patents://cpc/{code}",
    name: "CPC Classification",
    description: "Look up CPC (Cooperative Patent Classification) code information",
    mimeType: "application/json",
    arguments: [
      {
        name: "code",
        description: "CPC classification code (e.g., A61K, C07D487/04)",
        required: true,
      },
    ],
    load: async (args) => {
      return {
        text: JSON.stringify(
          {
            code: args.code,
            note: "Use get-cpc-info tool or patentsview-lookup-cpc for detailed CPC information",
            sections: {
              A: "Human Necessities",
              B: "Performing Operations; Transporting",
              C: "Chemistry; Metallurgy",
              D: "Textiles; Paper",
              E: "Fixed Constructions",
              F: "Mechanical Engineering; Lighting; Heating; Weapons; Blasting",
              G: "Physics",
              H: "Electricity",
              Y: "General Tagging of New Technological Developments",
            },
          },
          null,
          2,
        ),
      }
    },
  })

  server.addResource({
    uri: "patents://status-codes",
    name: "USPTO Status Codes",
    description: "USPTO application status code definitions",
    mimeType: "application/json",
    load: async () => ({
      text: JSON.stringify(STATUS_CODES, null, 2),
    }),
  })

  server.addResource({
    uri: "patents://sources",
    name: "Patent Data Sources",
    description: "Overview of all patent data sources available through this server",
    mimeType: "text/markdown",
    load: async () => ({
      text: SOURCES_DESCRIPTION,
    }),
  })

  server.addResource({
    uri: "patents://search-syntax",
    name: "Search Syntax Guide",
    description: "Query syntax guide for PatentsView, EPO CQL, ODP, and BigQuery",
    mimeType: "text/markdown",
    load: async () => ({
      text: SEARCH_SYNTAX,
    }),
  })
}
