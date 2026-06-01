import { describe, expect, it } from "vitest"

import { handleOfficeActionError, OA_FALLBACK_MESSAGE } from "../src/tools/office-actions.tools"

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
