export type PaginatedResponse<T> = {
  total: number
  count: number
  offset: number
  items: T[]
  hasMore: boolean
  nextOffset?: number
}

export type ApiStatus = {
  name: string
  configured: boolean
  healthy: boolean
  lastCheck?: Date
  error?: string
}

export type TransportType = "stdio" | "httpStream"

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

export type PatentSource = "USPTO" | "PatentsView" | "EPO" | "GooglePatents"
