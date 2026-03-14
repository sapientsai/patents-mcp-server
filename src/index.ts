#!/usr/bin/env node
import { config } from "./lib/config"
import { registerPrompts } from "./prompts/index"
import { registerResources } from "./resources/index"
import { server } from "./server"
import { registerAllTools } from "./tools/index"

registerAllTools(server)
registerResources(server)
registerPrompts(server)

if (config.transport === "httpStream") {
  server.start({
    transportType: "httpStream",
    httpStream: {
      port: config.port,
    },
  })
} else {
  server.start({
    transportType: "stdio",
  })
}
