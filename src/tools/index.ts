import type { FastMCP } from "fastmcp"

import { config } from "../lib/config"
import { registerBigQueryTools } from "./bigquery.tools"
import { registerCitationsTools } from "./citations.tools"
import { registerEpoTools } from "./epo.tools"
import { registerOdpTools } from "./odp.tools"
import { registerOfficeActionsTools } from "./office-actions.tools"
import { registerPatentsViewTools } from "./patentsview.tools"
import { registerPtabTools } from "./ptab.tools"
import { registerUtilityTools } from "./utility.tools"

export const registerAllTools = (server: FastMCP): void => {
  if (config.patentsViewApiKey) {
    registerPatentsViewTools(server)
  }
  if (config.usptoApiKey) {
    registerOdpTools(server)
    registerPtabTools(server)
    registerCitationsTools(server)
    registerOfficeActionsTools(server)
  }
  if (config.epoConsumerKey && config.epoConsumerSecret) {
    registerEpoTools(server)
  }
  if (config.googleApplicationCredentials && config.googleCloudProject) {
    registerBigQueryTools(server)
  }
  registerUtilityTools(server)
}
