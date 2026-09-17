import { describe, expect, it, vi } from "vitest"

import { isRetryableError } from "../src/lib/errors"
import { withRetry } from "../src/lib/retry"

const httpError = (status: number) => Object.assign(new Error(`API Error ${status}`), { status })

describe("isRetryableError", () => {
  it.each([403, 404, 400, 401, 422])("does not retry a permanent %i", (status) => {
    expect(isRetryableError(httpError(status))).toBe(false)
  })

  it.each([408, 429, 500, 502, 503])("retries a transient %i", (status) => {
    expect(isRetryableError(httpError(status))).toBe(true)
  })

  it("retries an error carrying no status, such as a socket failure", () => {
    expect(isRetryableError(new Error("socket hang up"))).toBe(true)
  })

  it("reads the response-shaped error too", () => {
    expect(isRetryableError({ response: { status: 403, statusText: "Forbidden" } })).toBe(false)
  })
})

describe("withRetry", () => {
  it("surfaces a 403 on the first attempt instead of backing off", async () => {
    // 17 of this server's tools 403 on entitlement. Retrying them cost four attempts and ~14s
    // of backoff before the error appeared, which reads as a hang rather than a refusal.
    const fn = vi.fn().mockRejectedValue(httpError(403))
    await expect(withRetry(fn, { maxRetries: 3, minWait: 1, maxWait: 2 })).rejects.toThrow("403")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("still retries a 500 up to the limit", async () => {
    const fn = vi.fn().mockRejectedValue(httpError(500))
    await expect(withRetry(fn, { maxRetries: 2, minWait: 1, maxWait: 2 })).rejects.toThrow("500")
    expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it("returns as soon as an attempt succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(httpError(503)).mockResolvedValue("ok")
    await expect(withRetry(fn, { maxRetries: 3, minWait: 1, maxWait: 2 })).resolves.toBe("ok")
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
