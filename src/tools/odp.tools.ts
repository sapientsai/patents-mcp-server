import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { OdpClient } from "../clients/odp.client"
import { config } from "../lib/config"
import { handleApiError } from "../lib/errors"
import { type FileStore, resourceStore } from "../resources/store"

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

/**
 * Fetches a file-wrapper PDF from USPTO, stashes it in the transient store, and returns the
 * JSON payload the tool surfaces: a fetchable URL on the server's own host (never the bytes,
 * never the USPTO key). Exported for testing.
 */
export const buildDownloadResult = async (
  client: Pick<OdpClient, "downloadDocument">,
  applicationNumberText: string,
  documentIdentifier: string,
  store: FileStore = resourceStore,
  baseUrl: string = config.publicBaseUrl,
): Promise<string> => {
  const { data } = await client.downloadDocument(applicationNumberText, documentIdentifier)
  const { id } = store.put(Buffer.from(data), "pdf")
  return JSON.stringify({
    url: `${baseUrl}/resources/${id}.pdf`,
    mimeType: "application/pdf",
    expiresInSeconds: store.ttlSeconds,
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
    name: "odp-download-document",
    description:
      "Download a patent file-wrapper document as a PDF from the USPTO Open Data Portal. Provide an application number and the documentIdentifier from odp-get-documents (downloadOptionBag). The server's USPTO_API_KEY authenticates the fetch and follows the ODP redirect, then caches the PDF transiently and returns a fetchable URL — JSON of the form { url, mimeType, expiresInSeconds }. Fetch the URL to retrieve the PDF; it expires after expiresInSeconds.",
    parameters: z.object({
      applicationNumberText: z.string().describe("Application number (e.g., 16/123,456 or 16123456)"),
      documentIdentifier: z
        .string()
        .describe("Document identifier from odp-get-documents downloadOptionBag (e.g., 'M4IR8IRKWFYGX56')"),
    }),
    annotations: ODP_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        return await buildDownloadResult(client, args.applicationNumberText, args.documentIdentifier)
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
