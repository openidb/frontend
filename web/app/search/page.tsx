import { fetchAPI } from "@/lib/api-client";
import SearchClient from "./SearchClient";

export const dynamic = "force-dynamic";

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
