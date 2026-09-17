#!/usr/bin/env node
import { config } from "./lib/config"
import { registerPrompts } from "./prompts/index"
import { registerResources } from "./resources/index"
import { registerResourceRoutes } from "./resources/routes"
import { resourceStore } from "./resources/store"
import { server } from "./server"
import { registerAllTools } from "./tools/index"

registerAllTools(server)
registerResources(server)
registerPrompts(server)
registerResourceRoutes(server)
resourceStore.startSweep()

if (config.transport === "httpStream") {
  // A download URL is only fetchable if it names the host callers actually reach. Behind a proxy
  // or a public hostname this process has no way to know that name, so say so rather than hand
  // out links to an address that only works from inside the container.
  if (process.env.PUBLIC_BASE_URL === undefined) {
    console.warn(
      `[patents-mcp-server] PUBLIC_BASE_URL is not set; odp-download-document will return links on ` +
        `${config.publicBaseUrl}. Set PUBLIC_BASE_URL to the origin clients reach this server on.`,
    )
  }
  server.start({
    transportType: "httpStream",
    httpStream: {
      port: config.port,
      host: process.env.HOST ?? "0.0.0.0",
    },
  })
} else {
  server.start({
    transportType: "stdio",
  })
}
