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
    // check-api-status probes this endpoint, so an unbounded wait here stalls the whole status
    // report. Matches the ODP probe's timeout in utility.tools.ts.
    signal: AbortSignal.timeout(config.requestTimeout),
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

/** Canonical docdb form: a dotted triple, `EP.1000000.A1`. */
const DOCDB_DOTTED = /^[A-Z]{2}\.[^.]+\.[^.]+$/i
/** docdb also accepts the undotted run-together form carrying a kind code, `US7650331B1`. */
const DOCDB_KIND_SUFFIXED = /^[A-Z]{2}\d+[A-Z]\d?$/i

/**
 * Infers which OPS number format a string is written in.
 *
 * The two segments have opposite tolerances, so the kind code decides:
 *   - `epodoc` rejects a trailing kind code — `epodoc/US7650331B1` is a 404.
 *   - `docdb` accepts a kind code dotted or not, but cannot resolve a number without one for
 *     single-document constituents: `docdb/EP1000000/claims` is a 413 ("ambiguous", since
 *     EP1000000 matches both A1 and B1), while `epodoc/EP1000000/claims` is a 200.
 *
 * So: a number carrying a kind code is docdb, and a bare one is epodoc. The number itself is
 * passed through as written — OPS needs no reshaping, and inventing one would only add a parse
 * that can be wrong.
 */
export const detectNumberFormat = (number: string): EpoNumberFormat => {
  const cleaned = number.replace(/\s+/g, "").replace(/[/,]/g, "")
  return DOCDB_DOTTED.test(cleaned) || DOCDB_KIND_SUFFIXED.test(cleaned) ? "docdb" : "epodoc"
}

/**
 * Pairs a number with the format segment that matches it.
 *
 * `format` is an override for callers who know better; left undefined, the shape decides. The
 * default used to be a hard-coded "docdb", which silently 413s on `/claims` and `/description`
 * for the bare numbers those tools document.
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

export type EpoSearchHit = {
  publicationNumber: string
  kind?: string
  title?: string
  applicants: string[]
  publicationDate?: string
  familyId?: string
}

export type EpoSearchResults = {
  total: number
  returned: number
  hits: EpoSearchHit[]
}

/** OPS XML parses to loosely-shaped nodes; these narrow it without reaching for `any`. */
type Node = Readonly<Record<string, unknown>>

const asNode = (value: unknown): Node | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Node) : undefined

/** fast-xml-parser collapses single-element lists to the element itself. */
const asNodes = (value: unknown): Node[] => {
  if (Array.isArray(value)) {
    const nodes: Node[] = []
    for (const entry of value) {
      const node = asNode(entry)
      if (node !== undefined) nodes.push(node)
    }
    return nodes
  }
  const single = asNode(value)
  return single === undefined ? [] : [single]
}

/** Doc numbers and dates arrive as either strings or numbers depending on the field. */
const asText = (value: unknown): string | undefined =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined

const at = (node: Node | undefined, key: string): unknown => node?.[key]

/**
 * Applicants in their epodoc rendering. OPS lists every party twice — once epodoc, once in the
 * original script — and the duplicate doubles the list without adding information.
 */
const extractApplicants = (bibliographicData: Node | undefined): string[] =>
  asNodes(at(asNode(at(asNode(at(bibliographicData, "parties")), "applicants")), "applicant"))
    .filter((a) => a["@_data-format"] !== "original")
    .map((a) => asText(at(asNode(at(a, "applicant-name")), "name")))
    .filter((n): n is string => n !== undefined)

/** Prefers the English title; OPS returns one entry per language, in no guaranteed order. */
const pickTitle = (titles: unknown): string | undefined => {
  const list = asNodes(titles)
  const chosen = list.find((t) => t["@_lang"] === "en") ?? list[0]
  return asText(at(chosen, "#text"))
}

/**
 * Reduces an OPS biblio-search response to one line per hit.
 *
 * `search/biblio` embeds each hit's complete bibliographic record — classifications, priority
 * claims, every title translation — which runs ~15KB per hit, so five results cost 74KB. The
 * fields kept here are the ones that let a caller triage a hit list and decide what to fetch
 * in full; `epo-get-biblio` remains the route to one publication's complete record.
 *
 * Exported for testing.
 */
export const projectSearchResults = (parsed: unknown): EpoSearchResults => {
  const search = asNode(at(asNode(at(asNode(parsed), "world-patent-data")), "biblio-search"))
  const total = Number(asText(at(search, "@_total-result-count")) ?? 0)
  const documents = asNodes(at(asNode(at(search, "search-result")), "exchange-documents"))

  const hits: EpoSearchHit[] = documents.flatMap((wrapper) =>
    asNodes(at(wrapper, "exchange-document")).map((doc) => {
      const bib = asNode(at(doc, "bibliographic-data"))
      const ids = asNodes(at(asNode(at(bib, "publication-reference")), "document-id"))
      const byType = (type: string) => ids.find((d) => d["@_document-id-type"] === type)
      const epodoc = byType("epodoc")
      const docdb = byType("docdb")

      const publicationNumber =
        asText(at(epodoc, "doc-number")) ??
        (docdb ? `${asText(at(docdb, "country")) ?? ""}${asText(at(docdb, "doc-number")) ?? ""}` : undefined) ??
        `${asText(at(doc, "@_country")) ?? ""}${asText(at(doc, "@_doc-number")) ?? ""}`

      const applicants = extractApplicants(bib)

      return {
        publicationNumber,
        kind: asText(at(doc, "@_kind")),
        title: pickTitle(at(bib, "invention-title")),
        applicants,
        publicationDate: asText(at(epodoc, "date")) ?? asText(at(docdb, "date")),
        familyId: asText(at(doc, "@_family-id")),
      }
    }),
  )

  return { total, returned: hits.length, hits }
}

/**
 * Searches OPS and returns a triage-sized hit list.
 *
 * Uses the `biblio` constituent rather than bare `search`: the bare endpoint returns publication
 * numbers and family ids only, so identifying a hit list meant one follow-up call per hit.
 */
export const epoSearchPatents = async (query: string, range?: string): Promise<EpoSearchResults> => {
  const rangePart = range ? `&Range=${range}` : ""
  const parsed = await epoRequest(`published-data/search/biblio?q=${encodeURIComponent(query)}${rangePart}`)
  return projectSearchResults(parsed)
}

export type EpoPublication = {
  publicationNumber: string
  country?: string
  kind?: string
  publicationDate?: string
  title?: string
  abstract?: string
  applicants: string[]
  inventors: string[]
  ipcClasses: string[]
  applicationNumber?: string
  familyId?: string
}

export type EpoBiblio = {
  /** One entry per publication of this number — a number granted in Europe yields A1 and B1. */
  publications: EpoPublication[]
}

/** Inventors in their epodoc rendering, for the same reason as applicants. */
const extractInventors = (bibliographicData: Node | undefined): string[] =>
  asNodes(at(asNode(at(asNode(at(bibliographicData, "parties")), "inventors")), "inventor"))
    .filter((i) => i["@_data-format"] !== "original")
    .map((i) => asText(at(asNode(at(i, "inventor-name")), "name")))
    .filter((n): n is string => n !== undefined)

/** Abstract text, preferring English; OPS may return one per language. */
const pickAbstract = (abstract: unknown): string | undefined => {
  const list = asNodes(abstract)
  const chosen = list.find((a) => a["@_lang"] === "en") ?? list[0]
  const paragraphs = asNodes(at(chosen, "p"))
  const text = paragraphs.map((p) => asText(at(p, "#text"))).filter((t): t is string => t !== undefined)
  if (text.length > 0) return text.join(" ")
  return asText(at(chosen, "p")) ?? asText(at(chosen, "#text"))
}

/**
 * Flattens an OPS biblio response to one entry per publication.
 *
 * Exported for testing.
 */
export const projectBiblio = (parsed: unknown): EpoBiblio => {
  const documents = asNodes(
    at(asNode(at(asNode(at(asNode(parsed), "world-patent-data")), "exchange-documents")), "exchange-document"),
  )

  const publications: EpoPublication[] = documents.map((doc) => {
    const bib = asNode(at(doc, "bibliographic-data"))
    const ids = asNodes(at(asNode(at(bib, "publication-reference")), "document-id"))
    const byType = (type: string) => ids.find((d) => d["@_document-id-type"] === type)
    const epodoc = byType("epodoc")
    const docdb = byType("docdb")
    const appIds = asNodes(at(asNode(at(bib, "application-reference")), "document-id"))

    return {
      publicationNumber:
        asText(at(epodoc, "doc-number")) ??
        `${asText(at(docdb, "country")) ?? ""}${asText(at(docdb, "doc-number")) ?? ""}`,
      country: asText(at(docdb, "country")) ?? asText(at(doc, "@_country")),
      kind: asText(at(docdb, "kind")) ?? asText(at(doc, "@_kind")),
      publicationDate: normalizeDate(at(epodoc, "date") ?? at(docdb, "date")),
      title: pickTitle(at(bib, "invention-title")),
      abstract: pickAbstract(at(doc, "abstract")),
      applicants: extractApplicants(bib),
      inventors: extractInventors(bib),
      ipcClasses: asNodes(at(asNode(at(bib, "classifications-ipcr")), "classification-ipcr"))
        .map((c) => asText(at(c, "text"))?.replace(/\s+/g, " ").trim())
        .filter((c): c is string => c !== undefined),
      applicationNumber: asText(
        at(appIds.find((d) => d["@_document-id-type"] === "epodoc") ?? appIds[0], "doc-number"),
      ),
      familyId: asText(at(doc, "@_family-id")),
    }
  })

  return { publications }
}

/**
 * Bibliographic data for a publication number.
 *
 * Returns every publication of that number rather than picking one: EP1000000 is both the A1
 * application and the B1 grant, and which one a caller means is their business here.
 */
export const epoGetBiblio = async (number: string, format?: EpoNumberFormat): Promise<EpoBiblio> => {
  const { format: fmt, num } = resolveRef(number, format)
  return projectBiblio(await epoRequest(`published-data/publication/${fmt}/${num}/biblio`))
}

export const epoGetAbstract = async (number: string, format?: EpoNumberFormat): Promise<unknown> => {
  const { format: fmt, num } = resolveRef(number, format)
  return epoRequest(`published-data/publication/${fmt}/${num}/abstract`)
}

/** OPS kind codes: A* is the application as published, B* is the granted patent. */
const GRANTED_KIND = /^B/

export type EpoTextResult = {
  /** The publication actually served, e.g. `EP.1000000.B1`. */
  publication: string
  kind?: string
  /** Every kind OPS publishes under this number, when it was consulted. */
  availableKinds: string[]
  granted: boolean
  note?: string
  document: unknown
}

/** The kind a constituent response says it came from. */
const servedKind = (document: unknown): string | undefined => {
  const fulltext = asNodes(
    at(asNode(at(asNode(at(asNode(document), "world-patent-data")), "fulltext-documents")), "fulltext-document"),
  )
  for (const doc of fulltext) {
    const ref = asNode(at(asNode(at(doc, "bibliographic-data")), "publication-reference"))
    const kind = asNodes(at(ref, "document-id"))
      .map((id) => asText(at(id, "kind")))
      .find((k) => k !== undefined)
    if (kind !== undefined) return kind
  }
  return undefined
}

/** `EP1000000` + `B1` -> `EP.1000000.B1`. */
const toDocdb = (epodocNumber: string, kind: string): string | undefined => {
  const match = /^([A-Z]{2})(.+)$/i.exec(epodocNumber)
  return match ? `${match[1]}.${match[2]}.${kind}` : undefined
}

/**
 * Fetches claims or description, preferring the granted text.
 *
 * A bare number is ambiguous — `EP1000000` is published as both A1 and B1 — and OPS resolves
 * that silently in favour of the A publication. For EP1000000 that is 11 claims as filed rather
 * than the 33 as granted, and the granted claims are the enforceable ones, so serving the
 * application text unannounced is a freedom-to-operate hazard.
 *
 * When the caller names a kind, that is honoured exactly. When they do not, the available kinds
 * are looked up and the granted publication is preferred. Either way the result says which
 * publication it came from, so the choice is never invisible.
 */
const fetchText = async (
  number: string,
  format: EpoNumberFormat | undefined,
  constituent: "claims" | "description",
): Promise<EpoTextResult> => {
  const { format: fmt, num } = resolveRef(number, format)

  const serve = async (path: string, publication: string, availableKinds: string[], note?: string) => {
    const document = await epoRequest(`published-data/publication/${path}/${constituent}`).catch((error: unknown) => {
      // OPS carries full text for EP and WO only. Its own answer is a 404 naming an "unsupported
      // country code", which reads as a malformed request rather than a coverage boundary.
      if (error instanceof Error && error.message.includes("InvalidCountryCode")) {
        throw new Error(
          `EPO OPS serves ${constituent} text for EP and WO publications only, and ${publication} ` +
            `is outside that. For a US application use odp-get-documents plus odp-download-document; ` +
            `epo-get-biblio still works here for titles, applicants and classifications.`,
        )
      }
      throw error
    })
    const kind = servedKind(document)
    return {
      publication,
      kind,
      availableKinds,
      granted: kind !== undefined && GRANTED_KIND.test(kind),
      note,
      document,
    }
  }

  // The caller pinned a kind (docdb) or an original-format number: take them at their word.
  if (fmt !== "epodoc") return serve(`${fmt}/${num}`, num, [])

  const kinds = (await epoGetBiblio(num, "epodoc")).publications
    .map((publication) => publication.kind)
    .filter((kind): kind is string => kind !== undefined)
  const granted = kinds
    .filter((k) => GRANTED_KIND.test(k))
    .sort()
    .pop()
  const docdb = granted === undefined ? undefined : toDocdb(num, granted)

  if (granted === undefined || docdb === undefined) {
    return serve(
      `epodoc/${num}`,
      num,
      kinds,
      kinds.length > 0 ? `No granted publication found; served the application text.` : undefined,
    )
  }
  return serve(`docdb/${docdb}`, docdb, kinds, `Resolved to the granted publication ${granted}.`)
}

export const epoGetClaims = async (number: string, format?: EpoNumberFormat): Promise<EpoTextResult> =>
  fetchText(number, format, "claims")

export const epoGetDescription = async (number: string, format?: EpoNumberFormat): Promise<EpoTextResult> =>
  fetchText(number, format, "description")

export type EpoFamilyMember = {
  country?: string
  publicationNumber: string
  kind?: string
  publicationDate?: string
  title?: string
  applicants: string[]
  familyId?: string
}

export type EpoFamily = {
  total: number
  /** Distinct country codes across the family — the coverage map an FTO question asks for. */
  jurisdictions: string[]
  /** OPS reports whether the response carries legal events. This constituent never does. */
  carriesLegalStatus: boolean
  note: string
  members: EpoFamilyMember[]
}

/**
 * Reduces an INPADOC family response to one line per member.
 *
 * Exported for testing.
 */
export const projectFamily = (parsed: unknown): EpoFamily => {
  const family = asNode(at(asNode(at(asNode(parsed), "world-patent-data")), "patent-family"))
  const total = Number(asText(at(family, "@_total-result-count")) ?? 0)
  const carriesLegalStatus = asText(at(family, "@_legal")) === "true"

  const members: EpoFamilyMember[] = asNodes(at(family, "family-member")).map((member) => {
    const ids = asNodes(at(asNode(at(member, "publication-reference")), "document-id"))
    const byType = (type: string) => ids.find((d) => d["@_document-id-type"] === type)
    const docdb = byType("docdb")
    const epodoc = byType("epodoc")
    const exchange = asNodes(at(member, "exchange-document"))[0]
    const bib = asNode(at(exchange, "bibliographic-data"))

    return {
      country: asText(at(docdb, "country")),
      publicationNumber:
        asText(at(epodoc, "doc-number")) ??
        `${asText(at(docdb, "country")) ?? ""}${asText(at(docdb, "doc-number")) ?? ""}`,
      kind: asText(at(docdb, "kind")),
      publicationDate: asText(at(docdb, "date")) ?? asText(at(epodoc, "date")),
      title: pickTitle(at(bib, "invention-title")),
      applicants: extractApplicants(bib),
      familyId: asText(at(member, "@_family-id")),
    }
  })

  const jurisdictions = [...new Set(members.map((m) => m.country).filter((c): c is string => c !== undefined))].sort()

  return {
    total,
    jurisdictions,
    carriesLegalStatus,
    note: "Family membership only — this says where protection was SOUGHT, not where it is in force. Call epo-legal-status for grant, lapse and opposition events per member.",
    members,
  }
}

/**
 * Looks up the INPADOC family, as a coverage map.
 *
 * Uses the `biblio` constituent rather than the bare family endpoint: without it each member is
 * a publication number and nothing else, so reading a family meant one call per member. The
 * result is projected, since the raw constituent runs ~66KB.
 *
 * It carries no legal events — OPS says so itself via `@_legal="false"` — and a member list
 * reads far too easily as a coverage map of what is still in force. Both the flag and the note
 * are surfaced so that inference is not left to the caller.
 */
export const epoFamilyLookup = async (number: string, format?: EpoNumberFormat): Promise<EpoFamily> => {
  const { format: fmt, num } = resolveRef(number, format)
  return projectFamily(await epoRequest(`family/publication/${fmt}/${num}/biblio`))
}

export type EpoLegalEvent = {
  code: string
  description?: string
  /** The jurisdiction the event applies to — a single EP lapse fans out across member states. */
  country?: string
  /** Free-format detail, e.g. why a lapse occurred. */
  detail?: string
  /** When the event took effect. */
  effectiveDate?: string
  /** When it was published in the gazette. */
  gazetteDate?: string
  /** OPS marks each event `+` or `-` for whether it favours the patent. Passed through as given. */
  influence?: string
}

export type EpoLegalStatusMember = {
  country?: string
  publicationNumber: string
  kind?: string
  events: EpoLegalEvent[]
  /**
   * Set when this publication carries no events of its own but a sibling of the same number
   * does — the granted B1 is typically empty while the whole EP history hangs off the A1.
   */
  eventsRecordedOn?: string
  note?: string
}

export type EpoLegalStatus = {
  total: number
  eventCount: number
  jurisdictions: string[]
  members: EpoLegalStatusMember[]
}

/** OPS mixes `2002-06-05` and `20020423` across date fields; normalise both to ISO. */
const normalizeDate = (value: unknown): string | undefined => {
  const text = asText(value)
  if (text === undefined) return undefined
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(text)
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined
}

/** Field values arrive as `{ "#text": ..., "@_desc": ... }` wrappers. */
const fieldText = (node: Node | undefined, key: string): unknown => at(asNode(at(node, key)), "#text")

/**
 * Reduces an INPADOC legal-status response to dated events per family member.
 *
 * Two traps this removes. The raw response runs ~74KB for six members, and every event carries
 * `@_dateMigr="00010101"` — a placeholder, not a date, while the real values sit one level down
 * in `L007EP` (gazette) and `L500EP/L525EP` (effective). Reading the obvious top-level field
 * yields year 1 for every event.
 *
 * Exported for testing.
 */
export const projectLegalStatus = (parsed: unknown): EpoLegalStatus => {
  const family = asNode(at(asNode(at(asNode(parsed), "world-patent-data")), "patent-family"))
  const total = Number(asText(at(family, "@_total-result-count")) ?? 0)

  const members: EpoLegalStatusMember[] = asNodes(at(family, "family-member")).map((member) => {
    const ids = asNodes(at(asNode(at(member, "publication-reference")), "document-id"))
    const docdb = ids.find((d) => d["@_document-id-type"] === "docdb")
    const epodoc = ids.find((d) => d["@_document-id-type"] === "epodoc")

    const events: EpoLegalEvent[] = asNodes(at(member, "legal")).map((event) => {
      const detailBlock = asNode(at(event, "L500EP"))
      return {
        code: asText(at(event, "@_code")) ?? "",
        description: asText(at(event, "@_desc")),
        // L501EP ("Ref Country Code") is the state the event applies to; L001EP is the office
        // that published it. For a PG25 lapse those differ on every record — the office reads
        // "EP" while the patent actually lapsed in CH, DE, FR and sixteen others, so taking
        // L001EP would collapse nineteen distinct national lapses into one meaningless "EP".
        country: asText(fieldText(detailBlock, "L501EP")) ?? asText(fieldText(event, "L001EP")),
        detail: asText(fieldText(detailBlock, "L510EP")),
        effectiveDate: normalizeDate(fieldText(detailBlock, "L525EP")),
        gazetteDate: normalizeDate(fieldText(event, "L007EP")),
        influence: asText(at(event, "@_infl")),
      }
    })

    return {
      country: asText(at(docdb, "country")),
      publicationNumber:
        asText(at(epodoc, "doc-number")) ??
        `${asText(at(docdb, "country")) ?? ""}${asText(at(docdb, "doc-number")) ?? ""}`,
      kind: asText(at(docdb, "kind")),
      events,
    }
  })

  // Event-level countries matter more than member-level ones here: a single EP event lapses
  // across many contracting states, and those states appear nowhere in the member list.
  const jurisdictions = [
    ...new Set(members.flatMap((m) => [m.country, ...m.events.map((e) => e.country)]).filter((c): c is string => !!c)),
  ].sort()

  // OPS hangs the whole EP prosecution history off the A1 and leaves the granted B1 empty: for
  // EP1000000 that is 50 events against 0. Read on its own, a B1 with no events says "nothing
  // adverse recorded" when it means "recorded elsewhere" — and the B1 is the publication a
  // freedom-to-operate question is actually about. Point at the sibling rather than copying its
  // events onto a record OPS never attached them to.
  for (const member of members) {
    if (member.events.length > 0) continue
    const sibling = members.find(
      (s) => s !== member && s.publicationNumber === member.publicationNumber && s.events.length > 0,
    )
    if (sibling === undefined) continue
    const siblingId = `${sibling.publicationNumber}${sibling.kind ?? ""}`
    member.eventsRecordedOn = siblingId
    member.note =
      `No legal events are recorded against this publication. OPS attaches the history for this ` +
      `number to ${siblingId} — read that record's events, which govern this publication too.`
  }

  return {
    total,
    eventCount: members.reduce((n, m) => n + m.events.length, 0),
    jurisdictions,
    members,
  }
}

/**
 * Worldwide legal status, as dated events per family member.
 *
 * Uses the family `legal` constituent — `published-data/.../legal` is not a supported
 * constituent and OPS answers it with HTTP 200 and the biblio payload instead.
 */
export const epoLegalStatus = async (number: string, format?: EpoNumberFormat): Promise<EpoLegalStatus> => {
  const { format: fmt, num } = resolveRef(number, format)
  return projectLegalStatus(await epoRequest(`family/publication/${fmt}/${num}/legal`))
}

/** What an OPS number refers to. The number service requires this segment in the path. */
export type EpoReferenceType = "publication" | "application" | "priority"

export type EpoNumberConversion = {
  status?: string
  input: { format: EpoNumberFormat; number: string }
  output: {
    format: EpoNumberFormat
    number: string
    country?: string
    docNumber?: string
    kind?: string
    date?: string
  }
  note?: string
}

/** Renders a document-id node as the number a caller would write in that format. */
const renderNumber = (id: Node | undefined, format: EpoNumberFormat): string => {
  const docNumber = asText(at(id, "doc-number")) ?? ""
  const country = asText(at(id, "country")) ?? ""
  const kind = asText(at(id, "kind")) ?? ""
  if (format !== "docdb") return docNumber || `${country}${docNumber}`
  return [country, docNumber, kind].filter(Boolean).join(".")
}

/**
 * Flattens an OPS number-service response.
 *
 * Exported for testing.
 */
export const projectNumberConversion = (
  parsed: unknown,
  inputFormat: EpoNumberFormat,
  outputFormat: EpoNumberFormat,
  requested: string,
): EpoNumberConversion => {
  const root = asNode(at(asNode(parsed), "world-patent-data"))
  const status = asText(at(asNode(at(root, "meta")), "@_value"))
  const standardization = asNode(at(root, "standardization"))
  const outputId = asNodes(
    at(asNode(at(asNode(at(standardization, "output")), "publication-reference")), "document-id"),
  )[0]

  const kind = asText(at(outputId, "kind"))
  // OPS resolves a kind-less input to the earliest publication, so `EP1000000` converts to the
  // A1 — while epo-get-claims and epo-get-description deliberately prefer the granted B1. Two
  // tools in one toolset disagreeing about which document a bare number means is how someone
  // ends up comparing the wrong texts, so say which was chosen rather than leaving it implicit.
  const note =
    kind === undefined
      ? undefined
      : `OPS resolved this to the ${kind} publication. A number without a kind code may publish ` +
        `under several; epo-get-biblio lists them, and epo-get-claims and epo-get-description ` +
        `prefer the granted publication rather than this one.`

  return {
    status,
    input: { format: inputFormat, number: requested },
    output: {
      format: outputFormat,
      number: renderNumber(outputId, outputFormat),
      country: asText(at(outputId, "country")),
      docNumber: asText(at(outputId, "doc-number")),
      kind,
      date: normalizeDate(at(outputId, "date")),
    },
    note,
  }
}

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
): Promise<EpoNumberConversion> => {
  const num = inputFormat === "original" ? number : number.replace(/\s+/g, "").replace(/[/,]/g, "")
  const parsed = await epoRequest(`number-service/${referenceType}/${inputFormat}/${num}/${outputFormat}`)
  return projectNumberConversion(parsed, inputFormat, outputFormat, num)
}
