import { describe, expect, it } from "vitest"

import {
  detectNumberFormat,
  epoGetBiblio,
  epoGetClaims,
  epoLegalStatus,
  epoNumberConvert,
  epoSearchPatents,
  projectSearchResults,
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

// Pure, so CI runs it without credentials.
describe("projectSearchResults", () => {
  const response = {
    "world-patent-data": {
      "biblio-search": {
        "@_total-result-count": "981",
        "search-result": {
          "exchange-documents": [
            {
              "exchange-document": [
                {
                  "@_country": "WO",
                  "@_doc-number": "2026184726",
                  "@_kind": "A1",
                  "@_family-id": "101217036",
                  "bibliographic-data": {
                    "publication-reference": {
                      "document-id": [
                        {
                          country: "WO",
                          "doc-number": 2026184726,
                          kind: "A1",
                          date: 20260910,
                          "@_document-id-type": "docdb",
                        },
                        { "doc-number": "WO2026184726", date: 20260910, "@_document-id-type": "epodoc" },
                      ],
                    },
                    parties: {
                      applicants: {
                        applicant: [
                          { "applicant-name": { name: "WUXI XDC SHANGHAI CO LTD [CN]" }, "@_data-format": "epodoc" },
                          { "applicant-name": { name: "上海药明合联生物技术有限公司" }, "@_data-format": "original" },
                        ],
                      },
                    },
                    "invention-title": [
                      { "#text": "CONJUGUÉ ANTICORPS-MÉDICAMENT", "@_lang": "fr" },
                      { "#text": "ANTIBODY-DRUG CONJUGATE CONTAINING HYDROPHILIC GROUP", "@_lang": "en" },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    },
  }

  it("projects the fields needed to triage a hit", () => {
    const { total, returned, hits } = projectSearchResults(response)
    expect(total).toBe(981)
    expect(returned).toBe(1)
    expect(hits[0]).toEqual({
      publicationNumber: "WO2026184726",
      kind: "A1",
      title: "ANTIBODY-DRUG CONJUGATE CONTAINING HYDROPHILIC GROUP",
      applicants: ["WUXI XDC SHANGHAI CO LTD [CN]"],
      publicationDate: "20260910",
      familyId: "101217036",
    })
  })

  it("prefers the English title over other translations", () => {
    expect(projectSearchResults(response).hits[0].title).not.toContain("CONJUGUÉ")
  })

  it("drops the original-script duplicate of each applicant", () => {
    // OPS lists every party twice, epodoc and original; the second adds no information.
    expect(projectSearchResults(response).hits[0].applicants).toHaveLength(1)
  })

  it("returns an empty list rather than throwing on a malformed response", () => {
    expect(projectSearchResults({})).toEqual({ total: 0, returned: 0, hits: [] })
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

  describe("epoSearchPatents", () => {
    it("returns hits carrying titles and applicants, not bare publication numbers", async () => {
      // The bare `search` endpoint returns document-id and family-id only, which forced one
      // epo-get-biblio call per hit just to identify a result list.
      const { total, hits } = await epoSearchPatents('ti="antibody drug conjugate"', "1-5")
      expect(total).toBeGreaterThan(0)
      expect(hits.length).toBeGreaterThan(0)
      for (const h of hits) {
        expect(h.publicationNumber).toMatch(/^[A-Z]{2}\d+/)
        expect(h.title).toBeTruthy()
      }
      expect(hits.some((h) => h.applicants.length > 0)).toBe(true)
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
