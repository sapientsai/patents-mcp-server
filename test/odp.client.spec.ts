import { describe, expect, it } from "vitest"

import { DEFAULT_SEARCH_FIELDS, OdpClient } from "../src/clients/odp.client"

const apiKey = process.env.USPTO_API_KEY

describe.skipIf(!apiKey)("OdpClient (integration)", () => {
  const client = new OdpClient({ apiKey: apiKey! })

  describe("searchApplications", () => {
    type Wrapper = {
      applicationNumberText?: string
      recordAttorney?: unknown
      applicationMetaData?: { filingDate?: string }
    }
    const wrappers = (result: unknown): Wrapper[] =>
      ((result as { patentFileWrapperDataBag?: Wrapper[] }).patentFileWrapperDataBag ?? []) as Wrapper[]

    it("projects a bibliographic summary instead of the whole file wrapper", async () => {
      const result = await client.searchApplications({ query: "CRISPR gene editing", limit: 3 })
      const bag = wrappers(result)
      expect(bag.length).toBeGreaterThan(0)

      for (const w of bag) {
        expect(w.applicationNumberText).toBeDefined()
        // ODP inlines the filing firm's full practitioner roster here — ~172KB on one
        // application — which is what pushed an unprojected 3-hit search past 225KB.
        expect(w.recordAttorney).toBeUndefined()
      }
      expect(JSON.stringify(result).length).toBeLessThan(20_000)
    })

    it("sorts by the requested field and direction", async () => {
      const result = await client.searchApplications({
        query: "CRISPR",
        limit: 5,
        sortField: "applicationMetaData.filingDate",
        sortOrder: "desc",
      })
      const dates = wrappers(result)
        .map((w) => w.applicationMetaData?.filingDate)
        .filter((d): d is string => typeof d === "string")

      expect(dates.length).toBeGreaterThan(1)
      // A bare `sort` string is rejected by ODP with HTTP 400, so reaching here at all is
      // half the assertion; ordering is the other half.
      expect([...dates]).toEqual([...dates].sort((a, b) => b.localeCompare(a)))
    })

    it("keeps the application number when the caller names their own fields", async () => {
      const result = await client.searchApplications({
        query: "CRISPR",
        limit: 2,
        fields: ["applicationMetaData.inventionTitle"],
      })
      for (const w of wrappers(result)) {
        expect(w.applicationNumberText).toBeDefined()
      }
    })

    it("always projects the application number by default", () => {
      expect(DEFAULT_SEARCH_FIELDS).toContain("applicationNumberText")
    })
  })

  describe("application sub-resources", () => {
    // Each of these is a distinct URL path segment, and a misspelled one fails as HTTP 403
    // rather than 404 — indistinguishable from a missing entitlement. `/metadata` shipped that
    // way and read as "this key lacks access" for as long as it was wrong. Pin every path.
    const subResources = [
      ["getApplicationMetadata", (c: OdpClient) => c.getApplicationMetadata("14412875")],
      ["getContinuity", (c: OdpClient) => c.getContinuity("14412875")],
      ["getAssignment", (c: OdpClient) => c.getAssignment("14412875")],
      ["getAdjustment", (c: OdpClient) => c.getAdjustment("14412875")],
      ["getAttorney", (c: OdpClient) => c.getAttorney("14412875")],
      ["getForeignPriority", (c: OdpClient) => c.getForeignPriority("14412875")],
      ["getTransactions", (c: OdpClient) => c.getTransactions("14412875")],
      ["getDocuments", (c: OdpClient) => c.getDocuments("14412875")],
    ] as const

    it.each(subResources)("%s resolves to a live ODP path", async (_name, call) => {
      const result = (await call(client)) as Record<string, unknown>
      expect(result).toBeDefined()
    })
  })

  describe("getApplicationMetadata", () => {
    it("returns metadata without the practitioner roster", async () => {
      // The reason to reach for this over getApplication: ODP omits `recordAttorney` here,
      // which is ~172KB of firm roster on a large-firm application.
      const result = (await client.getApplicationMetadata("18994572")) as {
        patentFileWrapperDataBag?: Record<string, unknown>[]
      }
      const wrapper = result.patentFileWrapperDataBag?.[0]
      expect(wrapper).toBeDefined()
      expect(wrapper).toHaveProperty("applicationMetaData")
      expect(wrapper).not.toHaveProperty("recordAttorney")
    })
  })

  describe("getApplication", () => {
    it("retrieves a specific application", async () => {
      const result = (await client.getApplication("14412875")) as Record<string, unknown>
      expect(result).toHaveProperty("count")
      expect(result).toHaveProperty("patentFileWrapperDataBag")
    })
  })

  describe("getContinuity", () => {
    it("retrieves continuity data", async () => {
      const result = (await client.getContinuity("14412875")) as Record<string, unknown>
      expect(result).toBeDefined()
    })
  })

  describe("getAssignment", () => {
    it("retrieves assignment data", async () => {
      const result = (await client.getAssignment("14412875")) as Record<string, unknown>
      expect(result).toBeDefined()
    })
  })

  describe("getDocuments", () => {
    it("retrieves document list", async () => {
      const result = (await client.getDocuments("14412875")) as Record<string, unknown>
      expect(result).toBeDefined()
    })
  })

  describe("getTransactions", () => {
    it("retrieves transaction history", async () => {
      const result = (await client.getTransactions("14412875")) as Record<string, unknown>
      expect(result).toBeDefined()
    })
  })

  describe("downloadDocument", () => {
    it("downloads a file-wrapper document as a PDF", async () => {
      // Find a document with a PDF download option, then download it.
      const docs = (await client.getDocuments("16330077")) as unknown
      const findPdfDoc = (node: unknown): { id: string } | undefined => {
        if (Array.isArray(node)) {
          for (const item of node) {
            const found = findPdfDoc(item)
            if (found) return found
          }
        } else if (node && typeof node === "object") {
          const obj = node as Record<string, unknown>
          const options = obj.downloadOptionBag
          if (typeof obj.documentIdentifier === "string" && Array.isArray(options)) {
            const hasPdf = options.some((o) => (o as Record<string, unknown>).mimeTypeIdentifier === "PDF")
            if (hasPdf) return { id: obj.documentIdentifier }
          }
          for (const value of Object.values(obj)) {
            const found = findPdfDoc(value)
            if (found) return found
          }
        }
        return undefined
      }

      const doc = findPdfDoc(docs)
      expect(doc).toBeDefined()

      const { data, contentType } = await client.downloadDocument("16330077", doc!.id)
      expect(data.length).toBeGreaterThan(0)
      // PDF magic bytes: %PDF
      expect(Buffer.from(data.subarray(0, 4)).toString("ascii")).toBe("%PDF")
      expect(contentType).toBeDefined()
      // Live fetch follows a 302 to a presigned URL and pulls a multi-MB PDF — exceeds the 5s default.
    }, 30000)
  })
})
