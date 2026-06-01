import { existsSync, mkdtempSync, statSync, utimesSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { createFileStore } from "../src/resources/store"

const tmpDirs: string[] = []

const freshStore = (ttlSeconds = 600) => {
  const dir = mkdtempSync(join(tmpdir(), "odp-store-"))
  tmpDirs.push(dir)
  return { dir, store: createFileStore({ dir, ttlSeconds }) }
}

const backdate = (path: string, secondsAgo: number): void => {
  const when = new Date(Date.now() - secondsAgo * 1000)
  utimesSync(path, when, when)
}

afterEach(() => {
  // Stores use unref'd intervals only when startSweep() is called; tests never start them.
})

describe("createFileStore", () => {
  it("creates its directory on construction", () => {
    const { dir } = freshStore()
    expect(existsSync(dir)).toBe(true)
  })

  it("round-trips put → getPath", () => {
    const { store } = freshStore()
    const { id } = store.put(Buffer.from("%PDF-1.7 hello"), "pdf")
    const path = store.getPath(id)
    expect(path).not.toBeNull()
    expect(path).toMatch(new RegExp(`${id}\\.pdf$`))
  })

  it("returns null and unlinks a file past its TTL", () => {
    const { store } = freshStore(600)
    const { id } = store.put(Buffer.from("stale"), "pdf")
    const path = store.getPath(id)!
    expect(existsSync(path)).toBe(true)

    backdate(path, 601)
    expect(store.getPath(id)).toBeNull()
    expect(existsSync(path)).toBe(false)
  })

  it("returns null for a malformed UUID without touching the filesystem", () => {
    const { store } = freshStore()
    expect(store.getPath("not-a-uuid")).toBeNull()
    expect(store.getPath("../../etc/passwd")).toBeNull()
  })

  it("sweep removes only expired files", () => {
    const { dir, store } = freshStore(600)
    const fresh = store.put(Buffer.from("keep"), "pdf")
    const stale = store.put(Buffer.from("drop"), "pdf")
    const stalePath = store.getPath(stale.id)!
    backdate(stalePath, 601)

    store.sweep()

    expect(store.getPath(fresh.id)).not.toBeNull()
    expect(existsSync(stalePath)).toBe(false)
    // Directory survives the sweep.
    expect(statSync(dir).isDirectory()).toBe(true)
  })
})
