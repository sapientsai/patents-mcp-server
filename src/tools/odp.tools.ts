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
      "Search USPTO patent applications via the Open Data Portal. Coverage: applications filed " +
      "January 1, 2001 and later. Supports Lucene syntax: quoted phrases, AND / OR / NOT, " +
      "field:(a AND b), wildcards such as correct*, and parenthesised grouping. Bare terms are " +
      "ANDed by default — see the mode parameter. Each hit returns a bibliographic summary: " +
      "number, title, dates, status, applicant, inventor, CPC, art unit, examiner. Call " +
      "odp-get-application for one application's full record.",
    parameters: z.object({
      query: z.string().describe("Search query text"),
      limit: z.number().int().min(1).max(100).default(25).describe("Number of results to return (1-100)"),
      offset: z.number().int().min(0).default(0).describe("Result offset for pagination"),
      mode: z
        .enum(["all", "any", "raw"])
        .default("all")
        .describe(
          "How bare multi-word terms are combined: all = AND (default), any = OR, raw = sent " +
            "verbatim. A query already containing quotes, parentheses, field:scoping or " +
            "AND/OR/NOT is never rewritten, whatever this is set to.",
        ),
      sortField: z
        .string()
        .optional()
        .describe('Field path to sort by, e.g. "applicationMetaData.filingDate". Omit to use relevance order.'),
      sortOrder: z
        .enum(["asc", "desc"])
        .default("desc")
        .describe("Sort direction. Applies only when sortField is set."),
      fields: z
        .array(z.string())
        .optional()
        .describe(
          "Field paths to return, replacing rather than extending the default bibliographic set (applicationNumberText is always included). Omit unless you need a field the summary leaves out.",
        ),
    }),
    annotations: ODP_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.searchApplications({
          query: args.query,
          mode: args.mode,
          limit: args.limit,
          offset: args.offset,
          sortField: args.sortField,
          sortOrder: args.sortOrder,
          fields: args.fields,
        })
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
    description:
      "Get metadata for a USPTO patent application including application type, entity status, and dates. Prefer this over odp-get-application when you need bibliographic facts rather than the file wrapper: it omits the attorney roster, which makes it dramatically smaller on applications filed by large firms.",
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
      "Retrieve the full text and content of any patent file-wrapper document — specifications, claims, drawings, office actions (rejections), applicant amendments and remarks, interview summaries, examiner search notes, and prior-art reference lists. This is the authoritative way to read what a document actually says: fetch the documentIdentifier from odp-get-documents (downloadOptionBag), and this tool downloads it and returns a fetchable URL (JSON of the form { url, mimeType, expiresInSeconds }; fetch the URL to retrieve the PDF, which expires after expiresInSeconds). " +
      'Use this whenever a question requires the contents of a prosecution document — e.g. "what was the examiner\'s rejection," "how did the applicant respond," "what prior art was cited." It is also the reliable fallback when the structured office-action endpoints (office-action-get-text/-rejections/-citations) are unavailable or return access errors, since those depend on a separate USPTO data tier. ' +
      "Note: older documents are often scanned images with no embedded text layer. The returned PDF is still complete and readable — the consumer should OCR it (rasterize + text-recognize) when direct text extraction yields nothing.",
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
