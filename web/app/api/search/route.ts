import { fetchAPIRaw } from "@/lib/api-client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // Forward analytics headers to backend
    const headers: Record<string, string> = {};
    const eventId = request.headers.get("x-search-event-id");
    const sessionId = request.headers.get("x-session-id");
    if (eventId) headers["x-search-event-id"] = eventId;
    if (sessionId) headers["x-session-id"] = sessionId;

    const res = await fetchAPIRaw(`/api/search?${searchParams}`, { headers, signal: request.signal });
    return new Response(res.body, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
}
