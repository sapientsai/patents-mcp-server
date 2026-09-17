import { normalizePatentNumber } from "../lib/patent-number"
import { BaseClient } from "./base.client"

export type OdpConfig = {
  readonly apiKey: string
  readonly baseUrl?: string
  readonly timeout?: number
}

export const getOdpConfig = (): OdpConfig => {
  const apiKey = process.env.USPTO_API_KEY
  if (!apiKey) {
    throw new Error("USPTO_API_KEY environment variable is required for ODP client")
  }
  return {
    apiKey,
    baseUrl: process.env.USPTO_BASE_URL ?? "https://api.uspto.gov/api/v1/",
    timeout: process.env.USPTO_TIMEOUT ? parseInt(process.env.USPTO_TIMEOUT, 10) : 30000,
  }
}

/**
 * Field paths `searchApplications` projects when the caller names none: enough to identify,
 * date, classify and triage a hit, and to look up its full record afterwards. Grant-only paths
 * (`patentNumber`, `grantDate`) are simply absent on pending applications.
 */
export const DEFAULT_SEARCH_FIELDS = [
  "applicationNumberText",
  "applicationMetaData.inventionTitle",
  "applicationMetaData.filingDate",
  "applicationMetaData.effectiveFilingDate",
  "applicationMetaData.grantDate",
  "applicationMetaData.patentNumber",
  "applicationMetaData.applicationStatusCode",
  "applicationMetaData.applicationStatusDescriptionText",
  "applicationMetaData.applicationTypeLabelName",
  "applicationMetaData.firstApplicantName",
  "applicationMetaData.firstInventorName",
  "applicationMetaData.cpcClassificationBag",
  "applicationMetaData.groupArtUnitNumber",
  "applicationMetaData.examinerNameText",
  "applicationMetaData.publicationCategoryBag",
] as const

export type SearchApplicationsParams = {
  readonly query: string
  readonly limit?: number
  readonly offset?: number
  readonly sortField?: string
  readonly sortOrder?: "asc" | "desc"
  readonly fields?: readonly string[]
}

export class OdpClient {
  private readonly client: BaseClient

  constructor(config?: OdpConfig) {
    const cfg = config ?? getOdpConfig()
    this.client = new BaseClient({
      baseUrl: cfg.baseUrl ?? "https://api.uspto.gov/api/v1/",
      headers: {
        "X-API-KEY": cfg.apiKey,
      },
      timeout: cfg.timeout,
    })
  }

  // ── Application Methods ──────────────────────────────────────────────

  /**
   * Searches applications, projecting a bibliographic subset of each matched record.
   *
   * The projection is not a size optimisation. ODP inlines `recordAttorney` in full, which
   * carries the filing firm's entire customer-number roster — 145 practitioners with addresses
   * and phone numbers, ~172KB, on a single application — so an unprojected three-result search
   * returns ~225KB and overruns any sane tool-output budget. `odp-get-application` remains the
   * route to one application's complete record.
   *
   * `sort` must be an array of `{ field, order }`; ODP rejects a bare string with HTTP 400.
   */
  async searchApplications({
    query,
    limit,
    offset,
    sortField,
    sortOrder = "desc",
    fields = DEFAULT_SEARCH_FIELDS,
  }: SearchApplicationsParams): Promise<unknown> {
    const body: Record<string, unknown> = { q: query }
    if (limit !== undefined || offset !== undefined) {
      body.pagination = {
        ...(offset !== undefined ? { offset } : {}),
        ...(limit !== undefined ? { limit } : {}),
      }
    }
    if (sortField !== undefined) body.sort = [{ field: sortField, order: sortOrder }]
    // A hit without its application number cannot be followed up, so project it even when the
    // caller supplies their own field list.
    body.fields = fields.includes("applicationNumberText") ? [...fields] : ["applicationNumberText", ...fields]
    return this.client.post("patent/applications/search", body)
  }

  async getApplication(appNum: string): Promise<unknown> {
    return this.client.get(`patent/applications/${normalizePatentNumber(appNum)}`)
  }

  async getApplicationMetadata(appNum: string): Promise<unknown> {
    return this.client.get(`patent/applications/${normalizePatentNumber(appNum)}/meta-data`)
  }

  async getContinuity(appNum: string): Promise<unknown> {
    return this.client.get(`patent/applications/${normalizePatentNumber(appNum)}/continuity`)
  }

  async getAssignment(appNum: string): Promise<unknown> {
    return this.client.get(`patent/applications/${normalizePatentNumber(appNum)}/assignment`)
  }

  async getAdjustment(appNum: string): Promise<unknown> {
    return this.client.get(`patent/applications/${normalizePatentNumber(appNum)}/adjustment`)
  }

  async getAttorney(appNum: string): Promise<unknown> {
    return this.client.get(`patent/applications/${normalizePatentNumber(appNum)}/attorney`)
  }

  async getForeignPriority(appNum: string): Promise<unknown> {
    return this.client.get(`patent/applications/${normalizePatentNumber(appNum)}/foreign-priority`)
  }

  async getTransactions(appNum: string): Promise<unknown> {
    return this.client.get(`patent/applications/${normalizePatentNumber(appNum)}/transactions`)
  }

  async getDocuments(appNum: string): Promise<unknown> {
    return this.client.get(`patent/applications/${normalizePatentNumber(appNum)}/documents`)
  }

  async downloadDocument(
    appNum: string,
    documentIdentifier: string,
  ): Promise<{ data: Uint8Array; contentType: string }> {
    return this.client.getBinary(`download/applications/${normalizePatentNumber(appNum)}/${documentIdentifier}.pdf`)
  }

  // ── Dataset Methods ──────────────────────────────────────────────────

  async searchDatasets(query: string): Promise<unknown> {
    return this.client.get("datasets", { searchText: query })
  }

  async getDataset(productId: string): Promise<unknown> {
    return this.client.get(`datasets/${productId}`)
  }

  // ── PTAB Methods ─────────────────────────────────────────────────────

  async searchProceedings(query: string, type?: string, limit?: number): Promise<unknown> {
    const params: Record<string, string> = { searchText: query }
    if (type !== undefined) params.type = type
    if (limit !== undefined) params.limit = String(limit)
    return this.client.get("patent/trials", params)
  }

  async getProceeding(trialNumber: string): Promise<unknown> {
    return this.client.get(`patent/trials/${trialNumber}`)
  }

  async getProceedingDocuments(trialNumber: string): Promise<unknown> {
    return this.client.get(`patent/trials/${trialNumber}/documents`)
  }

  async searchDecisions(query: string, limit?: number): Promise<unknown> {
    const params: Record<string, string> = { searchText: query }
    if (limit !== undefined) params.limit = String(limit)
    return this.client.get("patent/trials/decisions", params)
  }

  async getDecision(decisionId: string): Promise<unknown> {
    return this.client.get(`patent/trials/decisions/${decisionId}`)
  }

  async searchAppeals(query: string, limit?: number): Promise<unknown> {
    const params: Record<string, string> = { searchText: query }
    if (limit !== undefined) params.limit = String(limit)
    return this.client.get("patent/appeals", params)
  }

  async getAppeal(appealId: string): Promise<unknown> {
    return this.client.get(`patent/appeals/${appealId}`)
  }

  // ── Citation / Litigation Methods ────────────────────────────────────

  async getEnrichedCitations(patentNumber: string): Promise<unknown> {
    return this.client.get(`patent/citations/${normalizePatentNumber(patentNumber)}`)
  }

  async searchCitations(query: string, limit?: number): Promise<unknown> {
    const params: Record<string, string> = { searchText: query }
    if (limit !== undefined) params.limit = String(limit)
    return this.client.get("patent/citations", params)
  }

  async getCitationMetrics(patentNumber: string): Promise<unknown> {
    return this.client.get(`patent/citations/${normalizePatentNumber(patentNumber)}/metrics`)
  }

  async searchLitigation(params: {
    query?: string
    plaintiff?: string
    defendant?: string
    patent_number?: string
    court?: string
    date_from?: string
    date_to?: string
    limit?: number
  }): Promise<unknown> {
    const searchParams: Record<string, string> = {}
    if (params.query !== undefined) searchParams.searchText = params.query
    if (params.plaintiff !== undefined) searchParams.plaintiff = params.plaintiff
    if (params.defendant !== undefined) searchParams.defendant = params.defendant
    if (params.patent_number !== undefined) searchParams.patentNumber = normalizePatentNumber(params.patent_number)
    if (params.court !== undefined) searchParams.court = params.court
    if (params.date_from !== undefined) searchParams.dateFrom = params.date_from
    if (params.date_to !== undefined) searchParams.dateTo = params.date_to
    if (params.limit !== undefined) searchParams.limit = String(params.limit)
    return this.client.get("patent/litigation", searchParams)
  }

  async getLitigationCase(caseId: string): Promise<unknown> {
    return this.client.get(`patent/litigation/${caseId}`)
  }

  async getLitigationByPatent(patentNumber: string): Promise<unknown> {
    return this.client.get(`patent/litigation/patent/${normalizePatentNumber(patentNumber)}`)
  }

  // ── Office Action Methods ───────────────────────────────────────────

  async getOfficeActionText(applicationNumber: string): Promise<unknown> {
    return this.client.get(`patent/office-actions/${normalizePatentNumber(applicationNumber)}/text`)
  }

  async searchOfficeActions(query: string, limit?: number): Promise<unknown> {
    const params: Record<string, string> = { searchText: query }
    if (limit !== undefined) params.limit = String(limit)
    return this.client.get("patent/office-actions", params)
  }

  async getOfficeActionCitations(applicationNumber: string): Promise<unknown> {
    return this.client.get(`patent/office-actions/${normalizePatentNumber(applicationNumber)}/citations`)
  }

  async getOfficeActionRejections(applicationNumber: string): Promise<unknown> {
    return this.client.get(`patent/office-actions/${normalizePatentNumber(applicationNumber)}/rejections`)
  }
}
