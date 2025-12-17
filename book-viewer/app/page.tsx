import { prisma } from "@/lib/db";
import BooksClient from "./BooksClient";

export const dynamic = "force-dynamic";

export default async function BooksPage() {
  // Fetch all books with author and category data
  const books = await prisma.book.findMany({
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

  return <BooksClient books={books} />;
}
