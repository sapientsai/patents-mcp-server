import { createReadStream } from "node:fs"
import { Readable } from "node:stream"

import type { FastMCP } from "fastmcp"

import { type FileStore, resourceStore, UUID_V4 } from "./store"

const notFound = (message: string): Response => new Response(message, { status: 404 })

/**
 * Registers `GET /resources/:file`, serving transient PDFs written by `odp-download-document`.
 *
 * Access control is at the edge (the same gate that fronts `/mcp`); within the app the
 * unguessable v4 UUID and the TTL are defense-in-depth, not the capability. Strict UUID
 * validation runs before any filesystem access, so `:file` is never interpolated into a path.
 */
export const registerResourceRoutes = (server: FastMCP, store: FileStore = resourceStore): void => {
  server.getApp().get("/resources/:file", (c) => {
    const file = c.req.param("file")
    if (!file.endsWith(".pdf")) return notFound("Not found")

    const id = file.slice(0, -".pdf".length)
    if (!UUID_V4.test(id)) return notFound("Not found")

    const path = store.getPath(id)
    if (!path) return notFound("Not found or expired")

    const body = Readable.toWeb(createReadStream(path)) as unknown as ReadableStream
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "cache-control": "private, no-store",
      },
    })
  })
}
