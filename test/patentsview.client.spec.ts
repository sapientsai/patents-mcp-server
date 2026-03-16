import { describe, expect, it } from "vitest"

import { PatentsViewClient } from "../src/clients/patentsview.client"

const apiKey = process.env.PATENTSVIEW_API_KEY ?? process.env.PATENTS_VIEW_API_KEY

describe.skipIf(!apiKey)("PatentsViewClient (integration)", () => {
  const client = new PatentsViewClient({ apiKey })

  describe("searchPatents", () => {
    it("searches abstracts with all-words match", async () => {
      const result = await client.searchPatents("machine learning", "all", 2)
      expect(result.error).toBe(false)
      expect(result.total_hits).toBeGreaterThan(0)
      expect(result.patents).toHaveLength(2)
      expect(result.patents![0]).toHaveProperty("patent_id")
      expect(result.patents![0]).toHaveProperty("patent_title")
      expect(result.patents![0]).toHaveProperty("patent_abstract")
    })

    it("supports phrase matching", async () => {
      const result = await client.searchPatents("perinucleolar compartment", "phrase", 2)
      expect(result.error).toBe(false)
      expect(result.total_hits).toBeGreaterThan(0)
    })
  })

  describe("getPatent", () => {
    it("retrieves a specific patent", async () => {
      const result = await client.getPatent("10000001")
      expect(result.patents).toBeDefined()
      expect(result.patents![0].patent_id).toBe("10000001")
      expect(result.patents![0].patent_title).toBeDefined()
    })
  })

  describe("searchAssignees", () => {
    it("searches assignees by name", async () => {
      const result = await client.searchAssignees("Google", 2)
      expect(result.assignees).toBeDefined()
      expect(result.assignees!.length).toBeGreaterThan(0)
      expect(result.assignees![0]).toHaveProperty("assignee_id")
    })
  })

  describe("searchInventors", () => {
    it("searches inventors by name", async () => {
      const result = await client.searchInventors("Smith", 2)
      expect(result.inventors).toBeDefined()
      expect(result.inventors!.length).toBeGreaterThan(0)
      expect(result.inventors![0]).toHaveProperty("inventor_id")
    })
  })

  describe("getClaims", () => {
    it("retrieves claims for a patent", async () => {
      const result = await client.getClaims("10000001")
      expect(result).toHaveProperty("g_claims")
    })
  })
})
