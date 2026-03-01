import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for word-level timing segments.
 * GET /api/quran/segments?reciter=tarteel/alafasy&surah=1
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const reciter = searchParams.get("reciter");
  const surah = searchParams.get("surah");

  if (!reciter || !surah) {
    return NextResponse.json({ error: "reciter and surah required" }, { status: 400 });
  }

  const apiBase = process.env.OPENIDB_URL || "http://localhost:4000";
  const upstream = `${apiBase}/api/quran/segments?reciter=${encodeURIComponent(reciter)}&surah=${surah}`;

  try {
    const res = await fetch(upstream, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
