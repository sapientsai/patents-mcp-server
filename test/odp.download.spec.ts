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

describe("buildDownloadResult", () => {
  it("returns parseable JSON with a well-formed URL and no PDF bytes", async () => {
    const client = {
      downloadDocument: async () => ({
        data: new Uint8Array(Buffer.from("%PDF-1.7 fake")),
        contentType: "application/pdf",
      }),
    }

    const json = await buildDownloadResult(
      client,
      "16123456",
      "JLQY2WZORXEAPX4",
      testStore(),
      "https://patents.civala.ai",
      "httpStream",
    )
    const parsed = JSON.parse(json) as { url: string; mimeType: string; expiresInSeconds: number }

    expect(parsed.mimeType).toBe("application/pdf")
    expect(parsed.expiresInSeconds).toBe(600)
    const match = parsed.url.match(/^https:\/\/patents\.civala\.ai\/resources\/([^.]+)\.pdf$/)
    expect(match).not.toBeNull()
    expect(match![1]).toMatch(UUID_V4)
    // The response carries a URL, never the bytes.
    expect(json).not.toContain("%PDF")
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
    const store = testStore()
    const json = await buildDownloadResult(
      client,
      "16123456",
      "JLQY2WZORXEAPX4",
      store,
      "https://patents.civala.ai",
      "stdio",
    )
    return JSON.parse(json) as { path: string; url: string; note: string; mimeType: string; expiresInSeconds: number }
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
    expect(parsed.mimeType).toBe("application/pdf")
    expect(parsed.expiresInSeconds).toBe(600)
  })

  it("says why the handle is a path, so the caller does not go looking for a URL", async () => {
    expect((await stdioResult()).note).toMatch(/stdio/i)
  })
})
