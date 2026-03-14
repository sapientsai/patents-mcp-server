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
