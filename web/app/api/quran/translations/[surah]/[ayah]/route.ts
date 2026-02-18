import { fetchAPIRaw } from "@/lib/api-client";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ surah: string; ayah: string }> }
) {
  try {
    const { surah, ayah } = await context.params;
    const { searchParams } = new URL(request.url);
    const res = await fetchAPIRaw(
      `/api/quran/translations/${encodeURIComponent(surah)}/${encodeURIComponent(ayah)}?${searchParams}`
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
