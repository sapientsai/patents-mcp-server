import type { FastMCP } from "fastmcp"

import { registerBigQueryTools } from "./bigquery.tools"
import { registerCitationsTools } from "./citations.tools"
import { registerEpoTools } from "./epo.tools"
import { registerOdpTools } from "./odp.tools"
import { registerOfficeActionsTools } from "./office-actions.tools"
import { registerPatentsViewTools } from "./patentsview.tools"
import { registerPtabTools } from "./ptab.tools"
import { registerUtilityTools } from "./utility.tools"

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
