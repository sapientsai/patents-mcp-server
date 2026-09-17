import { UserError } from "fastmcp"

export { UserError }

type HttpErrorInfo = {
  status: number
  message: string
}

const httpStatusMessages: Record<number, string> = {
  401: "Authentication failed. Please check your API key or credentials.",
  403: "Access forbidden. Your credentials do not have permission for this resource.",
  404: "Resource not found. The requested patent or endpoint does not exist.",
  429: "Rate limit exceeded. Please wait before making additional requests.",
}

const formatHttpError = (info: HttpErrorInfo): string => {
  const knownMessage = httpStatusMessages[info.status]
  if (knownMessage) return knownMessage

  if (info.status >= 500) {
    return `Server error (${info.status}): The patent data service is experiencing issues. Please try again later.`
  }

  return `HTTP error ${info.status}: ${info.message}`
}

const isErrorWithStatus = (error: unknown): error is { status: number; message?: string } =>
  typeof error === "object" &&
  error !== null &&
  "status" in error &&
  typeof (error as Record<string, unknown>).status === "number"

const isErrorWithResponse = (error: unknown): error is { response: { status: number; statusText: string } } =>
  typeof error === "object" &&
  error !== null &&
  "response" in error &&
  typeof (error as Record<string, unknown>).response === "object" &&
  (error as Record<string, unknown>).response !== null

/** The HTTP status an error carries, however it is shaped. */
export const httpStatusOf = (error: unknown): number | undefined => {
  if (isErrorWithStatus(error)) return error.status
  if (isErrorWithResponse(error)) return error.response.status
  return undefined
}

/**
 * True when retrying could plausibly succeed.
 *
 * A 4xx is the server saying the request itself is wrong — a missing entitlement, an unknown
 * patent number — and repeating it verbatim cannot change that. Retrying anyway turns an
 * instant, legible failure into a multi-second wait that reads as a hang: with the default
 * backoff a 403 takes four attempts and ~14 seconds to surface. 408 and 429 are the exceptions,
 * since both explicitly invite a later retry.
 */
export const isRetryableError = (error: unknown): boolean => {
  const status = httpStatusOf(error)
  if (status === undefined) return true // network/parse failures are worth another go
  if (status === 408 || status === 429) return true
  return status < 400 || status >= 500
}

/**
 * Builds a 403 handler for an ODP data tier this key may not be entitled to.
 *
 * PTAB, citations, litigation and office actions are separate USPTO products. A bare "Access
 * forbidden" on those reads as a broken tool or a bad key; it is neither. Naming the tier and
 * the route that still works turns a dead end into a next step.
 */
export const handleTierError =
  (tier: string, alternative: string) =>
  (error: unknown): string =>
    isForbiddenError(error)
      ? `The ${tier} endpoint is unavailable for this credential (HTTP 403 — ${tier} is a separate ` +
        `USPTO ODP data tier, not part of the product this API key is entitled to). ${alternative}`
      : handleApiError(error)

/** True when the error carries an HTTP 403, however it is shaped. */
export const isForbiddenError = (error: unknown): boolean => {
  if (isErrorWithStatus(error)) return error.status === 403
  if (isErrorWithResponse(error)) return error.response.status === 403
  return false
}

export const handleApiError = (error: unknown): string => {
  if (error instanceof UserError) {
    return error.message
  }

  if (isErrorWithResponse(error)) {
    return formatHttpError({
      status: error.response.status,
      message: error.response.statusText,
    })
  }

  if (isErrorWithStatus(error)) {
    return formatHttpError({
      status: error.status,
      message: (error as { message?: string }).message ?? "Unknown error",
    })
  }

  if (error instanceof Error) {
    if (error.message.includes("ECONNREFUSED")) {
      return "Connection refused. The patent data service may be unavailable."
    }
    if (error.message.includes("ETIMEDOUT") || error.message.includes("timeout")) {
      return "Request timed out. The patent data service may be slow or unavailable."
    }
    return `Unexpected error: ${error.message}`
  }

  return `Unknown error occurred: ${String(error)}`
}
