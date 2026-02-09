import { fetchAPIRaw } from "@/lib/api-client";
import { validateCsrfToken } from "@/lib/csrf";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";
if (!process.env.INTERNAL_API_SECRET) {
  console.warn("[translate] INTERNAL_API_SECRET is not set — backend requests will be rejected.");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ bookId: string; pageNumber: string }> }
) {
  try {
    const csrfToken = request.headers.get("x-csrf-token");
    if (!validateCsrfToken(csrfToken)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { bookId, pageNumber } = await context.params;
    const body = await request.text();
    const res = await fetchAPIRaw(`/api/books/${encodeURIComponent(bookId)}/pages/${encodeURIComponent(pageNumber)}/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": INTERNAL_API_SECRET,
      },
      body,
    });
    return new Response(res.body, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
}
