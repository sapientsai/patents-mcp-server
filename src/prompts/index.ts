import type { FastMCP } from "fastmcp"

export const registerPrompts = (server: FastMCP): void => {
  server.addPrompt({
    name: "prior_art_search",
    description: "Workflow for finding prior art across all available patent data sources",
    arguments: [
      {
        name: "invention_description",
        description: "Description of the invention or technology to search for",
        required: true,
      },
      {
        name: "key_terms",
        description: "Key technical terms and synonyms (comma-separated)",
        required: false,
      },
      {
        name: "cpc_codes",
        description: "Relevant CPC classification codes (comma-separated)",
        required: false,
      },
    ],
    load: async (args) => {
      return `# Prior Art Search Workflow

## Invention Description
${args.invention_description}

${args.key_terms ? `## Key Terms\n${args.key_terms}\n` : ""}
${args.cpc_codes ? `## CPC Codes\n${args.cpc_codes}\n` : ""}

## Search Strategy

### Step 1: Keyword Search
Search across patent databases using key terms and synonyms:
- Use \`patentsview-search-patents\` for US granted patents (full-text search)
- Use \`epo-search-patents\` for international patents (CQL: ti/ab/ta fields)
- Use \`bigquery-patent-search\` for full-text claims search at scale

### Step 2: Classification Search
Search by CPC/IPC codes for relevant technology areas:
- Use \`patentsview-search-by-cpc\` for US patents by CPC code
- Use \`epo-search-patents\` with cpc= field for international coverage

### Step 3: Assignee/Inventor Search
Identify key players and their patent portfolios:
- Use \`patentsview-search-assignees\` to find relevant companies
- Use \`patentsview-search-inventors\` to find key inventors

### Step 4: Citation Analysis
Trace citation networks from relevant patents found:
- Use \`citations-get-enriched\` for enriched citation data
- Use \`bigquery-citation-network\` for deeper citation graph analysis

### Step 5: Family Analysis
For key prior art found, check international coverage:
- Use \`epo-family-lookup\` for INPADOC family members
- Use \`epo-legal-status\` to check if patents are still in force

### Step 6: Review & Document
Compile findings with patent numbers, key claims, and relevance assessment.`
    },
  })

  server.addPrompt({
    name: "patent_validity",
    description:
      "Structured approach to analyzing patent validity including prior art, prosecution history, and claim construction",
    arguments: [
      {
        name: "patent_number",
        description: "Patent number to analyze",
        required: true,
      },
      {
        name: "claims_of_interest",
        description: "Specific claim numbers to focus on (comma-separated)",
        required: false,
      },
    ],
    load: async (args) => {
      return `# Patent Validity Analysis: ${args.patent_number}

${args.claims_of_interest ? `## Claims of Interest: ${args.claims_of_interest}\n` : ""}

## Analysis Workflow

### Step 1: Patent Details
Retrieve complete patent information:
- Use \`patentsview-get-patent\` for bibliographic data
- Use \`patentsview-get-claims\` or \`epo-get-claims\` for claim text
- Use \`patentsview-get-description\` or \`epo-get-description\` for specification

### Step 2: Prosecution History
Review the patent's prosecution history:
- Use \`odp-get-transactions\` for prosecution events
- Use \`office-action-get-text\` for office action content
- Use \`office-action-get-rejections\` for rejection details
- Use \`odp-get-continuity\` for priority chain

### Step 3: Prior Art Citations
Analyze cited prior art:
- Use \`citations-get-enriched\` for citation data
- Use \`office-action-get-citations\` for examiner-cited references
- Use \`citations-get-metrics\` for citation impact

### Step 4: PTAB Proceedings
Check for post-grant challenges:
- Use \`ptab-search-proceedings\` with the patent number
- Use \`ptab-search-decisions\` for related decisions

### Step 5: Claim Construction
Analyze claim scope and limitations:
- Review claim language from Step 1
- Cross-reference with prosecution history amendments
- Identify means-plus-function limitations

### Step 6: Validity Assessment
Compile validity analysis covering:
- Novelty (35 USC 102) — prior art predating priority date
- Obviousness (35 USC 103) — combinations of prior art
- Written description (35 USC 112) — specification support
- Prosecution history estoppel — narrowing amendments`
    },
  })

  server.addPrompt({
    name: "competitor_portfolio",
    description: "Analyze a competitor's patent portfolio including trends, key technologies, and strategic insights",
    arguments: [
      {
        name: "company_name",
        description: "Name of the company to analyze",
        required: true,
      },
      {
        name: "technology_area",
        description: "Specific technology area to focus on (optional)",
        required: false,
      },
    ],
    load: async (args) => {
      return `# Competitor Patent Portfolio Analysis: ${args.company_name}

${args.technology_area ? `## Technology Focus: ${args.technology_area}\n` : ""}

## Analysis Workflow

### Step 1: Identify Portfolio
Find all patents assigned to the company:
- Use \`patentsview-search-assignees\` to find disambiguated assignee ID
- Use \`patentsview-search-patents\` with assignee filter
- Use \`epo-search-patents\` with pa="${args.company_name}" for international filings
- Use \`odp-search-applications\` for pending US applications

### Step 2: Technology Breakdown
Classify the portfolio by technology area:
- Use \`patentsview-search-by-cpc\` for CPC classification distribution
- Use \`bigquery-cpc-analytics\` for statistical analysis
- Identify core technology clusters

### Step 3: Filing Trends
Analyze temporal patterns:
- Track filing volumes over time
- Identify emerging technology areas
- Detect strategic shifts in R&D focus

### Step 4: Key Patents
Identify the most important patents:
- Use \`citations-get-metrics\` for highly-cited patents
- Use \`litigation-search\` for patents involved in litigation
- Use \`ptab-search-proceedings\` for challenged patents

### Step 5: Geographic Coverage
Assess worldwide patent strategy:
- Use \`epo-family-lookup\` for family sizes
- Use \`epo-legal-status\` for active jurisdictions
- Map geographic protection strategy

### Step 6: Strategic Assessment
Compile portfolio insights:
- Core vs. peripheral technology areas
- Defensive vs. offensive patent strategy
- White space opportunities
- Potential licensing or acquisition targets`
    },
  })

  server.addPrompt({
    name: "ptab_research",
    description: "Research PTAB proceedings (IPR/PGR/CBM) for a patent or technology area",
    arguments: [
      {
        name: "patent_number",
        description: "Patent number to research (optional if using query)",
        required: false,
      },
      {
        name: "query",
        description: "Search query for PTAB proceedings",
        required: false,
      },
    ],
    load: async (args) => {
      return `# PTAB Research

${args.patent_number ? `## Patent: ${args.patent_number}\n` : ""}
${args.query ? `## Query: ${args.query}\n` : ""}

## Research Workflow

### Step 1: Find Proceedings
- Use \`ptab-search-proceedings\` to find IPR/PGR/CBM proceedings
- Filter by type (IPR, PGR, CBM) as needed
- Check proceeding status (instituted, denied, settled, final written decision)

### Step 2: Review Documents
For each relevant proceeding:
- Use \`ptab-get-proceeding\` for proceeding details
- Use \`ptab-get-documents\` for filed documents
- Review petition, patent owner response, and institution decision

### Step 3: Analyze Decisions
- Use \`ptab-search-decisions\` for trial decisions
- Use \`ptab-get-decision\` for detailed decision analysis
- Track claim-by-claim outcomes

### Step 4: Appeal History
- Use \`ptab-search-appeals\` for ex parte appeal history
- Use \`ptab-get-appeal\` for appeal details
- Check Federal Circuit outcomes if applicable

### Step 5: Impact Assessment
- Which claims survived? Which were cancelled?
- What prior art was most effective?
- How does this affect the patent's enforceability?`
    },
  })

  server.addPrompt({
    name: "freedom_to_operate",
    description: "FTO analysis methodology — identify patents that could block a product or technology",
    arguments: [
      {
        name: "product_description",
        description: "Description of the product or technology to assess",
        required: true,
      },
      {
        name: "target_markets",
        description: "Target jurisdictions/markets (comma-separated, e.g., US, EP, JP)",
        required: false,
      },
      {
        name: "key_features",
        description: "Key technical features of the product (comma-separated)",
        required: false,
      },
    ],
    load: async (args) => {
      return `# Freedom to Operate Analysis

## Product Description
${args.product_description}

${args.target_markets ? `## Target Markets: ${args.target_markets}\n` : ""}
${args.key_features ? `## Key Features: ${args.key_features}\n` : ""}

## FTO Methodology

### Step 1: Define Scope
- Identify key technical features of the product
- Determine relevant CPC/IPC classification codes
- Define target jurisdictions for analysis

### Step 2: Patent Search
Comprehensive search for potentially blocking patents:
- Use \`patentsview-search-patents\` for US patents
- Use \`epo-search-patents\` for international patents
- Use \`bigquery-patent-search\` for full-text claims search
- Use \`patentsview-search-by-cpc\` for classification-based search
- Use \`odp-search-applications\` for pending applications

### Step 3: Claim Analysis
For each potentially relevant patent:
- Use \`patentsview-get-claims\` or \`epo-get-claims\` to read claim language
- Map product features to claim elements
- Identify independent claims vs. dependent claims
- Assess literal infringement and doctrine of equivalents

### Step 4: Patent Status
Verify each blocking patent is still enforceable:
- Use \`epo-legal-status\` for worldwide legal status
- Use \`odp-get-adjustment\` for patent term adjustment
- Check expiration dates and maintenance fee status
- Use \`odp-get-assignment\` for current ownership

### Step 5: Family Analysis
For blocking patents, check global coverage:
- Use \`epo-family-lookup\` for INPADOC family members
- Identify all jurisdictions where protection exists
- Cross-reference with target markets

### Step 6: Validity Assessment
Evaluate vulnerability of blocking patents:
- Use \`citations-get-enriched\` for prior art
- Use \`ptab-search-proceedings\` for post-grant challenges
- Use \`litigation-search\` for enforcement history

### Step 7: Risk Assessment
Compile FTO opinion:
- High risk: active patents with claims covering product features
- Medium risk: patents with arguable coverage
- Low risk: expired, narrow, or likely invalid patents
- Recommend design-arounds or licensing strategies`
    },
  })

  server.addPrompt({
    name: "patent_landscape",
    description: "Map the patent landscape for a technology area including key players, trends, and white spaces",
    arguments: [
      {
        name: "technology_area",
        description: "Technology area to map",
        required: true,
      },
      {
        name: "cpc_codes",
        description: "Relevant CPC codes (comma-separated)",
        required: false,
      },
      {
        name: "date_range",
        description: "Date range for analysis (e.g., 2020-2026)",
        required: false,
      },
    ],
    load: async (args) => {
      return `# Patent Landscape: ${args.technology_area}

${args.cpc_codes ? `## CPC Codes: ${args.cpc_codes}\n` : ""}
${args.date_range ? `## Date Range: ${args.date_range}\n` : ""}

## Landscape Mapping Workflow

### Step 1: Define Technology Boundaries
- Identify relevant CPC/IPC classification codes
- Define key technical terms and synonyms
- Establish date range for analysis

### Step 2: Quantitative Overview
- Use \`bigquery-cpc-analytics\` for filing statistics by CPC
- Use \`patentsview-search-by-cpc\` for US patent counts
- Track filing trends over time

### Step 3: Key Players
- Use \`patentsview-search-assignees\` to identify top filers
- Use \`epo-search-patents\` with pa= for international filers
- Rank assignees by portfolio size and growth rate

### Step 4: Technology Clusters
- Map sub-technology areas within the landscape
- Identify convergence of different technology streams
- Use CPC subclass analysis for granular breakdown

### Step 5: Geographic Distribution
- Use \`epo-family-lookup\` to assess where patents are filed
- Map filing patterns by jurisdiction
- Identify jurisdiction-specific trends

### Step 6: Citation Networks
- Use \`bigquery-citation-network\` for citation analysis
- Identify foundational patents (highly cited)
- Track knowledge flow between assignees

### Step 7: White Space Analysis
- Identify under-patented areas within the technology
- Map areas with expiring patent coverage
- Highlight emerging technology areas with few filings

### Step 8: Landscape Report
Compile landscape summary:
- Top assignees and their positions
- Technology trend analysis
- Geographic filing patterns
- White space opportunities
- Key patents to watch`
    },
  })
}
