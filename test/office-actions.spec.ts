import { describe, expect, it } from "vitest"

import { handleCitationsError } from "../src/tools/citations.tools"
import { handleOfficeActionError, OA_FALLBACK_MESSAGE } from "../src/tools/office-actions.tools"
import { handlePtabError } from "../src/tools/ptab.tools"

describe("handleOfficeActionError", () => {
  it("routes a 403 (status shape) to the download fallback", () => {
    const error = Object.assign(new Error("API Error 403 Forbidden: nope"), {
      status: 403,
      statusText: "Forbidden",
      body: "nope",
    })
    const message = handleOfficeActionError(error)
    expect(message).toBe(OA_FALLBACK_MESSAGE)
    expect(message).toContain("odp-download-document")
    expect(message).toContain("odp-get-documents")
  })

  it("routes a 403 (response shape) to the download fallback", () => {
    const error = { response: { status: 403, statusText: "Forbidden" } }
    expect(handleOfficeActionError(error)).toBe(OA_FALLBACK_MESSAGE)
  })

  it("does not hijack a non-403 error", () => {
    const error = Object.assign(new Error("API Error 404 Not Found: gone"), {
      status: 404,
      statusText: "Not Found",
      body: "gone",
    })
    const message = handleOfficeActionError(error)
    expect(message).not.toBe(OA_FALLBACK_MESSAGE)
    expect(message).toContain("not found")
  })

  it("falls through to the generic handler for unstructured errors", () => {
    const message = handleOfficeActionError(new Error("socket hang up"))
    expect(message).not.toBe(OA_FALLBACK_MESSAGE)
    expect(message).toContain("socket hang up")
  })
})

describe("tier-aware 403 handlers", () => {
  const forbidden = Object.assign(new Error("API Error 403 Forbidden"), { status: 403 })

  it.each([
    ["PTAB", handlePtabError],
    ["citations", handleCitationsError],
  ])("%s names the tier and points somewhere that works", (_label, handle) => {
    const message = handle(forbidden)
    // A bare "Access forbidden" reads as a broken tool rather than a missing entitlement.
    expect(message).not.toBe("Access forbidden. Your credentials do not have permission for this resource.")
    expect(message).toContain("403")
    expect(message).toMatch(/entitled/i)
  })

  it.each([handlePtabError, handleCitationsError])("does not hijack a non-403", (handle) => {
    const message = handle(Object.assign(new Error("API Error 404"), { status: 404 }))
    expect(message).toMatch(/not found/i)
  })
})
