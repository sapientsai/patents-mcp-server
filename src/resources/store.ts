import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { config } from "../lib/config"

/** Strict v4 UUID — the only shape a resource id may take. */
export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export type FileStore = {
  /** TTL the store enforces, in seconds — surfaced so callers can report `expiresInSeconds`. */
  readonly ttlSeconds: number
  /** Writes `{id}.{ext}` and returns the generated UUID. */
  put(buf: Buffer, ext: string): { id: string }
  /** Path for `id` if a file exists and is within TTL; otherwise unlinks-if-stale and returns null. */
  getPath(id: string): string | null
  /** Unlinks every file older than TTL. */
  sweep(): void
  /** Starts a single unref'd background sweep; idempotent across calls. */
  startSweep(): void
}

export type FileStoreOptions = {
  readonly dir: string
  readonly ttlSeconds: number
}

export const createFileStore = ({ dir, ttlSeconds }: FileStoreOptions): FileStore => {
  const ttlMs = ttlSeconds * 1000

  const ensureDir = (): void => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }

  const isExpired = (path: string): boolean => Date.now() - statSync(path).mtimeMs > ttlMs

  ensureDir()

  let sweepStarted = false

  const sweep = (): void => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      try {
        if (isExpired(path)) unlinkSync(path)
      } catch {
        // File was removed concurrently (read/sweep race) — nothing to clean up.
      }
    }
  }

  return {
    ttlSeconds,

    put(buf, ext) {
      ensureDir()
      const id = randomUUID()
      writeFileSync(join(dir, `${id}.${ext}`), buf)
      return { id }
    },

    getPath(id) {
      if (!UUID_V4.test(id)) return null
      if (!existsSync(dir)) return null
      const match = readdirSync(dir).find((name) => name.startsWith(`${id}.`))
      if (!match) return null
      const path = join(dir, match)
      if (isExpired(path)) {
        unlinkSync(path)
        return null
      }
      return path
    },

    sweep,

    startSweep() {
      if (sweepStarted) return
      sweepStarted = true
      // unref so the interval never keeps the process alive (stdio transport, tests).
      setInterval(sweep, ttlMs).unref()
    },
  }
}

/** Default store wired to env-derived config; the deployed server's transient PDF cache. */
export const resourceStore = createFileStore({
  dir: config.resourceDir,
  ttlSeconds: config.resourceTtlSeconds,
})
