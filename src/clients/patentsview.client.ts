import type { z, ZodType } from "zod"

import {
  zAssigneeSuccessResponse,
  zAttorneySuccessResponse,
  zCpcSubclassSuccessResponse,
  zGClaimSuccessResponse,
  zInventorSuccessResponse,
  zIpcClassificationSuccessResponse,
  zPatentSuccessResponse,
} from "../generated/patentsview/zod.gen"
import { BaseClient } from "./base.client"

const looseParse = <T extends ZodType>(schema: T, data: unknown): z.infer<T> => {
  const result = schema.safeParse(data)
  return result.success ? result.data : (data as z.infer<T>)
}

export type PatentsViewClientOptions = {
  readonly baseUrl?: string
  readonly apiKey?: string
  readonly timeout?: number
}

export type PatentResponse = z.infer<typeof zPatentSuccessResponse>
export type AssigneeResponse = z.infer<typeof zAssigneeSuccessResponse>
export type InventorResponse = z.infer<typeof zInventorSuccessResponse>
export type AttorneyResponse = z.infer<typeof zAttorneySuccessResponse>
export type ClaimResponse = z.infer<typeof zGClaimSuccessResponse>
export type CpcSubclassResponse = z.infer<typeof zCpcSubclassSuccessResponse>
export type IpcResponse = z.infer<typeof zIpcClassificationSuccessResponse>

const DEFAULT_PATENT_FIELDS = [
  "patent_id",
  "patent_title",
  "patent_abstract",
  "patent_date",
  "patent_type",
  "assignees",
  "inventors",
] as const

const buildParams = (
  q: Record<string, unknown>,
  f?: ReadonlyArray<string>,
  o?: Record<string, unknown>,
): Record<string, string> => {
  const params: Record<string, string> = { q: JSON.stringify(q) }
  if (f) params.f = JSON.stringify(f)
  if (o) params.o = JSON.stringify(o)
  return params
}

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
    matchType: "all" | "any" | "phrase" = "all",
    limit = 25,
  ): Promise<PatentResponse> {
    const q = this.buildPatentQuery(query, searchType, matchType)
    const params = buildParams(q, [...DEFAULT_PATENT_FIELDS], { size: limit })
    const raw = await this.client.get<unknown>("patent/", params)
    return looseParse(zPatentSuccessResponse, raw)
  }

  async getPatent(patentId: string): Promise<PatentResponse> {
    const raw = await this.client.get<unknown>(`patent/${patentId}/`)
    return looseParse(zPatentSuccessResponse, raw)
  }

  async searchAssignees(name: string, limit = 25): Promise<AssigneeResponse> {
    const params = buildParams({ _text_any: { assignee_organization: name } }, undefined, { size: limit })
    const raw = await this.client.get<unknown>("assignee/", params)
    return looseParse(zAssigneeSuccessResponse, raw)
  }

  async getAssignee(id: string): Promise<AssigneeResponse> {
    const raw = await this.client.get<unknown>(`assignee/${id}/`)
    return looseParse(zAssigneeSuccessResponse, raw)
  }

  async searchInventors(name: string, limit = 25): Promise<InventorResponse> {
    const q = {
      _or: [{ _text_any: { inventor_name_first: name } }, { _text_any: { inventor_name_last: name } }],
    }
    const params = buildParams(q, undefined, { size: limit })
    const raw = await this.client.get<unknown>("inventor/", params)
    return looseParse(zInventorSuccessResponse, raw)
  }

  async getInventor(id: string): Promise<InventorResponse> {
    const raw = await this.client.get<unknown>(`inventor/${id}/`)
    return looseParse(zInventorSuccessResponse, raw)
  }

  async searchAttorneys(name: string, limit = 25): Promise<AttorneyResponse> {
    const q = {
      _or: [{ _text_any: { attorney_organization: name } }, { _text_any: { attorney_name_last: name } }],
    }
    const params = buildParams(q, undefined, { size: limit })
    const raw = await this.client.get<unknown>("patent/attorney/", params)
    return looseParse(zAttorneySuccessResponse, raw)
  }

  async getAttorney(id: string): Promise<AttorneyResponse> {
    const raw = await this.client.get<unknown>(`patent/attorney/${id}/`)
    return looseParse(zAttorneySuccessResponse, raw)
  }

  async getClaims(patentId: string): Promise<ClaimResponse> {
    const params = buildParams({ _eq: { patent_id: patentId } })
    const raw = await this.client.get<unknown>("g_claim/", params)
    return looseParse(zGClaimSuccessResponse, raw)
  }

  async getDescription(patentId: string): Promise<PatentResponse> {
    const params: Record<string, string> = {
      f: JSON.stringify(["patent_id", "patent_title", "patent_abstract"]),
    }
    const raw = await this.client.get<unknown>(`patent/${patentId}/`, params)
    return looseParse(zPatentSuccessResponse, raw)
  }

  async searchByCpc(cpcCode: string, limit = 25): Promise<PatentResponse> {
    const params = buildParams({ _eq: { cpc_subgroup_id: cpcCode } }, [...DEFAULT_PATENT_FIELDS], { size: limit })
    const raw = await this.client.get<unknown>("patent/", params)
    return looseParse(zPatentSuccessResponse, raw)
  }

  async lookupCpc(cpcCode: string): Promise<CpcSubclassResponse> {
    const params = buildParams({ _eq: { cpc_subclass_id: cpcCode } })
    const raw = await this.client.get<unknown>("cpc_subclass/", params)
    return looseParse(zCpcSubclassSuccessResponse, raw)
  }

  async searchByIpc(ipcCode: string, limit = 25): Promise<PatentResponse> {
    const params = buildParams({ _eq: { ipc_class: ipcCode } }, [...DEFAULT_PATENT_FIELDS], { size: limit })
    const raw = await this.client.get<unknown>("patent/", params)
    return looseParse(zPatentSuccessResponse, raw)
  }

  async lookupIpc(ipcCode: string): Promise<IpcResponse> {
    const params = buildParams({ _eq: { ipc_class: ipcCode } })
    const raw = await this.client.get<unknown>("ipc/", params)
    return looseParse(zIpcClassificationSuccessResponse, raw)
  }

  private buildPatentQuery(
    query: string,
    searchType: "text" | "assignee" | "inventor",
    matchType: "all" | "any" | "phrase" = "all",
  ): Record<string, unknown> {
    const op = matchType === "phrase" ? "_text_phrase" : matchType === "any" ? "_text_any" : "_text_all"
    switch (searchType) {
      case "text":
        return { [op]: { patent_abstract: query } }
      case "assignee":
        return { [op]: { assignee_organization: query } }
      case "inventor":
        return {
          _or: [{ [op]: { inventor_name_first: query } }, { [op]: { inventor_name_last: query } }],
        }
    }
  }
}
