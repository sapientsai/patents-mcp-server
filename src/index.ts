import { config } from "./lib/config.js"
import { registerPrompts } from "./prompts/index.js"
import { registerResources } from "./resources/index.js"
import { server } from "./server.js"
import { registerAllTools } from "./tools/index.js"

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
