import { fetchAPIRaw } from "@/lib/api-client";
import { validateCsrfToken } from "@/lib/csrf";
import { NextResponse } from "next/server";

const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";
if (!process.env.INTERNAL_API_SECRET) {
  console.warn("[transcribe] INTERNAL_API_SECRET is not set — backend requests will be rejected.");
}

export async function POST(request: Request) {
  try {
    const csrfToken = request.headers.get("x-csrf-token");
    if (!validateCsrfToken(csrfToken)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const formData = await request.formData();
    const res = await fetchAPIRaw("/api/transcribe", {
      method: "POST",
      headers: {
        "X-Internal-Secret": INTERNAL_API_SECRET,
      },
      body: formData,
    });
    return new Response(res.body, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
}
