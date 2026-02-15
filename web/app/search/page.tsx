import type { Metadata } from "next";
import SearchClient from "./SearchClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  if (q) {
    const safeQ = q.slice(0, 100);
    return {
      title: `${safeQ} - Sabeel Search`,
      description: `Search results for "${safeQ}" across Quran and Hadith`,
    };
  }
  return {
    title: "Search - Sabeel",
    description: "Search across Quran and Hadith",
  };
}

export default async function SearchPage() {
  return (
    <main className="min-h-screen bg-background">
      <SearchClient />
    </main>
  );
}
