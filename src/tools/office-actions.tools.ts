import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { OdpClient } from "../clients/odp.client"
import { config } from "../lib/config"
import { handleApiError, isForbiddenError } from "../lib/errors"

const OA_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const

/**
 * The structured office-action endpoints sit on a USPTO data tier the ODP key is not entitled to,
 * so they return HTTP 403 even when ODP itself is healthy. Rather than dead-ending, route the agent
 * to the file-wrapper download path, which serves the same content (the actual office-action PDFs).
 */
export const OA_FALLBACK_MESSAGE =
  "The structured office-action endpoint is unavailable for this credential (HTTP 403 — the office-action " +
  "data tier is not part of the USPTO ODP product this key is entitled to). To read office-action content, " +
  "list the application's documents with odp-get-documents, then download the relevant office-action document " +
  "with odp-download-document and read the returned PDF (OCR it if it is a scanned image with no text layer)."

export const handleOfficeActionError = (error: unknown): string =>
  isForbiddenError(error) ? OA_FALLBACK_MESSAGE : handleApiError(error)

const createClient = (): OdpClient => {
  return new OdpClient({
    apiKey:
      config.usptoApiKey ??
      (() => {
        throw new Error("USPTO_API_KEY is required")
      })(),
    timeout: config.requestTimeout,
  })
}

export const registerOfficeActionsTools = (server: FastMCP): void => {
  server.addTool({
    name: "office-action-get-text",
    description:
      "Get the full text of office actions for a patent application. Includes examiner rejections, objections, and requirements.",
    parameters: z.object({
      applicationNumber: z.string().describe("Application number (e.g., 16/123,456 or 16123456)"),
    }),
    annotations: OA_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getOfficeActionText(args.applicationNumber)
        return JSON.stringify(result)
      } catch (error) {
        return handleOfficeActionError(error)
      }
    },
  })

  server.addTool({
    name: "office-action-search",
    description: "Search office actions across USPTO patent applications.",
    parameters: z.object({
      query: z.string().describe("Search query text"),
      limit: z.number().int().min(1).max(100).default(25).describe("Number of results to return (1-100)"),
    }),
    annotations: OA_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.searchOfficeActions(args.query, args.limit)
        return JSON.stringify(result)
      } catch (error) {
        return handleOfficeActionError(error)
      }
    },
  })

  server.addTool({
    name: "office-action-get-citations",
    description:
      "Get prior art citations from office actions for a patent application. Shows references cited by the examiner.",
    parameters: z.object({
      applicationNumber: z.string().describe("Application number (e.g., 16/123,456 or 16123456)"),
    }),
    annotations: OA_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getOfficeActionCitations(args.applicationNumber)
        return JSON.stringify(result)
      } catch (error) {
        return handleOfficeActionError(error)
      }
    },
  })

  server.addTool({
    name: "office-action-get-rejections",
    description:
      "Get rejection data from office actions for a patent application. Includes rejection types (35 USC 101, 102, 103, 112) and affected claims.",
    parameters: z.object({
      applicationNumber: z.string().describe("Application number (e.g., 16/123,456 or 16123456)"),
    }),
    annotations: OA_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getOfficeActionRejections(args.applicationNumber)
        return JSON.stringify(result)
      } catch (error) {
        return handleOfficeActionError(error)
      }
    },
  })
}
