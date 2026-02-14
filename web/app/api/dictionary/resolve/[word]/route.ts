import { fetchAPIRaw } from "@/lib/api-client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ word: string }> }
) {
  try {
    const { word } = await context.params;
    const res = await fetchAPIRaw(`/api/dictionary/resolve/${encodeURIComponent(word)}`);
    return new Response(res.body, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
}
