import { describe, expect, it } from "vitest"

import { normalizePatentNumber } from "../src/lib/patent-number"

describe("normalizePatentNumber", () => {
  it("handles plain number", () => {
    expect(normalizePatentNumber("17248024")).toBe("17248024")
  })

  it("strips slashes and commas", () => {
    expect(normalizePatentNumber("17/248,024")).toBe("17248024")
  })

  it("strips US prefix with space", () => {
    expect(normalizePatentNumber("US 17/248,024")).toBe("17248024")
  })

  it("strips US prefix with dash and preserves kind code", () => {
    expect(normalizePatentNumber("US-11646472-B2")).toBe("11646472B2")
  })

  it("handles plain number with kind code", () => {
    expect(normalizePatentNumber("11646472B1")).toBe("11646472B1")
  })

  it("handles EP prefix", () => {
    expect(normalizePatentNumber("EP1000000")).toBe("1000000")
  })
})
