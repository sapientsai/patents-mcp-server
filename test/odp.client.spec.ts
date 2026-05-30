import { describe, expect, it } from "vitest"

import { OdpClient } from "../src/clients/odp.client"

const apiKey = process.env.USPTO_API_KEY

describe.skipIf(!apiKey)("OdpClient (integration)", () => {
  const client = new OdpClient({ apiKey: apiKey! })

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
    })
  })
})
