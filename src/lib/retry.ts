import { config } from "./config"

type RetryOptions = {
  maxRetries: number
  minWait: number
  maxWait: number
}

const defaultOptions: RetryOptions = {
  maxRetries: config.maxRetries,
  minWait: config.retryMinWait,
  maxWait: config.retryMaxWait,
}

const computeDelay = (attempt: number, minWait: number, maxWait: number): number => {
  const exponentialDelay = minWait * Math.pow(2, attempt)
  const jitter = Math.random() * minWait
  return Math.min(exponentialDelay + jitter, maxWait)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export const withRetry = async <T>(fn: () => Promise<T>, opts?: Partial<RetryOptions>): Promise<T> => {
  const { maxRetries, minWait, maxWait } = { ...defaultOptions, ...opts }

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (attempt === maxRetries) {
        break
      }

      const delay = computeDelay(attempt, minWait, maxWait)
      await sleep(delay)
    }
  }

  throw lastError
}
