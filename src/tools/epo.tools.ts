import type { FastMCP } from "fastmcp"
import { z } from "zod"

import {
  epoFamilyLookup,
  epoGetAbstract,
  epoGetBiblio,
  epoGetClaims,
  epoGetDescription,
  epoLegalStatus,
  epoNumberConvert,
  epoSearchPatents,
} from "../clients/epo-ops.client.js"
import { handleApiError } from "../lib/errors.js"

const numberFormatSchema = z
  .enum(["docdb", "epodoc", "original"])
  .default("docdb")
  .describe("Patent number format: docdb (CC.NNNNNNN.K), epodoc (CCNNNNNNN), or original")

const readOnlyAnnotations = {
  readOnlyHint: true as const,
  destructiveHint: false as const,
  idempotentHint: true as const,
  openWorldHint: true as const,
}

export const registerEpoTools = (server: FastMCP): void => {
  server.addTool({
    name: "epo-search-patents",
    description: `Search European Patent Office via CQL query syntax.

CQL fields: ti (title), ab (abstract), ta (title+abstract), pa (applicant), in (inventor),
pn (publication number), cpc (CPC code), pd (publication date).
Operators: AND, OR, NOT. Truncation: * (multi-char), ? (single-char).
Max 10 query terms, max 2000 results.

Examples:
  ti="antibody drug conjugate"
  pa="Northwestern University" AND cpc=C07D487/04
  ta=metarrestin AND pd>=20200101`,
    parameters: z.object({
      query: z.string().describe("CQL query string"),
      range: z.string().optional().describe('Result range, e.g. "1-25" (max 100 per request)'),
    }),
    annotations: readOnlyAnnotations,
    execute: async (args) => {
      try {
        const result = await epoSearchPatents(args.query, args.range)
        return JSON.stringify(result, null, 2)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "epo-get-biblio",
    description:
      "Get bibliographic data for a patent from EPO OPS. Returns title, applicants, inventors, classification, priority claims, and publication details.",
    parameters: z.object({
      number: z.string().describe("Patent number (e.g., EP1000000, US7650331B1, WO2020123456)"),
      format: numberFormatSchema,
    }),
    annotations: readOnlyAnnotations,
    execute: async (args) => {
      try {
        const result = await epoGetBiblio(args.number, args.format)
        return JSON.stringify(result, null, 2)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "epo-get-abstract",
    description: "Get the abstract text of a patent from EPO OPS.",
    parameters: z.object({
      number: z.string().describe("Patent number"),
      format: numberFormatSchema,
    }),
    annotations: readOnlyAnnotations,
    execute: async (args) => {
      try {
        const result = await epoGetAbstract(args.number, args.format)
        return JSON.stringify(result, null, 2)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "epo-get-claims",
    description:
      "Get the full claims text of a patent from EPO OPS. Use this for reading claim language when PPUBS is unavailable.",
    parameters: z.object({
      number: z.string().describe("Patent number"),
      format: numberFormatSchema,
    }),
    annotations: readOnlyAnnotations,
    execute: async (args) => {
      try {
        const result = await epoGetClaims(args.number, args.format)
        return JSON.stringify(result, null, 2)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "epo-get-description",
    description:
      "Get the full patent description/specification text from EPO OPS. Use this for reading the detailed disclosure.",
    parameters: z.object({
      number: z.string().describe("Patent number"),
      format: numberFormatSchema,
    }),
    annotations: readOnlyAnnotations,
    execute: async (args) => {
      try {
        const result = await epoGetDescription(args.number, args.format)
        return JSON.stringify(result, null, 2)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "epo-family-lookup",
    description: `Look up INPADOC patent family members for a given patent. Returns all global family members
showing every jurisdiction where the invention has patent protection.

This is the highest-value EPO tool for FTO work — maps all family members across jurisdictions.
Critical for licensing, acquisition due diligence, and understanding worldwide patent coverage.`,
    parameters: z.object({
      number: z.string().describe("Patent number to look up family for"),
      format: numberFormatSchema,
    }),
    annotations: readOnlyAnnotations,
    execute: async (args) => {
      try {
        const result = await epoFamilyLookup(args.number, args.format)
        return JSON.stringify(result, null, 2)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "epo-legal-status",
    description: `Get worldwide legal status events for a patent from EPO OPS.
Shows legal status across ~44 patent offices: granted, lapsed, opposed, withdrawn, etc.
Critical for determining if a patent is still in force in specific jurisdictions.`,
    parameters: z.object({
      number: z.string().describe("Patent number"),
      format: numberFormatSchema,
    }),
    annotations: readOnlyAnnotations,
    execute: async (args) => {
      try {
        const result = await epoLegalStatus(args.number, args.format)
        return JSON.stringify(result, null, 2)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "epo-number-convert",
    description:
      "Convert a patent number between formats: docdb (CC.NNNNNNN.K), epodoc (CCNNNNNNN), and original filing format.",
    parameters: z.object({
      number: z.string().describe("Patent number to convert"),
      input_format: z.enum(["docdb", "epodoc", "original"]).describe("Input number format"),
      output_format: z.enum(["docdb", "epodoc", "original"]).describe("Desired output format"),
    }),
    annotations: readOnlyAnnotations,
    execute: async (args) => {
      try {
        const result = await epoNumberConvert(args.number, args.input_format, args.output_format)
        return JSON.stringify(result, null, 2)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })
}
