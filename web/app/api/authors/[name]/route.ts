import { fetchAPIRaw } from "@/lib/api-client";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await context.params;
    const { searchParams } = new URL(request.url);
    const qs = searchParams.toString();
    const res = await fetchAPIRaw(`/api/books/authors/${encodeURIComponent(name)}${qs ? `?${qs}` : ""}`);
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
}
