import { fetchAPIRaw } from "@/lib/api-client";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ bookId: string; pageNumber: string }> }
) {
  const { bookId, pageNumber } = await context.params;
  const body = await request.text();
  const res = await fetchAPIRaw(`/api/books/${bookId}/pages/${pageNumber}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
