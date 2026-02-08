import { fetchAPIRaw } from "@/lib/api-client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Map sabeel's /api/ayah?surah=X&ayah=Y to openidb's /api/quran/ayahs?surah=X&ayah=Y
  const res = await fetchAPIRaw(`/api/quran/ayahs?${searchParams}`);
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
