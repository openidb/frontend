import { fetchAPIRaw } from "@/lib/api-client";
import { NextRequest, NextResponse } from "next/server";

/**
 * Streams the mushaf PDF from RustFS through the frontend.
 * Supports range requests for efficient page-by-page loading via pdf.js.
 */
export async function GET(request: NextRequest) {
  try {
    // Get presigned URL from API
    const apiRes = await fetchAPIRaw("/api/quran/mushaf/pdf");
    if (!apiRes.ok) {
      return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
    }
    const { url } = await apiRes.json();

    // Forward range header if present (pdf.js uses range requests)
    const headers: HeadersInit = {};
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      headers["Range"] = rangeHeader;
    }

    // Fetch the actual PDF from RustFS
    const pdfRes = await fetch(url, { headers });

    // Build response headers
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", "application/pdf");
    responseHeaders.set("Cache-Control", "public, max-age=86400, immutable");
    responseHeaders.set("Accept-Ranges", "bytes");

    const contentLength = pdfRes.headers.get("content-length");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);

    const contentRange = pdfRes.headers.get("content-range");
    if (contentRange) responseHeaders.set("Content-Range", contentRange);

    return new Response(pdfRes.body, {
      status: pdfRes.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
}
