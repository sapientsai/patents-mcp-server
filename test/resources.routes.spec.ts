import { FastMCP } from "fastmcp"
import { mkdtempSync, utimesSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeAll, describe, expect, it } from "vitest"

import { registerResourceRoutes } from "../src/resources/routes"
import { createFileStore } from "../src/resources/store"

const dir = mkdtempSync(join(tmpdir(), "odp-route-"))
const store = createFileStore({ dir, ttlSeconds: 600 })
const server = new FastMCP({ name: "test", version: "0.0.0" })

let validId: string
let staleId: string

beforeAll(() => {
  registerResourceRoutes(server, store)
  validId = store.put(Buffer.from("%PDF-1.7 body"), "pdf").id
  staleId = store.put(Buffer.from("%PDF-1.7 old"), "pdf").id
  const stalePath = store.getPath(staleId)!
  const past = new Date(Date.now() - 601 * 1000)
  utimesSync(stalePath, past, past)
})

const fetchResource = (file: string): Promise<Response> =>
  server.getApp().fetch(new Request(`http://localhost/resources/${file}`))

describe("GET /resources/:file", () => {
  it("serves a valid PDF as application/pdf with no-store", async () => {
    const res = await fetchResource(`${validId}.pdf`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/pdf")
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    const bytes = Buffer.from(await res.arrayBuffer())
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF")
  })

  it("404s a non-UUID stem", async () => {
    const res = await fetchResource("not-a-uuid.pdf")
    expect(res.status).toBe(404)
  })

  it("404s a non-.pdf extension", async () => {
    const res = await fetchResource(`${validId}.exe`)
    expect(res.status).toBe(404)
  })

  it("404s an expired file", async () => {
    const res = await fetchResource(`${staleId}.pdf`)
    expect(res.status).toBe(404)
  })

  it("404s a path-traversal attempt", async () => {
    const res = await server.getApp().fetch(new Request("http://localhost/resources/..%2f..%2f..%2fetc%2fpasswd"))
    expect(res.status).toBe(404)
  })
})
