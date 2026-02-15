const OPENIDB_URL = process.env.OPENIDB_URL || "http://localhost:4000";

export async function fetchAPI<T>(path: string, init?: RequestInit & { revalidate?: number }): Promise<T> {
  const { revalidate, ...fetchInit } = init ?? {};
  const res = await fetch(`${OPENIDB_URL}${path}`, {
    ...fetchInit,
    headers: {
      "Content-Type": "application/json",
      ...fetchInit?.headers,
    },
    ...(revalidate !== undefined ? { next: { revalidate } } : {}),
  });
  if (!res.ok) {
    throw new Error(`API ${path}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchAPIRaw(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${OPENIDB_URL}${path}`, init);
}
