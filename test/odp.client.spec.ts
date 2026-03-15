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
})
