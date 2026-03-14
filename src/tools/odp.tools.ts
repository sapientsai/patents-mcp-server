import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { OdpClient } from "../clients/odp.client.js"
import { config } from "../lib/config.js"
import { handleApiError } from "../lib/errors.js"

const ODP_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const

const createClient = (): OdpClient => {
  if (!config.usptoApiKey) {
    throw new Error("USPTO_API_KEY is required for ODP tools")
  }
  return new OdpClient({
    apiKey: config.usptoApiKey,
    timeout: config.requestTimeout,
  })
}

export const registerOdpTools = (server: FastMCP): void => {
  server.addTool({
    name: "odp-search-applications",
    description:
      "Search USPTO patent applications via the Open Data Portal. Coverage: applications filed January 1, 2001 and later. Supports full-text search across application data.",
    parameters: z.object({
      query: z.string().describe("Search query text"),
      limit: z.number().int().min(1).max(100).default(25).describe("Number of results to return (1-100)"),
      offset: z.number().int().min(0).default(0).describe("Result offset for pagination"),
      sort: z.string().optional().describe("Sort field and direction"),
    }),
    annotations: ODP_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.searchApplications(args.query, args.limit, args.offset, args.sort)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "odp-get-application",
    description:
      "Get detailed information about a specific USPTO patent application by application number. Returns filing data, status, claims, and other application details.",
    parameters: z.object({
      applicationNumberText: z.string().describe("Application number (e.g., 16/123,456 or 16123456)"),
    }),
    annotations: ODP_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getApplication(args.applicationNumberText)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "odp-get-application-metadata",
    description: "Get metadata for a USPTO patent application including application type, entity status, and dates.",
    parameters: z.object({
      applicationNumberText: z.string().describe("Application number (e.g., 16/123,456 or 16123456)"),
    }),
    annotations: ODP_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getApplicationMetadata(args.applicationNumberText)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "odp-get-continuity",
    description:
      "Get continuity data (parent/child relationships) for a patent application. Shows continuation, divisional, and CIP relationships.",
    parameters: z.object({
      applicationNumberText: z.string().describe("Application number (e.g., 16/123,456 or 16123456)"),
    }),
    annotations: ODP_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getContinuity(args.applicationNumberText)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "odp-get-assignment",
    description: "Get assignment/ownership records for a patent application. Shows current and historical assignees.",
    parameters: z.object({
      applicationNumberText: z.string().describe("Application number (e.g., 16/123,456 or 16123456)"),
    }),
    annotations: ODP_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getAssignment(args.applicationNumberText)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "odp-get-adjustment",
    description:
      "Get patent term adjustment (PTA) data for an application. Shows delays attributable to the USPTO and applicant.",
    parameters: z.object({
      applicationNumberText: z.string().describe("Application number (e.g., 16/123,456 or 16123456)"),
    }),
    annotations: ODP_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getAdjustment(args.applicationNumberText)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "odp-get-attorney",
    description: "Get attorney/agent information for a patent application.",
    parameters: z.object({
      applicationNumberText: z.string().describe("Application number (e.g., 16/123,456 or 16123456)"),
    }),
    annotations: ODP_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getAttorney(args.applicationNumberText)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "odp-get-foreign-priority",
    description: "Get foreign priority claims for a patent application.",
    parameters: z.object({
      applicationNumberText: z.string().describe("Application number (e.g., 16/123,456 or 16123456)"),
    }),
    annotations: ODP_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getForeignPriority(args.applicationNumberText)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "odp-get-transactions",
    description:
      "Get transaction history for a patent application. Shows all prosecution events in chronological order.",
    parameters: z.object({
      applicationNumberText: z.string().describe("Application number (e.g., 16/123,456 or 16123456)"),
    }),
    annotations: ODP_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getTransactions(args.applicationNumberText)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "odp-get-documents",
    description: "Get document listing for a patent application. Returns metadata about filed and issued documents.",
    parameters: z.object({
      applicationNumberText: z.string().describe("Application number (e.g., 16/123,456 or 16123456)"),
    }),
    annotations: ODP_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getDocuments(args.applicationNumberText)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "odp-search-datasets",
    description: "Search USPTO bulk data datasets available through the Open Data Portal.",
    parameters: z.object({
      query: z.string().describe("Search query for datasets"),
    }),
    annotations: ODP_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.searchDatasets(args.query)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "odp-get-dataset",
    description: "Get details about a specific USPTO bulk data dataset by product ID.",
    parameters: z.object({
      productId: z.string().describe("Dataset product identifier"),
    }),
    annotations: ODP_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getDataset(args.productId)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })
}
