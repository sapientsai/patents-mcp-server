import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { OdpClient } from "../clients/odp.client"
import { config } from "../lib/config"
import { handleApiError } from "../lib/errors"

const PTAB_ANNOTATIONS = {
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

export const registerPtabTools = (server: FastMCP): void => {
  server.addTool({
    name: "ptab-search-proceedings",
    description:
      "Search PTAB (Patent Trial and Appeal Board) proceedings including IPR, PGR, and CBM trials. Returns trial metadata, parties, and status.",
    parameters: z.object({
      query: z.string().describe("Search query text"),
      type: z.enum(["IPR", "PGR", "CBM"]).optional().describe("Proceeding type filter"),
      limit: z.number().int().min(1).max(100).default(25).describe("Number of results to return (1-100)"),
    }),
    annotations: PTAB_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.searchProceedings(args.query, args.type, args.limit)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "ptab-get-proceeding",
    description: "Get detailed information about a specific PTAB proceeding by trial number.",
    parameters: z.object({
      trialNumber: z.string().describe("PTAB trial number (e.g., IPR2020-01234)"),
    }),
    annotations: PTAB_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getProceeding(args.trialNumber)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "ptab-get-documents",
    description: "Get documents filed in a PTAB proceeding.",
    parameters: z.object({
      trialNumber: z.string().describe("PTAB trial number (e.g., IPR2020-01234)"),
    }),
    annotations: PTAB_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getProceedingDocuments(args.trialNumber)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "ptab-search-decisions",
    description: "Search PTAB decisions across all proceeding types.",
    parameters: z.object({
      query: z.string().describe("Search query text"),
      limit: z.number().int().min(1).max(100).default(25).describe("Number of results to return (1-100)"),
    }),
    annotations: PTAB_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.searchDecisions(args.query, args.limit)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "ptab-get-decision",
    description: "Get a specific PTAB decision by ID.",
    parameters: z.object({
      decisionId: z.string().describe("Decision identifier"),
    }),
    annotations: PTAB_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getDecision(args.decisionId)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "ptab-search-appeals",
    description: "Search ex parte appeals to the PTAB.",
    parameters: z.object({
      query: z.string().describe("Search query text"),
      limit: z.number().int().min(1).max(100).default(25).describe("Number of results to return (1-100)"),
    }),
    annotations: PTAB_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.searchAppeals(args.query, args.limit)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "ptab-get-appeal",
    description: "Get details about a specific ex parte appeal.",
    parameters: z.object({
      appealId: z.string().describe("Appeal identifier"),
    }),
    annotations: PTAB_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getAppeal(args.appealId)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })
}
