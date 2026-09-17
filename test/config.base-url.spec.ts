import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * `publicBaseUrl` is the origin `odp-download-document` builds its PDF links on. It used to
 * default to one deployment's hostname, so a self-hoster who never set it got well-formed links
 * to someone else's server — and that hostname shipped inside a published npm package.
 */
const loadConfig = async (env: Record<string, string | undefined>) => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, "")
    else vi.stubEnv(key, value)
  }
  vi.resetModules() // config is built at import time
  return (await import("../src/lib/config")).config
}

describe("publicBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("uses PUBLIC_BASE_URL when it is set", async () => {
    const config = await loadConfig({ PUBLIC_BASE_URL: "https://patents.example.org" })
    expect(config.publicBaseUrl).toBe("https://patents.example.org")
  })

  it("strips trailing slashes, so URLs do not end up doubled", async () => {
    const config = await loadConfig({ PUBLIC_BASE_URL: "https://patents.example.org///" })
    expect(config.publicBaseUrl).toBe("https://patents.example.org")
  })

  it("falls back to the address this process listens on, not a hardcoded host", async () => {
    const config = await loadConfig({ PUBLIC_BASE_URL: undefined, HOST: undefined, PORT: "3000" })
    expect(config.publicBaseUrl).toBe("http://127.0.0.1:3000")
    expect(config.publicBaseUrl).not.toContain("civala")
  })

  it("rewrites a 0.0.0.0 bind to a fetchable loopback address", async () => {
    // 0.0.0.0 means "every interface" when binding and is not an address a client can fetch.
    const config = await loadConfig({ PUBLIC_BASE_URL: undefined, HOST: "0.0.0.0", PORT: "3000" })
    expect(config.publicBaseUrl).toBe("http://127.0.0.1:3000")
  })

  it("honours an explicit HOST", async () => {
    const config = await loadConfig({ PUBLIC_BASE_URL: undefined, HOST: "patents.internal", PORT: "9000" })
    expect(config.publicBaseUrl).toBe("http://patents.internal:9000")
  })
})
