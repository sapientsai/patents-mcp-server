import type { FastMCP } from "fastmcp"

import { registerBigQueryTools } from "./bigquery.tools.js"
import { registerCitationsTools } from "./citations.tools.js"
import { registerEpoTools } from "./epo.tools.js"
import { registerOdpTools } from "./odp.tools.js"
import { registerOfficeActionsTools } from "./office-actions.tools.js"
import { registerPatentsViewTools } from "./patentsview.tools.js"
import { registerPtabTools } from "./ptab.tools.js"
import { registerUtilityTools } from "./utility.tools.js"

export const registerAllTools = (server: FastMCP): void => {
  registerPatentsViewTools(server)
  registerOdpTools(server)
  registerPtabTools(server)
  registerCitationsTools(server)
  registerOfficeActionsTools(server)
  registerEpoTools(server)
  registerBigQueryTools(server)
  registerUtilityTools(server)
}
