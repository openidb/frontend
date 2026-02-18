const OPENIDB_URL = process.env.OPENIDB_URL || "http://localhost:4000";

export async function fetchAPI<T>(
  path: string,
  init?: RequestInit & { revalidate?: number; timeout?: number; retries?: number }
): Promise<T> {
  const { revalidate, timeout = 10000, retries = 2, ...fetchInit } = init ?? {};
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(`${OPENIDB_URL}${path}`, {
        ...fetchInit,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...fetchInit?.headers,
        },
        ...(revalidate !== undefined ? { next: { revalidate } } : {}),
      });
      clearTimeout(timer);
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          lastError = new Error(`API ${path}: ${res.status}`);
          await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
          continue;
        }
        throw new Error(`API ${path}: ${res.status} ${res.statusText}`);
      }
      return res.json();
    } catch (err) {
      clearTimeout(timer);
      lastError = err as Error;
      if (
        attempt < retries &&
        (err instanceof TypeError || (err as Error).name === "AbortError")
      ) {
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError!;
}

export async function fetchAPIRaw(path: string, init?: RequestInit & { timeout?: number }): Promise<Response> {
  const { timeout = 30000, ...fetchInit } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(`${OPENIDB_URL}${path}`, { ...fetchInit, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
