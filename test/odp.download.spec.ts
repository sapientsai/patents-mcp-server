import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { handleApiError } from "../src/lib/errors"
import { createFileStore } from "../src/resources/store"
import { buildDownloadResult } from "../src/tools/odp.tools"

const SECRET_KEY = "super-secret-uspto-key-do-not-leak"
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const testStore = () => {
  const dir = mkdtempSync(join(tmpdir(), "odp-dl-"))
  return createFileStore({ dir, ttlSeconds: 600 })
}

/** The tool now returns two content items describing the same PDF. */
const parts = (result: { content: Array<Record<string, unknown>> }) => ({
  handle: JSON.parse(String(result.content.find((c) => c.type === "text")!.text)),
  link: result.content.find((c) => c.type === "resource_link") as Record<string, string> | undefined,
  raw: JSON.stringify(result),
})

describe("buildDownloadResult", () => {
  it("returns parseable JSON with a well-formed URL and no PDF bytes", async () => {
    const client = {
      downloadDocument: async () => ({
        data: new Uint8Array(Buffer.from("%PDF-1.7 fake")),
        contentType: "application/pdf",
      }),
    }

    const { handle, raw } = parts(
      await buildDownloadResult(
        client,
        "16123456",
        "JLQY2WZORXEAPX4",
        testStore(),
        "https://patents.civala.ai",
        "httpStream",
      ),
    )

    expect(handle.mimeType).toBe("application/pdf")
    expect(handle.expiresInSeconds).toBe(600)
    const match = handle.url.match(/^https:\/\/patents\.civala\.ai\/resources\/([^.]+)\.pdf$/)
    expect(match).not.toBeNull()
    expect(match![1]).toMatch(UUID_V4)
    // The response carries a handle, never the bytes.
    expect(raw).not.toContain("%PDF")
  })

  it("propagates a clean error without leaking the USPTO key", async () => {
    // Mirrors how BaseClient surfaces a non-200 from USPTO.
    const httpError = Object.assign(new Error("API Error 404 Not Found: document unavailable"), {
      status: 404,
      statusText: "Not Found",
      body: "document unavailable",
    })
    const client = {
      downloadDocument: async () => {
        throw httpError
      },
    }

    await expect(
      buildDownloadResult(client, "16123456", "BADDOC", testStore(), "https://patents.civala.ai"),
    ).rejects.toThrow()

    // The tool funnels failures through handleApiError — verify the surfaced message is clean.
    let surfaced: string
    try {
      await buildDownloadResult(client, "16123456", "BADDOC", testStore(), "https://patents.civala.ai")
      surfaced = ""
    } catch (error) {
      surfaced = handleApiError(error)
    }
    expect(surfaced).not.toContain(SECRET_KEY)
    expect(surfaced).toContain("not found")
  })
})

describe("buildDownloadResult over stdio", () => {
  const client = {
    downloadDocument: async () => ({
      data: new Uint8Array(Buffer.from("%PDF-1.7 fake")),
      contentType: "application/pdf",
    }),
  }

  const stdioResult = async () => {
    const result = await buildDownloadResult(
      client,
      "16123456",
      "JLQY2WZORXEAPX4",
      testStore(),
      "https://patents.civala.ai",
      "stdio",
    )
    return parts(result).handle as {
      path: string
      url: string
      note: string
      mimeType: string
      expiresInSeconds: number
    }
  }

  it("returns a readable local path instead of an unreachable URL", async () => {
    // Under stdio no HTTP listener binds, so the old https URL 404'd for every local caller.
    const parsed = await stdioResult()
    expect(existsSync(parsed.path)).toBe(true)
    expect(readFileSync(parsed.path).toString()).toContain("%PDF")
  })

  it("expresses that path as a file:// URL, not the production host", async () => {
    const parsed = await stdioResult()
    expect(parsed.url.startsWith("file://")).toBe(true)
    expect(parsed.url).not.toContain("patents.civala.ai")
  })

  it("still keeps the PDF bytes out of the payload", async () => {
    const parsed = await stdioResult()
    expect(JSON.stringify(parsed)).not.toContain("%PDF")
    expect(parsed.path).toBeTruthy()
    expect(parsed.mimeType).toBe("application/pdf")
    expect(parsed.expiresInSeconds).toBe(600)
  })

  it("says why the handle is a path, so the caller does not go looking for a URL", async () => {
    expect((await stdioResult()).note).toMatch(/stdio/i)
  })
})

describe("buildDownloadResult resource link", () => {
  const client = {
    downloadDocument: async () => ({
      data: new Uint8Array(Buffer.from("%PDF-1.7 fake")),
      contentType: "application/pdf",
    }),
  }
  const run = async (transport: "stdio" | "httpStream") =>
    parts(
      await buildDownloadResult(
        client,
        "16123456",
        "JLQY2WZORXEAPX4",
        testStore(),
        "https://patents.civala.ai",
        transport,
      ),
    )

  it.each(["stdio", "httpStream"] as const)("carries both handles on %s", async (transport) => {
    // A client that ignores resource links does not error, it just ends up with no document.
    // Sending both means such a client is no worse off than before.
    const { handle, link } = await run(transport)
    expect(link).toBeDefined()
    expect(handle).toBeDefined()
  })

  it("points the link at a patents://document uri keyed by the stored id", async () => {
    const { link, handle } = await run("stdio")
    expect(link!.uri).toMatch(/^patents:\/\/document\/[0-9a-f-]{36}$/)
    // Both handles must name the same file, or the two paths diverge silently.
    expect(handle.resourceUri).toBe(link!.uri)
    expect(handle.path).toContain(link!.uri.split("/").pop())
  })

  it("names the link after the application and document, not the uuid", async () => {
    const { link } = await run("stdio")
    expect(link!.name).toBe("16123456-JLQY2WZORXEAPX4.pdf")
    expect(link!.mimeType).toBe("application/pdf")
  })

  it("still keeps the bytes out of the result", async () => {
    const { raw } = await run("httpStream")
    expect(raw).not.toContain("%PDF")
  })
})
