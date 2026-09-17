import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { OdpClient } from "../src/clients/odp.client"

/**
 * These pin the requests each client builds, without touching the network.
 *
 * Every defect fixed in this client so far was a malformed request rather than a mishandled
 * response: `sort` sent as a string where ODP wants an array, `/metadata` for `/meta-data`, an
 * unsupported `legal` constituent, a missing `reference-type` segment, a docdb path carrying an
 * epodoc number. All of them are visible in the outgoing request. The suites that would have
 * caught them were credential-gated, so CI — which has no credentials — skipped every one.
 */

const okJson = () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "{}" }) as Response

const lastCall = () => {
  const calls = vi.mocked(fetch).mock.calls
  const [url, init] = calls[calls.length - 1] as [string, RequestInit | undefined]
  return { url, init, body: init?.body ? JSON.parse(String(init.body)) : undefined }
}

describe("ODP request shapes", () => {
  let client: OdpClient

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson()))
    client = new OdpClient({ apiKey: "test-key" })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe("searchApplications", () => {
    it("sends sort as an array of {field, order}", async () => {
      // A bare string is rejected with HTTP 400, which is how it shipped.
      await client.searchApplications({ query: "crispr", sortField: "applicationMetaData.filingDate" })
      expect(lastCall().body.sort).toEqual([{ field: "applicationMetaData.filingDate", order: "desc" }])
    })

    it("omits sort entirely when no field is given", async () => {
      await client.searchApplications({ query: "crispr" })
      expect(lastCall().body).not.toHaveProperty("sort")
    })

    it("projects fields, so the response is not the whole file wrapper", async () => {
      // Unprojected, three results ran to 225,036 characters — mostly the firm's attorney roster.
      await client.searchApplications({ query: "crispr" })
      expect(lastCall().body.fields).toContain("applicationNumberText")
      expect(lastCall().body.fields.length).toBeGreaterThan(5)
    })

    it("keeps the application number when the caller names their own fields", async () => {
      await client.searchApplications({ query: "crispr", fields: ["applicationMetaData.inventionTitle"] })
      expect(lastCall().body.fields).toContain("applicationNumberText")
    })

    it("ANDs bare terms, and leaves a structured query alone", async () => {
      await client.searchApplications({ query: "quantum error correction" })
      expect(lastCall().body.q).toBe("quantum AND error AND correction")

      await client.searchApplications({ query: "(quantum OR qubit) AND error" })
      expect(lastCall().body.q).toBe("(quantum OR qubit) AND error")

      await client.searchApplications({ query: "quantum error correction", mode: "any" })
      expect(lastCall().body.q).toBe("quantum error correction")
    })

    it("passes pagination through", async () => {
      await client.searchApplications({ query: "crispr", limit: 5, offset: 10 })
      expect(lastCall().body.pagination).toEqual({ offset: 10, limit: 5 })
    })
  })

  describe("application sub-resource paths", () => {
    // A misspelled ODP path answers 403, not 404 — indistinguishable from a missing entitlement.
    // `/metadata` shipped that way and read as "this key lacks access" for as long as it was wrong.
    it.each([
      ["getApplicationMetadata", "/meta-data"],
      ["getContinuity", "/continuity"],
      ["getAssignment", "/assignment"],
      ["getAdjustment", "/adjustment"],
      ["getAttorney", "/attorney"],
      ["getForeignPriority", "/foreign-priority"],
      ["getTransactions", "/transactions"],
      ["getDocuments", "/documents"],
    ])("%s requests %s", async (method, suffix) => {
      await (client[method as keyof OdpClient] as (n: string) => Promise<unknown>)("14412875")
      expect(lastCall().url).toBe(`https://api.uspto.gov/api/v1/patent/applications/14412875${suffix}`)
    })
  })

  it("sends the API key as a header, never in the URL", async () => {
    await client.getApplication("14412875")
    const { url, init } = lastCall()
    expect(url).not.toContain("test-key")
    expect((init?.headers as Record<string, string>)["X-API-KEY"]).toBe("test-key")
  })
})

describe("EPO request shapes", () => {
  const loadClient = async () => {
    vi.stubEnv("EPO_CONSUMER_KEY", "key")
    vi.stubEnv("EPO_CONSUMER_SECRET", "secret")
    vi.resetModules() // config is read at import, and the token cache is module-level
    return import("../src/clients/epo-ops.client")
  }

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("accesstoken")
          ? ({ ok: true, json: async () => ({ access_token: "t" }) } as Response)
          : ({
              ok: true,
              status: 200,
              text: async () => "<world-patent-data/>",
              headers: { get: () => null },
            } as unknown as Response),
      ),
    )
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const requested = () =>
    vi
      .mocked(fetch)
      .mock.calls.map(([url]) => String(url))
      .filter((u) => !u.includes("accesstoken"))

  it("asks for legal status on the family endpoint, not as a published-data constituent", async () => {
    // `published-data/.../legal` is unsupported and OPS answers it 200 with the biblio payload,
    // so the tool returned plausible, wrong data rather than an error.
    const { epoLegalStatus } = await loadClient()
    await epoLegalStatus("EP1000000")
    expect(requested()[0]).toContain("/family/publication/epodoc/EP1000000/legal")
  })

  it("asks search for the biblio constituent, so hits carry titles", async () => {
    const { epoSearchPatents } = await loadClient()
    await epoSearchPatents('ti="antibody"', "1-5")
    expect(requested()[0]).toContain("/published-data/search/biblio?q=")
    expect(requested()[0]).toContain("Range=1-5")
  })

  it("includes the reference-type segment the number service requires", async () => {
    // Without it no route matches and OPS returns HTTP 405.
    const { epoNumberConvert } = await loadClient()
    await epoNumberConvert("EP1000000", "epodoc", "docdb")
    expect(requested()[0]).toContain("/number-service/publication/epodoc/EP1000000/docdb")
  })

  it("routes a kind-suffixed number to docdb and a bare one to epodoc", async () => {
    // epodoc 404s on a trailing kind code; docdb cannot resolve a bare number for single
    // documents. Pairing them the wrong way was a 404 on the tool's own documented example.
    const { epoGetBiblio } = await loadClient()
    await epoGetBiblio("US7650331B1")
    expect(requested()[0]).toContain("/publication/docdb/US7650331B1/biblio")

    await epoGetBiblio("EP1000000")
    expect(requested()[1]).toContain("/publication/epodoc/EP1000000/biblio")
  })

  it("asks the family endpoint for biblio, so members carry titles", async () => {
    const { epoFamilyLookup } = await loadClient()
    await epoFamilyLookup("EP1000000")
    expect(requested()[0]).toContain("/family/publication/epodoc/EP1000000/biblio")
  })
})
