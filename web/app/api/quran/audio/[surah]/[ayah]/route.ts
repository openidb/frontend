import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin audio proxy for Quran ayah audio.
 * GET /api/quran/audio/{surah}/{ayah}?reciter=tarteel/alafasy
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ surah: string; ayah: string }> },
) {
  const { surah, ayah } = await params;
  const reciter = request.nextUrl.searchParams.get("reciter") || "tarteel/alafasy";
  const range = request.headers.get("range");

  if (!surah || !ayah) {
    return NextResponse.json({ error: "surah and ayah required" }, { status: 400 });
  }

  const apiBase = process.env.OPENIDB_URL || "http://localhost:4000";
  const PRIMARY_TIMEOUT_MS = 4000;
  const RETRY_TIMEOUT_MS = 10000;

  const upstreamHeaders: HeadersInit = {};
  if (range) upstreamHeaders.Range = range;

  const reciterCandidates = Array.from(
    new Set([reciter, "tarteel/alafasy", "alafasy-128kbps"]),
  );

  const fetchCandidate = (candidate: string, timeoutMs: number) =>
    fetch(
      `${apiBase}/api/quran/audio/${surah}/${ayah}?reciter=${encodeURIComponent(candidate)}`,
      { headers: upstreamHeaders, signal: AbortSignal.timeout(timeoutMs) },
    );

  const fetchWithRetry = async (candidate: string) => {
    try {
      return await fetchCandidate(candidate, PRIMARY_TIMEOUT_MS);
    } catch {
      return await fetchCandidate(candidate, RETRY_TIMEOUT_MS);
    }
  };

  try {
    let res: Response | null = null;
    let effectiveReciter: string | null = null;
    let primaryNotFound = false;
    let errStatus: number | null = null;

    // Try requested reciter first
    try {
      const primary = await fetchWithRetry(reciter);
      if (primary.ok) {
        res = primary;
        effectiveReciter = reciter;
      } else if (primary.status === 404) {
        primaryNotFound = true;
      } else {
        errStatus = primary.status;
      }
    } catch {
      errStatus = 503;
    }

    // Fallback only on 404
    if (!res && errStatus == null && primaryNotFound) {
      for (const candidate of reciterCandidates) {
        if (candidate === reciter) continue;
        try {
          const candidateRes = await fetchWithRetry(candidate);
          if (candidateRes.ok) {
            res = candidateRes;
            effectiveReciter = candidate;
            break;
          }
          if (candidateRes.status !== 404) {
            errStatus = candidateRes.status;
            break;
          }
        } catch {
          errStatus = 503;
          break;
        }
      }
    }

    if (errStatus != null) return new NextResponse(null, { status: errStatus });
    if (!res) return new NextResponse(null, { status: 404 });

    const fallback = !!effectiveReciter && effectiveReciter !== reciter;
    const headers: Record<string, string> = {
      "Content-Type": res.headers.get("Content-Type") || "audio/mpeg",
      "Cache-Control": fallback
        ? "public, max-age=300"
        : "public, max-age=31536000, immutable",
    };

    for (const key of ["Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"]) {
      const val = res.headers.get(key);
      if (val) headers[key] = val;
    }

    if (effectiveReciter) headers["X-OpenIDB-Effective-Reciter"] = effectiveReciter;
    if (fallback) headers["X-OpenIDB-Fallback-Applied"] = "1";

    return new NextResponse(res.body, { status: res.status, headers });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
