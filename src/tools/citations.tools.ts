import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { OdpClient } from "../clients/odp.client"
import { config } from "../lib/config"
import { handleApiError } from "../lib/errors"

const CITATIONS_ANNOTATIONS = {
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

export const registerCitationsTools = (server: FastMCP): void => {
  server.addTool({
    name: "citations-get-enriched",
    description:
      "Get enriched citation data for a patent, including forward and backward citations with metadata about cited/citing patents.",
    parameters: z.object({
      patentNumber: z.string().describe("Patent number (e.g., US10123456 or 10123456)"),
    }),
    annotations: CITATIONS_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getEnrichedCitations(args.patentNumber)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "citations-search",
    description: "Search patent citations across the USPTO database.",
    parameters: z.object({
      query: z.string().describe("Search query for citations"),
      limit: z.number().int().min(1).max(100).default(25).describe("Number of results to return (1-100)"),
    }),
    annotations: CITATIONS_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.searchCitations(args.query, args.limit)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "citations-get-metrics",
    description:
      "Get citation metrics for a patent including citation counts, citation velocity, and influence scores.",
    parameters: z.object({
      patentNumber: z.string().describe("Patent number (e.g., US10123456 or 10123456)"),
    }),
    annotations: CITATIONS_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getCitationMetrics(args.patentNumber)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "litigation-search",
    description:
      "Search patent litigation cases. Filter by plaintiff, defendant, patent number, court, and date range.",
    parameters: z.object({
      query: z.string().optional().describe("Search query text"),
      plaintiff: z.string().optional().describe("Plaintiff name filter"),
      defendant: z.string().optional().describe("Defendant name filter"),
      patent_number: z.string().optional().describe("Patent number filter"),
      court: z.string().optional().describe("Court name filter"),
      date_from: z.string().optional().describe("Start date filter (YYYY-MM-DD)"),
      date_to: z.string().optional().describe("End date filter (YYYY-MM-DD)"),
      limit: z.number().int().min(1).max(100).default(25).describe("Number of results to return (1-100)"),
    }),
    annotations: CITATIONS_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.searchLitigation({
          query: args.query,
          plaintiff: args.plaintiff,
          defendant: args.defendant,
          patent_number: args.patent_number,
          court: args.court,
          date_from: args.date_from,
          date_to: args.date_to,
          limit: args.limit,
        })
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "litigation-get-case",
    description: "Get detailed information about a specific patent litigation case.",
    parameters: z.object({
      caseId: z.string().describe("Litigation case identifier"),
    }),
    annotations: CITATIONS_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getLitigationCase(args.caseId)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "litigation-get-patent",
    description: "Get all litigation cases involving a specific patent.",
    parameters: z.object({
      patentNumber: z.string().describe("Patent number (e.g., US10123456 or 10123456)"),
    }),
    annotations: CITATIONS_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getLitigationByPatent(args.patentNumber)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })
}
