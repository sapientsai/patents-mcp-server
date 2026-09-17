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
} from "../clients/epo-ops.client"
import { handleApiError } from "../lib/errors"

const numberFormatSchema = z
  .enum(["docdb", "epodoc", "original"])
  .optional()
  .describe(
    "Patent number format: docdb (EP.1000000.A1 or US7650331B1), epodoc (EP1000000), or " +
      "original. Omit this — it is inferred from whether the number carries a kind code, which is " +
      "what OPS actually requires. Set it only to override that inference.",
  )

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

Returns a triage-sized hit list: publication number, title, applicants, publication date and
family id per hit. Use epo-get-biblio for one publication's complete record.

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
      "Get bibliographic data for a patent from EPO OPS. Returns one flattened entry per publication of that number — a European patent yields both the A1 application and the B1 grant — each with title, abstract, applicants, inventors, IPC, CPC and national classifications, priority claims and earliest priority date, cited references, application number, dates and family id.",
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
      "Get the claims text of a patent from EPO OPS. Given a number with no kind code, this resolves to the GRANTED publication (B) when one exists, rather than the application as filed (A) — those differ, and the granted claims are the enforceable ones. The result reports which publication it served. Returns one string per claim, preferring English when OPS carries several translations. Coverage is EP and WO publications only.",
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
    description: `Look up INPADOC patent family members for a given patent. Returns every family member with its
jurisdiction, publication number, kind, date, title and applicants, plus the distinct list of
jurisdictions.

This maps where protection was SOUGHT. It carries no legal status, so it does not tell you where
a patent is still in force — a lapsed member looks identical to a live one here. Call
epo-legal-status for grant, lapse and opposition events per member before relying on this for
freedom-to-operate or due diligence.`,
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
    description: `Get worldwide legal status events for a patent, per INPADOC family member.
Returns grant, lapse, opposition and fee events, each with the jurisdiction it applies to and
its effective date.

A single EP event fans out across contracting states — one lapse becomes nineteen national
records with their own countries and dates — so \`jurisdictions\` lists every state touched, not
just the family members. This is the tool for whether a patent is still in force somewhere;
epo-family-lookup only says where protection was sought.`,
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
      reference_type: z
        .enum(["publication", "application", "priority"])
        .default("publication")
        .describe("What the number refers to"),
    }),
    annotations: readOnlyAnnotations,
    execute: async (args) => {
      try {
        const result = await epoNumberConvert(args.number, args.input_format, args.output_format, args.reference_type)
        return JSON.stringify(result, null, 2)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })
}
