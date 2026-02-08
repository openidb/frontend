import { fetchAPIRaw } from "@/lib/api-client";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;
  const res = await fetchAPIRaw(`/api/authors/${encodeURIComponent(name)}`);
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
