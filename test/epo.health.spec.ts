import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * `check-api-status` used to report EPO unhealthy whenever it was configured: the status object
 * was initialised `healthy: false` and only the *unconfigured* branch ever wrote to it, so a
 * working EPO account was indistinguishable from a broken one. These cases pin the probe to
 * real outcomes rather than a constant.
 */
const loadProbe = async (key?: string, secret?: string) => {
  vi.stubEnv("EPO_CONSUMER_KEY", key ?? "")
  vi.stubEnv("EPO_CONSUMER_SECRET", secret ?? "")
  vi.resetModules() // config is read at import time, and the token cache is module-level
  return (await import("../src/clients/epo-ops.client")).epoHealthCheck
}

describe("epoHealthCheck", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("reports healthy when the OAuth handshake succeeds", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "token-abc" }),
    } as Response)

    const epoHealthCheck = await loadProbe("key", "secret")
    await expect(epoHealthCheck()).resolves.toEqual({ healthy: true })
  })

  it("reports the failure when EPO rejects the credentials", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    } as Response)

    const epoHealthCheck = await loadProbe("stale-key", "stale-secret")
    const result = await epoHealthCheck()

    expect(result.healthy).toBe(false)
    // The point of the fix: a specific cause, not a bare false.
    expect(result.error).toContain("401")
  })

  it("reports the failure when EPO is unreachable", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"))

    const epoHealthCheck = await loadProbe("key", "secret")
    const result = await epoHealthCheck()

    expect(result.healthy).toBe(false)
    expect(result.error).toContain("network down")
  })

  it("reports unhealthy without calling EPO when credentials are absent", async () => {
    const epoHealthCheck = await loadProbe(undefined, undefined)
    const result = await epoHealthCheck()

    expect(result.healthy).toBe(false)
    expect(result.error).toMatch(/not configured/i)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe("buildApiStatuses", () => {
  const withCreds = async () => {
    vi.stubEnv("USPTO_API_KEY", "k")
    vi.stubEnv("EPO_CONSUMER_KEY", "k")
    vi.stubEnv("EPO_CONSUMER_SECRET", "s")
    vi.resetModules()
    return (await import("../src/tools/utility.tools")).buildApiStatuses
  }
  const epo = (statuses: { name: string; healthy: boolean; error?: string }[]) =>
    statuses.find((s) => s.name.startsWith("EPO"))!

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("reports EPO healthy when its probe succeeds", async () => {
    const buildApiStatuses = await withCreds()
    const statuses = await buildApiStatuses({
      odp: async () => ({ healthy: true }),
      epo: async () => ({ healthy: true }),
    })
    // The regression: this returned false for every configured EPO account.
    expect(epo(statuses)).toMatchObject({ configured: true, healthy: true })
  })

  it("surfaces the EPO probe's error when it fails", async () => {
    const buildApiStatuses = await withCreds()
    const statuses = await buildApiStatuses({
      odp: async () => ({ healthy: true }),
      epo: async () => ({ healthy: false, error: "EPO OAuth failed: 401 Unauthorized" }),
    })
    expect(epo(statuses)).toMatchObject({ configured: true, healthy: false })
    expect(epo(statuses).error).toContain("401")
  })

  it("does not probe EPO when it is unconfigured", async () => {
    vi.stubEnv("EPO_CONSUMER_KEY", "")
    vi.stubEnv("EPO_CONSUMER_SECRET", "")
    vi.resetModules()
    const { buildApiStatuses } = await import("../src/tools/utility.tools")
    const epoProbe = vi.fn()

    const statuses = await buildApiStatuses({ odp: async () => ({ healthy: false }), epo: epoProbe })

    expect(epoProbe).not.toHaveBeenCalled()
    expect(epo(statuses)).toMatchObject({ configured: false, healthy: false })
    expect(epo(statuses).error).toContain("EPO_CONSUMER_KEY")
  })
})
