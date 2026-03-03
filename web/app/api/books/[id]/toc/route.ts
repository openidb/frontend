import { fetchAPIRaw } from "@/lib/api-client";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const res = await fetchAPIRaw(`/api/books/${encodeURIComponent(id)}/toc`);
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": res.ok
          ? "public, max-age=86400, stale-while-revalidate=86400"
          : "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
}
