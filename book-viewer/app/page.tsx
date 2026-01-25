import { prisma } from "@/lib/db";
import BooksClient from "./BooksClient";

export const dynamic = "force-dynamic";

async function getBooks() {
  return prisma.book.findMany({
    include: {
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
}

export default async function BooksPage() {
  let books: Awaited<ReturnType<typeof getBooks>> = [];

  try {
    books = await getBooks();
  } catch (error) {
    console.error("Failed to fetch books:", error);
  }

  return <BooksClient books={books} />;
}
