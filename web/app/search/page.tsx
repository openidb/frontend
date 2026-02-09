import type { Metadata } from "next";
import { fetchAPI } from "@/lib/api-client";
import SearchClient from "./SearchClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  if (q) {
    return {
      title: `${q} - Sanad Search`,
      description: `Search results for "${q}" across Quran, Hadith, and Islamic texts`,
    };
  }
  return {
    title: "Search - Sanad",
    description: "Search across Quran, Hadith, and Islamic texts",
  };
}

export default async function SearchPage() {
  let bookCount = 0;
  try {
    const stats = await fetchAPI<{ bookCount: number }>("/api/stats");
    bookCount = stats.bookCount;
  } catch (error) {
    console.error("Failed to get book count:", error);
  }

  return (
    <main className="min-h-screen bg-background">
      <SearchClient bookCount={bookCount} />
    </main>
  );
}
