import { fetchAPIRaw } from "@/lib/api-client";

export async function POST(request: Request) {
  const formData = await request.formData();
  const res = await fetchAPIRaw("/api/transcribe", {
    method: "POST",
    body: formData,
  });
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
