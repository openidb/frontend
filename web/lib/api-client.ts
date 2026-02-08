const OPENIDB_URL = process.env.OPENIDB_URL || "http://localhost:4000";

export async function fetchAPI<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${OPENIDB_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API ${path}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchAPIRaw(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${OPENIDB_URL}${path}`, init);
}
