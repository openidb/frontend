import { NextRequest, NextResponse } from "next/server";

type RateLimitCategory = "paid" | "search" | "general";

const RATE_LIMITS: Record<RateLimitCategory, number> = {
  paid: 10,     // 10 req/min — translate, transcribe
  search: 60,   // 60 req/min — search
  general: 120, // 120 req/min — books, authors, categories, ayah
};

const WINDOW_MS = 60_000; // 1 minute sliding window

const hits = new Map<string, number[]>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of hits) {
    const recent = timestamps.filter((t) => now - t < WINDOW_MS);
    if (recent.length === 0) hits.delete(key);
    else hits.set(key, recent);
  }
}, 5 * 60_000);

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Returns null if the request is allowed, or a 429 NextResponse if rate-limited.
 */
export function rateLimit(
  request: NextRequest,
  category: RateLimitCategory
): NextResponse | null {
  const ip = getClientIp(request);
  const key = `${category}:${ip}`;
  const now = Date.now();
  const max = RATE_LIMITS[category];

  const timestamps = hits.get(key) ?? [];
  const recent = timestamps.filter((t) => now - t < WINDOW_MS);

  if (recent.length >= max) {
    const oldestInWindow = recent[0];
    const retryAfter = Math.ceil((oldestInWindow + WINDOW_MS - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      }
    );
  }

  recent.push(now);
  hits.set(key, recent);
  return null;
}
