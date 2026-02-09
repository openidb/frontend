import { fetchAPIRaw } from "@/lib/api-client";
import { NextResponse } from "next/server";

const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";

export async function POST(request: Request) {
  try {
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
