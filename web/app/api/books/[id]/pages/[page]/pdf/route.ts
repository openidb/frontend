import { fetchAPIRaw } from "@/lib/api-client";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; page: string }> }
) {
  try {
    const { id, page } = await context.params;
    const res = await fetchAPIRaw(
      `/api/books/${encodeURIComponent(id)}/pages/${encodeURIComponent(page)}/pdf`
    );

    if (!res.ok) {
      return NextResponse.json({ error: "PDF not available" }, { status: res.status });
    }

    // Stream the PDF through (API now returns actual PDF content or redirects)
    const contentType = res.headers.get("content-type") || "application/pdf";

    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600",
        ...(res.headers.get("content-length")
          ? { "Content-Length": res.headers.get("content-length")! }
          : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
}
