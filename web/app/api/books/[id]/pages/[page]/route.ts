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
        "Cache-Control": res.ok
          ? "public, max-age=31536000, immutable"
          : "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
}
