import { fetchAPIRaw } from "@/lib/api-client";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; page: string }> }
) {
  try {
    const { id, page } = await context.params;
    const res = await fetchAPIRaw(
      `/api/books/${encodeURIComponent(id)}/pages/${encodeURIComponent(page)}`
    );
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
}
