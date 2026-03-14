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

const formatNumber = (number: string, format: EpoNumberFormat = "docdb"): string => {
  const cleaned = number.replace(/\s+/g, "").replace(/[/,]/g, "")
  switch (format) {
    case "docdb":
      return cleaned
    case "epodoc":
      return cleaned
    case "original":
      return number
    default:
      return cleaned
  }
}

export const epoSearchPatents = async (query: string, range?: string): Promise<unknown> => {
  const rangePart = range ? `&Range=${range}` : ""
  return epoRequest(`published-data/search?q=${encodeURIComponent(query)}${rangePart}`)
}

export const epoGetBiblio = async (number: string, format: EpoNumberFormat = "docdb"): Promise<unknown> => {
  const num = formatNumber(number, format)
  return epoRequest(`published-data/publication/${format}/${num}/biblio`)
}

export const epoGetAbstract = async (number: string, format: EpoNumberFormat = "docdb"): Promise<unknown> => {
  const num = formatNumber(number, format)
  return epoRequest(`published-data/publication/${format}/${num}/abstract`)
}

export const epoGetClaims = async (number: string, format: EpoNumberFormat = "docdb"): Promise<unknown> => {
  const num = formatNumber(number, format)
  return epoRequest(`published-data/publication/${format}/${num}/claims`)
}

export const epoGetDescription = async (number: string, format: EpoNumberFormat = "docdb"): Promise<unknown> => {
  const num = formatNumber(number, format)
  return epoRequest(`published-data/publication/${format}/${num}/description`)
}

export const epoFamilyLookup = async (number: string, format: EpoNumberFormat = "docdb"): Promise<unknown> => {
  const num = formatNumber(number, format)
  return epoRequest(`family/publication/${format}/${num}`)
}

export const epoLegalStatus = async (number: string, format: EpoNumberFormat = "docdb"): Promise<unknown> => {
  const num = formatNumber(number, format)
  return epoRequest(`published-data/publication/${format}/${num}/legal`)
}

export const epoNumberConvert = async (
  number: string,
  inputFormat: EpoNumberFormat,
  outputFormat: EpoNumberFormat,
): Promise<unknown> => {
  const num = formatNumber(number, inputFormat)
  return epoRequest(`number-service/${inputFormat}/${num}/${outputFormat}`)
}
