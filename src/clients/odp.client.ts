import { normalizePatentNumber } from "../lib/patent-number.js"
import { BaseClient } from "./base.client.js"

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

export class OdpClient {
  private readonly client: BaseClient

  constructor(config?: OdpConfig) {
    const cfg = config ?? getOdpConfig()
    this.client = new BaseClient({
      baseUrl: cfg.baseUrl ?? "https://api.uspto.gov/api/v1/",
      headers: {
        "x-api-key": cfg.apiKey,
      },
      timeout: cfg.timeout,
    })
  }

  // ── Application Methods ──────────────────────────────────────────────

  async searchApplications(query: string, limit?: number, offset?: number, sort?: string): Promise<unknown> {
    const params: Record<string, string> = { searchText: query }
    if (limit !== undefined) params.limit = String(limit)
    if (offset !== undefined) params.offset = String(offset)
    if (sort !== undefined) params.sort = sort
    return this.client.get("patent/applications", params)
  }

  async getApplication(appNum: string): Promise<unknown> {
    return this.client.get(`patent/applications/${normalizePatentNumber(appNum)}`)
  }

  async getApplicationMetadata(appNum: string): Promise<unknown> {
    return this.client.get(`patent/applications/${normalizePatentNumber(appNum)}/metadata`)
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
