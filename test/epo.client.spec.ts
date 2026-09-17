import { describe, expect, it } from "vitest"

import {
  detectNumberFormat,
  epoGetBiblio,
  epoGetClaims,
  epoLegalStatus,
  epoNumberConvert,
  epoSearchPatents,
  epoFamilyLookup,
  extractKinds,
  projectFamily,
  projectLegalStatus,
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

// Pure, so CI runs it without credentials.
describe("extractKinds", () => {
  it("lists every kind a number is published under", () => {
    const biblio = {
      "world-patent-data": {
        "exchange-documents": {
          "exchange-document": [{ "@_kind": "A1" }, { "@_kind": "B1" }],
        },
      },
    }
    expect(extractKinds(biblio)).toEqual(["A1", "B1"])
  })

  it("returns an empty list on a malformed response rather than throwing", () => {
    expect(extractKinds({})).toEqual([])
  })
})

// Pure, so CI runs it without credentials.
describe("projectFamily", () => {
  const response = {
    "world-patent-data": {
      "patent-family": {
        "@_total-result-count": "2",
        "@_legal": "false",
        "family-member": [
          {
            "@_family-id": "19768124",
            "publication-reference": {
              "document-id": [
                { country: "EP", "doc-number": 1000000, kind: "B1", date: 20030212, "@_document-id-type": "docdb" },
                { "doc-number": "EP1000000", date: 20030212, "@_document-id-type": "epodoc" },
              ],
            },
            "exchange-document": {
              "bibliographic-data": {
                "invention-title": [{ "#text": "Apparatus for manufacturing green bricks", "@_lang": "en" }],
                parties: {
                  applicants: { applicant: [{ "applicant-name": { name: "DE BOER BV" }, "@_data-format": "epodoc" }] },
                },
              },
            },
          },
          {
            "publication-reference": {
              "document-id": [
                { country: "US", "doc-number": 6093011, kind: "A", date: 20000725, "@_document-id-type": "docdb" },
              ],
            },
          },
        ],
      },
    },
  }

  it("maps each member to its jurisdiction and publication", () => {
    const family = projectFamily(response)
    expect(family.total).toBe(2)
    expect(family.members[0]).toMatchObject({
      country: "EP",
      publicationNumber: "EP1000000",
      kind: "B1",
      publicationDate: "20030212",
      title: "Apparatus for manufacturing green bricks",
      applicants: ["DE BOER BV"],
    })
  })

  it("lists distinct jurisdictions, which is the coverage question", () => {
    expect(projectFamily(response).jurisdictions).toEqual(["EP", "US"])
  })

  it("reports that it carries no legal status, and says so in the note", () => {
    // A member list reads as a coverage map; a lapsed member looks identical to a live one.
    const family = projectFamily(response)
    expect(family.carriesLegalStatus).toBe(false)
    expect(family.note).toMatch(/epo-legal-status/)
  })

  it("keeps a member that has no biblio constituent", () => {
    expect(projectFamily(response).members[1]).toMatchObject({ country: "US", publicationNumber: "US6093011" })
  })

  it("returns an empty family rather than throwing on a malformed response", () => {
    expect(projectFamily({}).members).toEqual([])
  })
})

// Pure, so CI runs it without credentials.
describe("projectLegalStatus", () => {
  const event = (code: string, refCountry?: string, effective?: number) => ({
    "@_code": code,
    "@_desc": `${code} DESCRIPTION`,
    "@_infl": "-",
    // A placeholder, not a date. The real values sit one level down.
    "@_dateMigr": "00010101",
    L001EP: { "#text": "EP", "@_desc": "Country Code" },
    L007EP: { "#text": "2003-02-12", "@_desc": "Gazette DATE" },
    L500EP: {
      ...(refCountry ? { L501EP: { "#text": refCountry, "@_desc": "Ref Country Code" } } : {}),
      L510EP: { "#text": "LAPSE BECAUSE OF FAILURE TO SUBMIT A TRANSLATION", "@_desc": "Free Format Text" },
      ...(effective ? { L525EP: { "#text": effective, "@_desc": "Effective DATE" } } : {}),
    },
  })

  const response = {
    "world-patent-data": {
      "patent-family": {
        "@_total-result-count": "1",
        "@_legal": "true",
        "family-member": [
          {
            "publication-reference": {
              "document-id": [
                { country: "EP", "doc-number": 1000000, kind: "A1", "@_document-id-type": "docdb" },
                { "doc-number": "EP1000000", "@_document-id-type": "epodoc" },
              ],
            },
            legal: [event("PG25", "CH", 20030212), event("PG25", "DE", 20030513), event("17Q", undefined, 20020423)],
          },
        ],
      },
    },
  }

  it("attributes each event to the state it applies to, not the publishing office", () => {
    // L001EP reads "EP" on every PG25; taking it would collapse distinct national lapses into one.
    const { members } = projectLegalStatus(response)
    expect(members[0].events.filter((e) => e.code === "PG25").map((e) => e.country)).toEqual(["CH", "DE"])
  })

  it("falls back to the publishing office when no ref country is given", () => {
    expect(projectLegalStatus(response).members[0].events[2].country).toBe("EP")
  })

  it("lists every jurisdiction touched, including event-level states", () => {
    // CH and DE appear nowhere in the member list — only on the events.
    expect(projectLegalStatus(response).jurisdictions).toEqual(["CH", "DE", "EP"])
  })

  it("normalises both date spellings OPS uses", () => {
    const first = projectLegalStatus(response).members[0].events[0]
    expect(first.effectiveDate).toBe("2003-02-12") // from compact 20030212
    expect(first.gazetteDate).toBe("2003-02-12") // already hyphenated
  })

  it("never surfaces the dateMigr placeholder", () => {
    const json = JSON.stringify(projectLegalStatus(response))
    expect(json).not.toContain("0001-01-01")
    expect(json).not.toContain("00010101")
  })

  it("counts events across members", () => {
    expect(projectLegalStatus(response).eventCount).toBe(3)
  })

  it("returns an empty result rather than throwing on a malformed response", () => {
    expect(projectLegalStatus({})).toMatchObject({ total: 0, eventCount: 0, members: [] })
  })
})

const hasCreds = !!(process.env.EPO_CONSUMER_KEY && process.env.EPO_CONSUMER_SECRET)

describe.skipIf(!hasCreds)("EPO OPS (integration)", () => {
  describe("epoLegalStatus", () => {
    it("returns dated legal events per member, not bibliographic data", async () => {
      // `published-data/.../legal` is not a supported constituent: OPS answers it with HTTP 200
      // and the biblio payload, so this tool used to return plausible, wrong data.
      const status = await epoLegalStatus("EP1000000")
      expect(status.eventCount).toBeGreaterThan(0)
      expect(status.jurisdictions.length).toBeGreaterThan(1)

      const events = status.members.flatMap((m) => m.events)
      expect(events.some((e) => e.effectiveDate !== undefined)).toBe(true)
      expect(JSON.stringify(status)).not.toContain("0001-01-01")

      // A single EP lapse fans out across contracting states, each with its own date.
      const lapses = events.filter((e) => e.code === "PG25")
      expect(new Set(lapses.map((e) => e.country)).size).toBeGreaterThan(1)
    }, 30000)
  })

  describe("epoFamilyLookup", () => {
    it("returns members carrying jurisdiction and title, not bare numbers", async () => {
      const family = await epoFamilyLookup("EP1000000")
      expect(family.total).toBeGreaterThan(1)
      expect(family.jurisdictions.length).toBeGreaterThan(1)
      expect(family.members.some((m) => m.title !== undefined)).toBe(true)
      // OPS itself reports this constituent carries no legal events.
      expect(family.carriesLegalStatus).toBe(false)
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
    it("serves the GRANTED publication for a kind-less number", async () => {
      // EP1000000 publishes as both A1 and B1. OPS resolves the ambiguity to A1 silently, which
      // is the application as filed — 11 claims against the granted 33 — and not enforceable.
      const result = await epoGetClaims("EP1000000")
      expect(result.publication).toBe("EP.1000000.B1")
      expect(result.kind).toBe("B1")
      expect(result.granted).toBe(true)
      expect(result.availableKinds).toEqual(expect.arrayContaining(["A1", "B1"]))
      expect(result.note).toMatch(/granted/i)
    }, 30000)

    it("honours a kind the caller pinned, without second-guessing it", async () => {
      const result = await epoGetClaims("EP.1000000.A1", "docdb")
      expect(result.publication).toBe("EP.1000000.A1")
      expect(result.kind).toBe("A1")
      expect(result.granted).toBe(false)
    }, 30000)

    it("explains the EP/WO coverage limit instead of surfacing InvalidCountryCode", async () => {
      await expect(epoGetClaims("US7650331B1")).rejects.toThrow(/EP and WO/)
    }, 30000)

    it("resolves an epodoc-shaped number without an explicit format", async () => {
      // Defaulting to docdb while handing OPS an epodoc number produced HTTP 413.
      const result = await epoGetClaims("EP1000000")
      expect(JSON.stringify(result.document)).toContain("claim")
    }, 30000)

    it("still honours an explicit format when the number matches it", async () => {
      const result = await epoGetClaims("EP.1000000.A1", "docdb")
      expect(JSON.stringify(result.document)).toContain("claim")
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
