export class ApiException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiException";
  }
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 180_000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}
