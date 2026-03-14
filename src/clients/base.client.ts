import { withRetry } from "../lib/retry"

export type BaseClientOptions = {
  readonly baseUrl: string
  readonly headers?: Record<string, string>
  readonly timeout?: number
}

type HttpError = Error & { status: number; statusText: string; body: string }

const createHttpError = (status: number, statusText: string, body: string): HttpError => {
  const error = new Error(`API Error ${status} ${statusText}: ${body}`) as HttpError
  error.status = status
  error.statusText = statusText
  error.body = body
  return error
}

export class BaseClient {
  private readonly baseUrl: string
  private readonly headers: Record<string, string>
  private readonly timeout: number

  constructor(options: BaseClientOptions) {
    this.baseUrl = options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`
    this.headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    }
    this.timeout = options.timeout ?? 30000
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params)
    return withRetry(() => this.request<T>(url, { method: "GET" }))
  }

  async post<T>(path: string, body?: unknown, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params)
    const init: RequestInit = {
      method: "POST",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }
    return withRetry(() => this.request<T>(url, init))
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(path, this.baseUrl)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, value)
        }
      }
    }
    return url.toString()
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        ...init,
        headers: this.headers,
        signal: controller.signal,
      })

      if (!response.ok) {
        const body = await response.text()
        throw createHttpError(response.status, response.statusText, body)
      }

      return (await response.json()) as T
    } catch (error) {
      if (error instanceof Error && "status" in error) throw error

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`Request to ${url} timed out after ${this.timeout}ms`, { cause: error })
      }

      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
