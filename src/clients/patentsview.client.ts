import { BaseClient } from "./base.client.js"

export type PatentsViewClientOptions = {
  readonly baseUrl?: string
  readonly apiKey?: string
  readonly timeout?: number
}

type PatentsViewQuery = {
  readonly q?: Record<string, unknown>
  readonly f?: ReadonlyArray<string>
  readonly s?: ReadonlyArray<Record<string, string>>
  readonly o?: Record<string, unknown>
}

const DEFAULT_PATENT_FIELDS = [
  "patent_id",
  "patent_title",
  "patent_abstract",
  "patent_date",
  "patent_type",
  "patent_kind",
  "patent_num_claims",
  "assignees",
  "inventors",
] as const

const CLAIMS_FIELDS = ["patent_id", "patent_title", "claims"] as const

const DESCRIPTION_FIELDS = ["patent_id", "patent_title", "brf_sum_text", "detail_desc_text", "draw_desc_text"] as const

const DEFAULT_ASSIGNEE_FIELDS = [
  "assignee_id",
  "assignee_organization",
  "assignee_first_name",
  "assignee_last_name",
  "assignee_type",
  "assignee_total_num_patents",
] as const

const DEFAULT_INVENTOR_FIELDS = [
  "inventor_id",
  "inventor_first_name",
  "inventor_last_name",
  "inventor_total_num_patents",
] as const

const DEFAULT_ATTORNEY_FIELDS = [
  "lawyer_id",
  "lawyer_first_name",
  "lawyer_last_name",
  "lawyer_organization",
  "lawyer_total_num_patents",
] as const

export class PatentsViewClient {
  private readonly client: BaseClient

  constructor(options?: PatentsViewClientOptions) {
    const baseUrl = options?.baseUrl ?? "https://search.patentsview.org/api/v1/"
    const headers: Record<string, string> = {}
    if (options?.apiKey) {
      headers["X-Api-Key"] = options.apiKey
    }

    this.client = new BaseClient({
      baseUrl,
      headers,
      timeout: options?.timeout,
    })
  }

  async searchPatents(
    query: string,
    searchType: "text" | "assignee" | "inventor" = "text",
    limit = 25,
    offset = 0,
  ): Promise<unknown> {
    const q = this.buildPatentQuery(query, searchType)
    const body: PatentsViewQuery = {
      q,
      f: [...DEFAULT_PATENT_FIELDS],
      o: { size: limit, offset },
    }
    return this.client.post<unknown>("patents/", body)
  }

  async getPatent(patentId: string): Promise<unknown> {
    return this.client.get<unknown>(`patents/${patentId}/`)
  }

  async searchAssignees(name: string, limit = 25): Promise<unknown> {
    const params: Record<string, string> = {
      q: JSON.stringify({ _text_any: { assignee_organization: name } }),
      f: JSON.stringify([...DEFAULT_ASSIGNEE_FIELDS]),
      o: JSON.stringify({ size: limit }),
    }
    return this.client.get<unknown>("assignees/", params)
  }

  async getAssignee(id: string): Promise<unknown> {
    return this.client.get<unknown>(`assignees/${id}/`)
  }

  async searchInventors(name: string, limit = 25): Promise<unknown> {
    const params: Record<string, string> = {
      q: JSON.stringify({
        _or: [{ _text_any: { inventor_first_name: name } }, { _text_any: { inventor_last_name: name } }],
      }),
      f: JSON.stringify([...DEFAULT_INVENTOR_FIELDS]),
      o: JSON.stringify({ size: limit }),
    }
    return this.client.get<unknown>("inventors/", params)
  }

  async getInventor(id: string): Promise<unknown> {
    return this.client.get<unknown>(`inventors/${id}/`)
  }

  async searchAttorneys(name: string, limit = 25): Promise<unknown> {
    const params: Record<string, string> = {
      q: JSON.stringify({
        _or: [{ _text_any: { lawyer_organization: name } }, { _text_any: { lawyer_last_name: name } }],
      }),
      f: JSON.stringify([...DEFAULT_ATTORNEY_FIELDS]),
      o: JSON.stringify({ size: limit }),
    }
    return this.client.get<unknown>("attorneys/", params)
  }

  async getAttorney(id: string): Promise<unknown> {
    return this.client.get<unknown>(`attorneys/${id}/`)
  }

  async getClaims(patentId: string): Promise<unknown> {
    const params: Record<string, string> = {
      f: JSON.stringify([...CLAIMS_FIELDS]),
    }
    return this.client.get<unknown>(`patents/${patentId}/`, params)
  }

  async getDescription(patentId: string): Promise<unknown> {
    const params: Record<string, string> = {
      f: JSON.stringify([...DESCRIPTION_FIELDS]),
    }
    return this.client.get<unknown>(`patents/${patentId}/`, params)
  }

  async searchByCpc(cpcCode: string, limit = 25): Promise<unknown> {
    const body: PatentsViewQuery = {
      q: { _eq: { cpc_subgroup_id: cpcCode } },
      f: [...DEFAULT_PATENT_FIELDS],
      o: { size: limit },
    }
    return this.client.post<unknown>("patents/", body)
  }

  async lookupCpc(cpcCode: string): Promise<unknown> {
    const params: Record<string, string> = {
      q: JSON.stringify({ _eq: { cpc_subgroup_id: cpcCode } }),
    }
    return this.client.get<unknown>("cpc_subgroups/", params)
  }

  async searchByIpc(ipcCode: string, limit = 25): Promise<unknown> {
    const body: PatentsViewQuery = {
      q: { _eq: { ipc_class: ipcCode } },
      f: [...DEFAULT_PATENT_FIELDS],
      o: { size: limit },
    }
    return this.client.post<unknown>("patents/", body)
  }

  async lookupIpc(ipcCode: string): Promise<unknown> {
    const params: Record<string, string> = {
      q: JSON.stringify({ _eq: { ipc_class: ipcCode } }),
    }
    return this.client.get<unknown>("ipc/", params)
  }

  private buildPatentQuery(query: string, searchType: "text" | "assignee" | "inventor"): Record<string, unknown> {
    switch (searchType) {
      case "text":
        return { _text_any: { patent_abstract: query } }
      case "assignee":
        return { _text_any: { assignee_organization: query } }
      case "inventor":
        return {
          _or: [{ _text_any: { inventor_first_name: query } }, { _text_any: { inventor_last_name: query } }],
        }
    }
  }
}
