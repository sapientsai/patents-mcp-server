import type { FastMCP } from "fastmcp"
import { z } from "zod"

import { PatentsViewClient } from "../clients/patentsview.client"
import { config } from "../lib/config"
import { handleApiError } from "../lib/errors"

const TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const

const createClient = (): PatentsViewClient => {
  return new PatentsViewClient({
    apiKey: config.patentsViewApiKey,
    timeout: config.requestTimeout,
  })
}

export const registerPatentsViewTools = (server: FastMCP): void => {
  server.addTool({
    name: "patentsview-search-patents",
    description:
      "Search for patents on PatentsView by text query, assignee name, or inventor name. Returns patent metadata including title, abstract, date, assignees, and inventors.",
    parameters: z.object({
      query: z.string().describe("Search query string (text, assignee name, or inventor name)"),
      search_type: z
        .enum(["text", "assignee", "inventor"])
        .default("text")
        .describe("Type of search: text (abstract search), assignee (organization), or inventor (name)"),
      limit: z.number().int().min(1).max(100).default(25).describe("Number of results to return (1-100)"),
    }),
    annotations: TOOL_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.searchPatents(args.query, args.search_type, args.limit)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "patentsview-get-patent",
    description:
      "Get detailed information about a specific patent by its patent ID (e.g., '11234567'). Returns full patent metadata.",
    parameters: z.object({
      patent_id: z.string().describe("The patent ID (e.g., '11234567')"),
    }),
    annotations: TOOL_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getPatent(args.patent_id)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "patentsview-search-assignees",
    description:
      "Search for patent assignees (organizations or individuals) by name. Returns assignee details and patent counts.",
    parameters: z.object({
      name: z.string().describe("Assignee name or organization to search for"),
      limit: z.number().int().min(1).max(100).default(25).describe("Number of results to return (1-100)"),
    }),
    annotations: TOOL_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.searchAssignees(args.name, args.limit)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "patentsview-get-assignee",
    description: "Get detailed information about a specific patent assignee by their assignee ID.",
    parameters: z.object({
      assignee_id: z.string().describe("The assignee ID"),
    }),
    annotations: TOOL_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getAssignee(args.assignee_id)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "patentsview-search-inventors",
    description: "Search for patent inventors by name. Returns inventor details and patent counts.",
    parameters: z.object({
      name: z.string().describe("Inventor name to search for"),
      limit: z.number().int().min(1).max(100).default(25).describe("Number of results to return (1-100)"),
    }),
    annotations: TOOL_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.searchInventors(args.name, args.limit)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "patentsview-get-inventor",
    description: "Get detailed information about a specific patent inventor by their inventor ID.",
    parameters: z.object({
      inventor_id: z.string().describe("The inventor ID"),
    }),
    annotations: TOOL_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getInventor(args.inventor_id)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "patentsview-search-attorneys",
    description:
      "Search for patent attorneys/agents by name or organization. Returns attorney details and patent counts.",
    parameters: z.object({
      name: z.string().describe("Attorney name or organization to search for"),
      limit: z.number().int().min(1).max(100).default(25).describe("Number of results to return (1-100)"),
    }),
    annotations: TOOL_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.searchAttorneys(args.name, args.limit)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "patentsview-get-attorney",
    description: "Get detailed information about a specific patent attorney by their attorney ID.",
    parameters: z.object({
      attorney_id: z.string().describe("The attorney ID"),
    }),
    annotations: TOOL_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getAttorney(args.attorney_id)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "patentsview-get-claims",
    description: "Get the claims text for a specific patent by its patent ID.",
    parameters: z.object({
      patent_id: z.string().describe("The patent ID to get claims for"),
    }),
    annotations: TOOL_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getClaims(args.patent_id)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "patentsview-get-description",
    description:
      "Get the description text for a specific patent by its patent ID. Includes brief summary, detailed description, and drawing descriptions.",
    parameters: z.object({
      patent_id: z.string().describe("The patent ID to get description for"),
    }),
    annotations: TOOL_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.getDescription(args.patent_id)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "patentsview-search-by-cpc",
    description:
      "Search for patents by CPC (Cooperative Patent Classification) code. CPC codes classify patents by technology area.",
    parameters: z.object({
      cpc_code: z.string().describe("CPC subgroup code (e.g., 'A61K31/00' for medicinal preparations)"),
      limit: z.number().int().min(1).max(100).default(25).describe("Number of results to return (1-100)"),
    }),
    annotations: TOOL_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.searchByCpc(args.cpc_code, args.limit)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "patentsview-lookup-cpc",
    description:
      "Look up a CPC (Cooperative Patent Classification) subgroup code to get its title and classification details.",
    parameters: z.object({
      cpc_code: z.string().describe("CPC subgroup code to look up (e.g., 'A61K31/00')"),
    }),
    annotations: TOOL_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.lookupCpc(args.cpc_code)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "patentsview-search-by-ipc",
    description:
      "Search for patents by IPC (International Patent Classification) code. IPC codes classify patents internationally.",
    parameters: z.object({
      ipc_code: z.string().describe("IPC class code (e.g., 'A61K')"),
      limit: z.number().int().min(1).max(100).default(25).describe("Number of results to return (1-100)"),
    }),
    annotations: TOOL_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.searchByIpc(args.ipc_code, args.limit)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })

  server.addTool({
    name: "patentsview-lookup-ipc",
    description: "Look up an IPC (International Patent Classification) code to get its classification details.",
    parameters: z.object({
      ipc_code: z.string().describe("IPC class code to look up (e.g., 'A61K')"),
    }),
    annotations: TOOL_ANNOTATIONS,
    execute: async (args) => {
      try {
        const client = createClient()
        const result = await client.lookupIpc(args.ipc_code)
        return JSON.stringify(result)
      } catch (error) {
        return handleApiError(error)
      }
    },
  })
}
