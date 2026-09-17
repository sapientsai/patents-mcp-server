import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

type Registered = { name: string; description?: string }

/**
 * Which tools exist is decided by which credentials are present, and a break in that logic
 * removes capability *silently* — tools do not fail, they simply stop being offered. Nothing in
 * the suite checked it; the 41-tool count was only ever confirmed by driving a live session by
 * hand. A recording stand-in for FastMCP is enough, and needs no credentials or network.
 */
const registerWith = async (env: Record<string, string>): Promise<Registered[]> => {
  for (const key of [
    "USPTO_API_KEY",
    "EPO_CONSUMER_KEY",
    "EPO_CONSUMER_SECRET",
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_CREDENTIALS_JSON",
  ]) {
    vi.stubEnv(key, env[key] ?? "")
  }
  vi.resetModules() // config is read at import time

  const tools: Registered[] = []
  const server = {
    addTool: (tool: Registered) => tools.push(tool),
    addResource: () => undefined,
    addResourceTemplate: () => undefined,
    addPrompt: () => undefined,
  }
  const { registerAllTools } = await import("../src/tools/index")
  registerAllTools(server as never)
  return tools
}

const names = (tools: Registered[]) => tools.map((t) => t.name)

describe("conditional tool registration", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("registers only the utility tools when nothing is configured", async () => {
    const tools = await registerWith({})
    expect(names(tools).sort()).toEqual(["check-api-status", "get-cpc-info", "get-status-code"])
  })

  it("registers the USPTO groups on the USPTO key alone", async () => {
    const tools = names(await registerWith({ USPTO_API_KEY: "k" }))
    expect(tools).toContain("odp-search-applications")
    expect(tools).toContain("ptab-search-proceedings")
    expect(tools).toContain("citations-search")
    expect(tools).toContain("office-action-search")
    // EPO and BigQuery stay absent rather than registering and failing at call time.
    expect(tools.filter((n) => n.startsWith("epo-"))).toEqual([])
    expect(tools.filter((n) => n.startsWith("bigquery-"))).toEqual([])
  })

  it("needs both EPO credentials, not either one", async () => {
    // A half-configured EPO account would register eight tools that cannot authenticate.
    expect(names(await registerWith({ EPO_CONSUMER_KEY: "k" })).filter((n) => n.startsWith("epo-"))).toEqual([])
    expect(names(await registerWith({ EPO_CONSUMER_SECRET: "s" })).filter((n) => n.startsWith("epo-"))).toEqual([])

    const both = names(await registerWith({ EPO_CONSUMER_KEY: "k", EPO_CONSUMER_SECRET: "s" }))
    expect(both.filter((n) => n.startsWith("epo-"))).toHaveLength(8)
  })

  it("needs a project as well as credentials for BigQuery", async () => {
    expect(
      names(await registerWith({ GOOGLE_APPLICATION_CREDENTIALS: "/tmp/k.json" })).filter((n) =>
        n.startsWith("bigquery-"),
      ),
    ).toEqual([])

    const configured = names(
      await registerWith({ GOOGLE_APPLICATION_CREDENTIALS: "/tmp/k.json", GOOGLE_CLOUD_PROJECT: "p" }),
    )
    expect(configured.filter((n) => n.startsWith("bigquery-")).length).toBeGreaterThan(0)
  })

  it("registers every tool when everything is configured", async () => {
    const tools = names(
      await registerWith({
        USPTO_API_KEY: "k",
        EPO_CONSUMER_KEY: "k",
        EPO_CONSUMER_SECRET: "s",
        GOOGLE_APPLICATION_CREDENTIALS: "/tmp/k.json",
        GOOGLE_CLOUD_PROJECT: "p",
      }),
    )
    expect(new Set(tools).size).toBe(tools.length) // no duplicate names
    expect(tools.length).toBeGreaterThanOrEqual(41)
  })
})

describe("tool descriptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  const everything = () =>
    registerWith({
      USPTO_API_KEY: "k",
      EPO_CONSUMER_KEY: "k",
      EPO_CONSUMER_SECRET: "s",
      GOOGLE_APPLICATION_CREDENTIALS: "/tmp/k.json",
      GOOGLE_CLOUD_PROJECT: "p",
    })

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) return entry === "generated" ? [] : sourceFiles(path)
      return path.endsWith(".ts") ? [path] : []
    })

  it("never names a tool that does not exist, anywhere in src", async () => {
    // Scans source rather than descriptions alone: the stale pointer that prompted this lived in
    // a note built at runtime inside the client, so a description-only scan would have missed it.
    // Comments count too — a reference that has gone stale misleads whoever reads it next.
    const registered = new Set(names(await everything()))
    // Derive what a tool reference looks like from the real names, so unrelated hyphenated
    // identifiers — /tmp/odp-cache, the epo-ops service name — are not mistaken for one.
    const verbs = new Set([...registered].map((name) => name.split("-")[1]))
    const dangling = new Map<string, string>()

    for (const file of sourceFiles("src")) {
      const text = readFileSync(file, "utf8")
      for (const match of text.matchAll(
        /\b((?:odp|epo|ptab|bigquery|citations|litigation|office-action)-[a-z]+(?:-[a-z]+)*)\b/g,
      )) {
        const name = match[1]
        if (!verbs.has(name.split("-")[1])) continue
        if (!registered.has(name)) dangling.set(name, file)
      }
    }

    expect([...dangling].map(([name, file]) => `${name} (${file})`)).toEqual([])
  })

  it("only cross-references tools that exist", async () => {
    // epo-number-convert pointed at a field epo-get-biblio does not emit, and the office-action
    // fallback names the tools to use instead. A stale pointer sends the caller nowhere.
    const tools = await everything()
    const registered = new Set(names(tools))
    const mentioned = new Set<string>()

    for (const tool of tools) {
      for (const match of (tool.description ?? "").matchAll(
        /\b((?:odp|epo|ptab|bigquery|citations?|litigation|office-action)-[a-z-]+[a-z])\b/g,
      )) {
        mentioned.add(match[1])
      }
    }

    expect(mentioned.size).toBeGreaterThan(0)
    const dangling = [...mentioned].filter((name) => !registered.has(name))
    expect(dangling).toEqual([])
  })

  it("gives every tool a description that says what it does", async () => {
    // Deliberately a floor against a missing or stub description, not a length target — "Get a
    // specific PTAB decision by ID." is short because the tool is simple, and padding it would
    // make it worse. What the model needs is the description to exist and name the subject.
    for (const tool of await everything()) {
      expect(tool.description, `${tool.name} has no description`).toBeTruthy()
      expect(tool.description!.trim().length, `${tool.name} description is a stub`).toBeGreaterThan(20)
    }
  })
})
