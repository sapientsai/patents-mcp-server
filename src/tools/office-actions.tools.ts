import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { OdpClient } from "../clients/odp.client"
import { config } from "../lib/config"
import { handleApiError } from "../lib/errors"

const OA_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const

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
        return handleApiError(error)
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
        return handleApiError(error)
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
        return handleApiError(error)
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
        return handleApiError(error)
      }
    },
  })
}
