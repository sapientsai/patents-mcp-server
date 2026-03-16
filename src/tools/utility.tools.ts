import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { config, getAvailableSources } from "../lib/config"
import { handleApiError } from "../lib/errors"
import type { ApiStatus } from "../lib/types"

const UTILITY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const

const STATUS_CODE_MAP: Record<string, string> = {
  "0": "Unknown",
  "1": "Abandoned -- Failure to Respond to an Office Action",
  "2": "Abandoned -- Failure to Pay Issue Fee",
  "3": "Abandoned -- After Examiner's Answer or Board Decision",
  "5": "Abandoned -- Expressly Abandoned",
  "17": "Docketed New Case - Ready for Examination",
  "19": "Application Dispatched from Preexam, Not Yet Docketed",
  "20": "Awaiting TC Resp., Issue Fee Not Paid",
  "30": "Patented Case",
  "41": "Non Final Action Mailed",
  "44": "Advisory Action Mailed",
  "47": "Final Rejection Mailed",
  "60": "Response to Non-Final Office Action Entered and Forwarded to Examiner",
  "62": "Response after Non-Final Action Forwarded to Examiner",
  "63": "Response after Final Action Forwarded to Examiner",
  "70": "Notice of Allowance Mailed -- Application Received in Office of Publications",
  "71": "Issue Fee Payment Received",
  "80": "Sent to Classification Contractor",
  "85": "Response to Election/Restriction Filed",
  "90": "Application Undergoing Preexam Processing",
  "93": "Notice of Appeal Filed",
  "95": "Appeal Brief (or Coverage) Filed",
  "97": "On Appeal -- Awaiting Decision by the Board of Appeals",
  "100": "IDS Considered",
  "150": "Patent Expired Due to NonPayment of Maintenance Fees Under 37 CFR 1.362",
  "156": "Provisional Application Expired",
  "160": "RCE Filed",
  "161": "Application Ser No. Filing Date Fixed",
  "250": "Certificate of Correction Filed",
  "500": "Abandoned -- Incomplete Application",
}

const CPC_SECTION_MAP: Record<string, string> = {
  A: "Human Necessities",
  B: "Performing Operations; Transporting",
  C: "Chemistry; Metallurgy",
  D: "Textiles; Paper",
  E: "Fixed Constructions",
  F: "Mechanical Engineering; Lighting; Heating; Weapons; Blasting",
  G: "Physics",
  H: "Electricity",
  Y: "General Tagging of New Technological Developments",
}

const CPC_CLASS_MAP: Record<string, string> = {
  A01: "Agriculture; Forestry; Animal Husbandry; Hunting; Trapping; Fishing",
  A23: "Foods or Foodstuffs; Treatment Thereof",
  A61: "Medical or Veterinary Science; Hygiene",
  A63: "Sports; Games; Amusements",
  B01: "Physical or Chemical Processes or Apparatus in General",
  B25: "Hand Tools; Portable Power-Driven Tools; Manipulators",
  B29: "Working of Plastics; Working of Substances in a Plastic State in General",
  B60: "Vehicles in General",
  B65: "Conveying; Packing; Storing; Handling Thin or Filamentary Material",
  C07: "Organic Chemistry",
  C08: "Organic Macromolecular Compounds",
  C12: "Biochemistry; Beer; Spirits; Wine; Vinegar; Microbiology; Enzymology; Mutation or Genetic Engineering",
  E04: "Building",
  F16: "Engineering Elements and Units",
  G01: "Measuring; Testing",
  G02: "Optics",
  G05: "Controlling; Regulating",
  G06: "Computing; Calculating or Counting",
  G06F: "Electric Digital Data Processing",
  G06N: "Computing Arrangements Based on Specific Computational Models (AI/ML)",
  G06Q: "Information and Communication Technology for Administrative, Commercial, Financial, or Management Purposes",
  G06T: "Image Data Processing or Generation",
  G06V: "Image or Video Recognition or Understanding",
  G08: "Signalling",
  G09: "Educating; Cryptography; Display; Advertising; Seals",
  G10: "Musical Instruments; Acoustics",
  G11: "Information Storage",
  G16: "Information and Communication Technology Specially Adapted for Specific Application Fields",
  H01: "Electric Elements",
  H02: "Generation; Conversion; or Distribution of Electric Power",
  H03: "Electronic Circuitry",
  H04: "Electric Communication Technique",
  H04L: "Transmission of Digital Information",
  H04N: "Pictorial Communication (Television)",
  H04W: "Wireless Communication Networks",
  H05: "Electric Techniques Not Otherwise Provided For",
  H10: "Semiconductor Devices; Electric Solid-State Devices Not Otherwise Provided For",
  Y02: "Technologies or Applications for Mitigation or Adaptation Against Climate Change",
  Y10: "Technical Subjects Covered by Former USPC",
}

const checkApiHealth = async (
  name: string,
  url: string,
  headers?: Record<string, string>,
): Promise<{ healthy: boolean; error?: string }> => {
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10000),
    })
    if (response.ok) return { healthy: true }
    return { healthy: false, error: `HTTP ${response.status}` }
  } catch (e) {
    return { healthy: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export const registerUtilityTools = (server: FastMCP): void => {
  server.addTool({
    name: "check-api-status",
    description: "Check the health and configuration status of all patent data APIs (PatentsView, ODP, EPO, BigQuery).",
    parameters: z.object({}),
    annotations: UTILITY_ANNOTATIONS,
    execute: async () => {
      try {
        const sources = getAvailableSources(config)
        const statuses: ApiStatus[] = []

        // PatentsView
        const pvSource = sources.find((s) => s.name === "PatentsView")
        const pvStatus: ApiStatus = {
          name: "PatentsView",
          configured: pvSource?.configured ?? false,
          healthy: false,
        }
        {
          const apiKey = config.patentsViewApiKey
          const healthResult = await checkApiHealth(
            "PatentsView",
            "https://search.patentsview.org/api/v1/patent/?q=%7B%22patent_id%22%3A%2210000001%22%7D&f=%5B%22patent_id%22%5D&o=%7B%22size%22%3A1%7D",
            apiKey ? { "X-Api-Key": apiKey } : undefined,
          )
          pvStatus.healthy = healthResult.healthy
          pvStatus.error = healthResult.error
        }
        statuses.push(pvStatus)

        // ODP (USPTO Open Data Portal)
        const odpSource = sources.find((s) => s.name === "USPTO ODP")
        const odpStatus: ApiStatus = {
          name: "ODP (USPTO Open Data Portal)",
          configured: odpSource?.configured ?? false,
          healthy: false,
        }
        if (odpStatus.configured) {
          const apiKey = config.usptoApiKey
          const healthResult = await checkApiHealth(
            "ODP",
            "https://api.uspto.gov/api/v1/patent/applications/14412875",
            apiKey ? { "X-API-KEY": apiKey } : undefined,
          )
          odpStatus.healthy = healthResult.healthy
          odpStatus.error = healthResult.error
        } else {
          odpStatus.error = "USPTO_API_KEY not set"
        }
        statuses.push(odpStatus)

        // EPO
        const epoSource = sources.find((s) => s.name === "EPO OPS")
        const epoStatus: ApiStatus = {
          name: "EPO (European Patent Office)",
          configured: epoSource?.configured ?? false,
          healthy: false,
        }
        if (!epoStatus.configured) {
          epoStatus.error = "EPO_CONSUMER_KEY / EPO_CONSUMER_SECRET not set"
        }
        statuses.push(epoStatus)

        // BigQuery
        const bqSource = sources.find((s) => s.name === "Google BigQuery")
        const bqStatus: ApiStatus = {
          name: "Google BigQuery (Patents Public Data)",
          configured: bqSource?.configured ?? false,
          healthy: false,
        }
        if (bqStatus.configured) {
          bqStatus.healthy = !!(config.googleApplicationCredentials || config.googleCredentialsJson)
        } else {
          bqStatus.error = "GOOGLE_CLOUD_PROJECT / GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CREDENTIALS_JSON not set"
        }
        statuses.push(bqStatus)

        return JSON.stringify({ statuses })
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "get-cpc-info",
    description:
      "Look up CPC (Cooperative Patent Classification) code information. Returns the description for a given CPC section, class, or subclass code.",
    parameters: z.object({
      code: z.string().describe("CPC classification code (e.g., G06, H04L, A61)"),
    }),
    annotations: UTILITY_ANNOTATIONS,
    execute: async (args) => {
      try {
        const code = args.code.toUpperCase().trim()

        if (CPC_CLASS_MAP[code]) {
          return JSON.stringify({
            code,
            description: CPC_CLASS_MAP[code],
            level: code.length <= 3 ? "class" : "subclass",
          })
        }

        if (code.length === 1 && CPC_SECTION_MAP[code]) {
          return JSON.stringify({
            code,
            description: CPC_SECTION_MAP[code],
            level: "section",
          })
        }

        const parentClass = code.slice(0, 3)
        const parentSection = code.slice(0, 1)

        const result: Record<string, unknown> = {
          code,
          description: null,
          level: "unknown",
        }

        if (CPC_CLASS_MAP[parentClass]) {
          result.parentClass = { code: parentClass, description: CPC_CLASS_MAP[parentClass] }
        }

        if (CPC_SECTION_MAP[parentSection]) {
          result.parentSection = { code: parentSection, description: CPC_SECTION_MAP[parentSection] }
        }

        if (!result.parentClass && !result.parentSection) {
          result.error = `No CPC data found for code: ${code}`
        }

        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "get-status-code",
    description:
      "Look up the meaning of a USPTO application status code. Returns a human-readable description of what the status code indicates about the application's current state.",
    parameters: z.object({
      code: z.string().describe("USPTO application status code (numeric string)"),
    }),
    annotations: UTILITY_ANNOTATIONS,
    execute: async (args) => {
      try {
        const code = args.code.trim()
        const description = STATUS_CODE_MAP[code]

        if (description) {
          return JSON.stringify({ code, description })
        }

        return JSON.stringify({
          code,
          description: null,
          error: `Unknown status code: ${code}. Common codes include: ${Object.keys(STATUS_CODE_MAP).slice(0, 10).join(", ")}...`,
          availableCodes: Object.entries(STATUS_CODE_MAP).map(([c, d]) => ({ code: c, description: d })),
        })
      } catch (error) {
        return handleApiError(error)
      }
    },
  })
}
