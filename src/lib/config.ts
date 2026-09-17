import { expandPath } from "functype-os"

import type { ApiStatus, LogLevel, TransportType } from "./types"

type GcpCredentials = {
  client_email: string
  private_key: string
}

type AppConfig = {
  usptoApiKey: string | undefined
  epoConsumerKey: string | undefined
  epoConsumerSecret: string | undefined
  googleApplicationCredentials: string | undefined
  googleCredentialsJson: GcpCredentials | undefined
  googleCloudProject: string | undefined
  transport: TransportType
  port: number
  logLevel: LogLevel
  requestTimeout: number
  maxRetries: number
  retryMinWait: number
  retryMaxWait: number
  resourceDir: string
  resourceTtlSeconds: number
  publicBaseUrl: string
}

const envOrUndefined = (key: string): string | undefined => {
  const value = process.env[key]
  return value !== undefined && value !== "" ? value : undefined
}

const envPathOrUndefined = (key: string): string | undefined => {
  const value = envOrUndefined(key)
  if (!value) return undefined
  const result = expandPath(value)
  return result.isRight() ? result.value : value
}

const envJsonOrUndefined = (key: string): GcpCredentials | undefined => {
  const value = envOrUndefined(key)
  if (!value) return undefined
  try {
    return JSON.parse(value) as GcpCredentials
  } catch {
    return undefined
  }
}

const envOrDefault = (key: string, defaultValue: string): string => process.env[key] ?? defaultValue

const envIntOrDefault = (key: string, defaultValue: number): number => {
  const value = process.env[key]
  if (value === undefined || value === "") return defaultValue
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

/**
 * The origin `odp-download-document` builds its URLs on, under httpStream.
 *
 * This used to default to a specific deployment's hostname, which is wrong in two directions: a
 * self-hoster who never set it got download links pointing at someone else's server — well-formed
 * and permanently 404 — and that host travelled inside a published npm package. Falling back to
 * the address this process actually listens on is at least true of the machine serving the file.
 *
 * Anything behind a reverse proxy or a public hostname must still set PUBLIC_BASE_URL explicitly:
 * a process cannot know the name it is reached by. `index.ts` warns when this fallback is used.
 */
const resolvePublicBaseUrl = (): string => {
  const configured = envOrUndefined("PUBLIC_BASE_URL")
  if (configured !== undefined) return configured.replace(/\/+$/, "")
  // An env var set to the empty string is not nullish, so `??` would happily yield `http://:3000`.
  // Deployment tooling sets blanks routinely — .mcp.json did exactly that for the EPO keys.
  const host = envOrUndefined("HOST") ?? "0.0.0.0"
  // 0.0.0.0 means "every interface" when binding, but is not an address you can fetch.
  const reachable = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host
  return `http://${reachable}:${envIntOrDefault("PORT", 8080)}`
}

const parseTransport = (value: string): TransportType => {
  if (value === "httpStream") return "httpStream"
  return "stdio"
}

const parseLogLevel = (value: string): LogLevel => {
  const upper = value.toUpperCase()
  if (upper === "DEBUG" || upper === "INFO" || upper === "WARN" || upper === "ERROR") {
    return upper
  }
  return "INFO"
}

export const loadConfig = (): AppConfig => ({
  usptoApiKey: envOrUndefined("USPTO_API_KEY"),
  epoConsumerKey: envOrUndefined("EPO_CONSUMER_KEY"),
  epoConsumerSecret: envOrUndefined("EPO_CONSUMER_SECRET"),
  googleApplicationCredentials: envPathOrUndefined("GOOGLE_APPLICATION_CREDENTIALS"),
  googleCredentialsJson: envJsonOrUndefined("GOOGLE_CREDENTIALS_JSON"),
  googleCloudProject: envOrUndefined("GOOGLE_CLOUD_PROJECT"),
  transport: parseTransport(envOrDefault("TRANSPORT", "stdio")),
  port: envIntOrDefault("PORT", 8080),
  logLevel: parseLogLevel(envOrDefault("LOG_LEVEL", "INFO")),
  requestTimeout: envIntOrDefault("REQUEST_TIMEOUT", 30000),
  maxRetries: envIntOrDefault("MAX_RETRIES", 3),
  retryMinWait: envIntOrDefault("RETRY_MIN_WAIT", 2000),
  retryMaxWait: envIntOrDefault("RETRY_MAX_WAIT", 10000),
  resourceDir: envOrDefault("RESOURCE_DIR", "/tmp/odp-cache"),
  resourceTtlSeconds: envIntOrDefault("RESOURCE_TTL_SECONDS", 600),
  publicBaseUrl: resolvePublicBaseUrl(),
})

export const getAvailableSources = (cfg: AppConfig): ApiStatus[] => [
  {
    name: "USPTO ODP",
    configured: cfg.usptoApiKey !== undefined,
    healthy: false,
  },
  {
    name: "EPO OPS",
    configured: cfg.epoConsumerKey !== undefined && cfg.epoConsumerSecret !== undefined,
    healthy: false,
  },
  {
    name: "Google BigQuery",
    configured:
      (cfg.googleApplicationCredentials !== undefined || cfg.googleCredentialsJson !== undefined) &&
      cfg.googleCloudProject !== undefined,
    healthy: false,
  },
]

export const config = loadConfig()
