import type { FastMCP } from "fastmcp"
import { z } from "zod"

import {
  bigqueryCitationNetwork,
  bigqueryCpcAnalytics,
  bigqueryPatentFamily,
  bigqueryPatentSearch,
} from "../clients/bigquery.client.js"
import { handleApiError } from "../lib/errors.js"

const readOnlyAnnotations = {
  readOnlyHint: true as const,
  destructiveHint: false as const,
  idempotentHint: true as const,
  openWorldHint: true as const,
}

export const registerBigQueryTools = (server: FastMCP): void => {
  server.addTool({
    name: "bigquery-patent-search",
    description: `Full-text search across 90M+ patent documents in Google Patents Public Data (BigQuery).
Searches title and abstract fields. Returns publication number, title, abstract, date, and assignees.
Cost estimate is included in every response. Free tier: 1 TB/month.

Use this for broad full-text patent search, especially when you need to search across claims text
or when PatentsView/EPO results are insufficient.`,
    parameters: z.object({
      query: z.string().describe("Search terms to find in patent titles and abstracts"),
      fields: z
        .array(z.string())
        .optional()
        .describe(
          "Fields to return (default: publication_number, title_localized, abstract_localized, publication_date, assignee_harmonized)",
        ),
      limit: z.number().min(1).max(100).default(25).describe("Maximum results to return"),
    }),
    annotations: readOnlyAnnotations,
    execute: async (args) => {
      try {
        const result = await bigqueryPatentSearch(args.query, args.fields, args.limit)
        return JSON.stringify(result, null, 2)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "bigquery-patent-family",
    description: `Get all patent family members by INPADOC family ID from Google Patents BigQuery.
Returns all publications sharing the same family ID with country, title, dates.
Complements epo-family-lookup with BigQuery's comprehensive dataset.`,
    parameters: z.object({
      family_id: z.string().describe("INPADOC family ID to look up"),
    }),
    annotations: readOnlyAnnotations,
    execute: async (args) => {
      try {
        const result = await bigqueryPatentFamily(args.family_id)
        return JSON.stringify(result, null, 2)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "bigquery-citation-network",
    description: `Build a citation graph for a patent from Google Patents BigQuery.
Returns all patents cited by the given patent (depth=1) or citations-of-citations (depth=2).
Publication numbers in DOCDB format (e.g., US-7650331-B1).
Useful for prior art analysis and understanding technology lineage.`,
    parameters: z.object({
      publication_number: z.string().describe("Publication number in DOCDB format (e.g., US-7650331-B1)"),
      depth: z
        .number()
        .min(1)
        .max(2)
        .default(1)
        .describe("Citation depth: 1 for direct citations, 2 for citations-of-citations"),
    }),
    annotations: readOnlyAnnotations,
    execute: async (args) => {
      try {
        const result = await bigqueryCitationNetwork(args.publication_number, args.depth)
        return JSON.stringify(result, null, 2)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "bigquery-cpc-analytics",
    description: `Patent filing statistics by CPC classification from Google Patents BigQuery.
Returns patent counts, unique assignees, and date ranges for each CPC code matching the prefix.
Useful for patent landscape analysis and identifying trends in technology areas.`,
    parameters: z.object({
      cpc_prefix: z
        .string()
        .describe("CPC code prefix to analyze (e.g., A61K for pharmaceuticals, C07D487 for specific compounds)"),
      date_from: z.string().optional().describe("Start date filter (YYYYMMDD format, e.g., 20200101)"),
      date_to: z.string().optional().describe("End date filter (YYYYMMDD format, e.g., 20261231)"),
    }),
    annotations: readOnlyAnnotations,
    execute: async (args) => {
      try {
        const result = await bigqueryCpcAnalytics(args.cpc_prefix, args.date_from, args.date_to)
        return JSON.stringify(result, null, 2)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })
}
