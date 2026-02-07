import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import BooksClient from "./BooksClient";

// Use dynamic rendering since database isn't available at build time
// unstable_cache still provides runtime caching
export const dynamic = "force-dynamic";

const getBooks = unstable_cache(
  async () => {
    return prisma.book.findMany({
      select: {
        id: true,
        titleArabic: true,
        titleLatin: true,
        filename: true,
        timePeriod: true,
        publicationYearHijri: true,
        publicationYearGregorian: true,
        author: {
          select: {
            id: true,
            nameArabic: true,
            nameLatin: true,
            deathDateHijri: true,
            deathDateGregorian: true,
          },
        },
        category: {
          select: {
            id: true,
            nameArabic: true,
            nameEnglish: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  },
  ["books-home"],
  { revalidate: 3600 } // 1 hour
);

export default async function BooksPage() {
  let books: Awaited<ReturnType<typeof getBooks>> = [];

  try {
    books = await getBooks();
  } catch (error) {
    console.error("Failed to fetch books:", error);
  }

  return <BooksClient books={books} />;
}
