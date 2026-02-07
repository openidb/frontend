import { prisma } from "@/lib/db";
import SearchClient from "./SearchClient";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  // Get total book count for display (with fallback)
  let bookCount = 0;
  try {
    bookCount = await prisma.book.count();
  } catch (error) {
    console.error("Failed to get book count:", error);
  }

  return (
    <main className="min-h-screen bg-background">
      <SearchClient bookCount={bookCount} />
    </main>
  );
}
