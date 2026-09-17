import { XMLParser } from "fast-xml-parser"

import { config } from "../lib/config"
import { withRetry } from "../lib/retry"
import { BaseClient } from "./base.client"

const EPO_AUTH_URL = "https://ops.epo.org/3.2/auth/accesstoken"
const EPO_BASE_URL = "https://ops.epo.org/3.2/rest-services/"

type EpoNumberFormat = "docdb" | "epodoc" | "original"

type TokenCache = {
  token: string
  expiresAt: number
}

let tokenCache: TokenCache | undefined

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  isArray: (name) => {
    const arrayElements = [
      "exchange-document",
      "document-id",
      "classification-ipcr",
      "classification-cpc",
      "patent-classification",
      "applicant",
      "inventor",
      "priority-claim",
      "family-member",
      "legal",
    ]
    return arrayElements.includes(name)
  },
})

const getAccessToken = async (): Promise<string> => {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token
  }

  const key = config.epoConsumerKey
  const secret = config.epoConsumerSecret

  if (!key || !secret) {
    throw new Error("EPO OPS credentials not configured. Set EPO_CONSUMER_KEY and EPO_CONSUMER_SECRET.")
  }

  const credentials = Buffer.from(`${key}:${secret}`).toString("base64")

  const response = await fetch(EPO_AUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  })

  if (!response.ok) {
    throw new Error(`EPO OAuth failed: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as { access_token: string }
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + 19 * 60 * 1000, // 19 min (1 min buffer before 20 min expiry)
  }

  return tokenCache.token
}

const clearTokenCache = (): void => {
  tokenCache = undefined
}

const epoRequest = async <T>(path: string, accept = "application/xml"): Promise<T> => {
  const makeRequest = async (): Promise<T> => {
    const token = await getAccessToken()

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), config.requestTimeout)

    try {
      const response = await fetch(`${EPO_BASE_URL}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: accept,
        },
        signal: controller.signal,
      })

      if (response.status === 400 || response.status === 401) {
        clearTokenCache()
        throw new Error(`EPO auth error: ${response.status}`)
      }

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`EPO API error ${response.status}: ${text.slice(0, 500)}`)
      }

      const throttling = response.headers.get("x-throttling-control")
      if (throttling?.includes("black")) {
        throw new Error("EPO rate limit exceeded (black). Wait before retrying.")
      }

      if (accept === "application/json") {
        return (await response.json()) as T
      }

      const xml = await response.text()
      return xmlParser.parse(xml) as T
    } finally {
      clearTimeout(timeoutId)
    }
  }

  return withRetry(makeRequest, {
    maxRetries: config.maxRetries,
    minWait: config.retryMinWait,
    maxWait: config.retryMaxWait,
  })
}

/** docdb publication numbers are dotted triples — `EP.1000000.A1`. epodoc numbers are not. */
const DOCDB_SHAPE = /^[A-Z]{2}\.[^.]+\.[^.]+$/

/**
 * Infers which OPS number format a string is written in.
 *
 * OPS cannot convert between formats on your behalf: the format segment in the URL must match
 * the shape of the number beside it, or it answers with a misleading error — a docdb path
 * carrying an epodoc number returns HTTP 413, not a 404.
 */
export const detectNumberFormat = (number: string): EpoNumberFormat =>
  DOCDB_SHAPE.test(number.replace(/\s+/g, "").replace(/[/,]/g, "")) ? "docdb" : "epodoc"

/**
 * Pairs a number with the format segment that matches it.
 *
 * `format` is an override for callers who know better; left undefined, the shape decides. The
 * default used to be a hard-coded "docdb" while every documented example (`EP1000000`,
 * `US7650331B1`) is epodoc-shaped, so the common call was always mismatched.
 */
const resolveRef = (number: string, format?: EpoNumberFormat): { format: EpoNumberFormat; num: string } => {
  if (format === "original") return { format: "original", num: number }
  const cleaned = number.replace(/\s+/g, "").replace(/[/,]/g, "")
  return { format: format ?? detectNumberFormat(cleaned), num: cleaned }
}

/**
 * Verifies EPO OPS credentials by performing the OAuth client-credentials handshake.
 *
 * The handshake is the right probe: OPS credentials expire and get revoked, and that failure
 * is invisible until a tool call fails. It also costs no OPS search quota. A cached, unexpired
 * token short-circuits it, so repeated status checks are free — and a cached token is itself
 * evidence the credentials worked within the last 19 minutes.
 */
export const epoHealthCheck = async (): Promise<{ healthy: boolean; error?: string }> => {
  try {
    await getAccessToken()
    return { healthy: true }
  } catch (error) {
    return { healthy: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export const epoSearchPatents = async (query: string, range?: string): Promise<unknown> => {
  const rangePart = range ? `&Range=${range}` : ""
  return epoRequest(`published-data/search?q=${encodeURIComponent(query)}${rangePart}`)
}

export const epoGetBiblio = async (number: string, format?: EpoNumberFormat): Promise<unknown> => {
  const { format: fmt, num } = resolveRef(number, format)
  return epoRequest(`published-data/publication/${fmt}/${num}/biblio`)
}

export const epoGetAbstract = async (number: string, format?: EpoNumberFormat): Promise<unknown> => {
  const { format: fmt, num } = resolveRef(number, format)
  return epoRequest(`published-data/publication/${fmt}/${num}/abstract`)
}

export const epoGetClaims = async (number: string, format?: EpoNumberFormat): Promise<unknown> => {
  const { format: fmt, num } = resolveRef(number, format)
  return epoRequest(`published-data/publication/${fmt}/${num}/claims`)
}

export const epoGetDescription = async (number: string, format?: EpoNumberFormat): Promise<unknown> => {
  const { format: fmt, num } = resolveRef(number, format)
  return epoRequest(`published-data/publication/${fmt}/${num}/description`)
}

export const epoFamilyLookup = async (number: string, format?: EpoNumberFormat): Promise<unknown> => {
  const { format: fmt, num } = resolveRef(number, format)
  return epoRequest(`family/publication/${fmt}/${num}`)
}

export const epoLegalStatus = async (number: string, format?: EpoNumberFormat): Promise<unknown> => {
  const { format: fmt, num } = resolveRef(number, format)
  return epoRequest(`family/publication/${fmt}/${num}/legal`)
}

/** What an OPS number refers to. The number service requires this segment in the path. */
export type EpoReferenceType = "publication" | "application" | "priority"

/**
 * Converts a number between OPS formats.
 *
 * The `referenceType` segment is mandatory: without it OPS matches no route and answers
 * HTTP 405 ("No resource method found for GET"), which reads like a client bug rather than a
 * malformed path.
 */
export const epoNumberConvert = async (
  number: string,
  inputFormat: EpoNumberFormat,
  outputFormat: EpoNumberFormat,
  referenceType: EpoReferenceType = "publication",
): Promise<unknown> => {
  const num = inputFormat === "original" ? number : number.replace(/\s+/g, "").replace(/[/,]/g, "")
  return epoRequest(`number-service/${referenceType}/${inputFormat}/${num}/${outputFormat}`)
}
