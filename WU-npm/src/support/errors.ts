export class APIError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'APIError'
  }
}

export class CanceledError extends Error {
  constructor(message = 'canceled') {
    super(message)
    this.name = 'CanceledError'
  }
}

export function isAPIError(e: unknown): boolean {
  return e instanceof APIError
}

export function isCanceled(e: unknown): boolean {
  return e instanceof CanceledError
}
