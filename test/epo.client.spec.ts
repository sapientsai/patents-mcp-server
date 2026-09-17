import { describe, expect, it } from "vitest"

import {
  detectNumberFormat,
  epoGetBiblio,
  epoGetClaims,
  epoLegalStatus,
  epoNumberConvert,
} from "../src/clients/epo-ops.client"

describe("detectNumberFormat", () => {
  // The kind code decides, because the two OPS segments have opposite tolerances: epodoc 404s on
  // a trailing kind code, docdb 413s on a bare number for single-document constituents.
  it.each([
    ["EP.1000000.A1", "docdb"], // canonical dotted
    ["US.7650331.B1", "docdb"],
    ["US7650331B1", "docdb"], // undotted but kind-suffixed — epodoc/US7650331B1 is a 404
    ["US2020123456A1", "docdb"],
    ["EP1000000A1", "docdb"],
    ["us7650331b1", "docdb"], // classification is case-insensitive
    ["EP1000000", "epodoc"], // bare, no kind code
    ["US7650331", "epodoc"],
    ["WO2020123456", "epodoc"],
    ["EP 1000000", "epodoc"], // whitespace is stripped before matching
  ])("reads %s as %s", (number, expected) => {
    expect(detectNumberFormat(number)).toBe(expected)
  })
})

const hasCreds = !!(process.env.EPO_CONSUMER_KEY && process.env.EPO_CONSUMER_SECRET)

describe.skipIf(!hasCreds)("EPO OPS (integration)", () => {
  describe("epoLegalStatus", () => {
    it("returns legal events, not bibliographic data", async () => {
      // The defect: `published-data/.../legal` is an unsupported constituent that OPS answers
      // with HTTP 200 and the biblio payload, so this tool returned plausible, wrong data.
      const result = (await epoLegalStatus("EP1000000")) as Record<string, any>
      const family = result["world-patent-data"]?.["patent-family"]
      expect(family).toBeDefined()

      const members = family["family-member"]
      expect(Array.isArray(members)).toBe(true)

      const withLegal = members.filter((m: Record<string, unknown>) => m.legal !== undefined)
      expect(withLegal.length).toBeGreaterThan(0)
      // The old path returned an `exchange-documents` biblio payload; that marker must be gone.
      expect(result["world-patent-data"]?.["exchange-documents"]).toBeUndefined()
      // Jurisdiction spread is the whole point of the tool.
      const countries = new Set(
        members.map((m: any) => m["publication-reference"]?.["document-id"]?.[0]?.country).filter(Boolean),
      )
      expect(countries.size).toBeGreaterThan(1)
    }, 30000)
  })

  describe("epoGetBiblio", () => {
    // US7650331B1 is the example in epo-get-biblio's own description. Inferring epodoc for it
    // routed to a 404; the kind code makes it docdb.
    it.each(["US7650331B1", "EP1000000", "EP.1000000.A1"])(
      "resolves %s with no explicit format",
      async (number) => {
        const result = (await epoGetBiblio(number)) as Record<string, any>
        expect(result["world-patent-data"]?.["exchange-documents"]).toBeDefined()
      },
      30000,
    )
  })

  describe("epoGetClaims", () => {
    it("resolves an epodoc-shaped number without an explicit format", async () => {
      // Defaulting to docdb while handing OPS an epodoc number produced HTTP 413.
      const result = (await epoGetClaims("EP1000000")) as Record<string, unknown>
      expect(JSON.stringify(result)).toContain("claim")
    }, 30000)

    it("still honours an explicit format when the number matches it", async () => {
      const result = (await epoGetClaims("EP.1000000.A1", "docdb")) as Record<string, unknown>
      expect(JSON.stringify(result)).toContain("claim")
    }, 30000)
  })

  describe("epoNumberConvert", () => {
    it("converts epodoc to docdb", async () => {
      // Without the reference-type segment OPS matched no route and returned HTTP 405.
      const result = (await epoNumberConvert("EP1000000", "epodoc", "docdb")) as Record<string, unknown>
      expect(JSON.stringify(result)).toContain("1000000")
    }, 30000)
  })
})
