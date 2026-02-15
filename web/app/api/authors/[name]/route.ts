import { fetchAPIRaw } from "@/lib/api-client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
}
