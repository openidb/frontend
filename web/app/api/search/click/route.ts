import { fetchAPIRaw } from "@/lib/api-client";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const res = await fetchAPIRaw("/api/search/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    return new Response(res.body, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
}
