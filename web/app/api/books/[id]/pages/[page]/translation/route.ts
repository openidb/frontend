import { fetchAPIRaw } from "@/lib/api-client";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; page: string }> }
) {
  try {
    const { id, page } = await context.params;
    const url = new URL(request.url);
    const lang = url.searchParams.get("lang") || "en";
    const res = await fetchAPIRaw(
      `/api/books/${encodeURIComponent(id)}/pages/${encodeURIComponent(page)}/translation?lang=${encodeURIComponent(lang)}`
    );
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": res.ok
          ? "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400"
          : "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
}
