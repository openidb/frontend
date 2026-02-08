import { fetchAPIRaw } from "@/lib/api-client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const res = await fetchAPIRaw(`/api/books/authors?${searchParams}`);
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
