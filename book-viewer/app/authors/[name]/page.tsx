import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import AuthorDetailClient from "./AuthorDetailClient";

export const dynamic = "force-dynamic";

export default async function AuthorDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const authorLatin = decodeURIComponent(name);

  // Fetch author with all books from database
  let author;
  try {
    author = await prisma.author.findUnique({
      where: { nameLatin: authorLatin },
      include: {
        books: {
          include: {
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
        },
      },
    });
  } catch (error) {
    console.error("Failed to fetch author:", error);
    notFound();
  }

  if (!author) {
    notFound();
  }

  // Transform author data to match the expected format for AuthorDetailClient
  const metadata = {
    id: author.id,  // shamela_author_id is now the primary key 'id'
    name_arabic: author.nameArabic,
    name_latin: author.nameLatin,
    death_date_hijri: author.deathDateHijri || undefined,
    birth_date_hijri: author.birthDateHijri || undefined,
    death_date_gregorian: author.deathDateGregorian || undefined,
    birth_date_gregorian: author.birthDateGregorian || undefined,
    biography: author.biography || undefined,
    biography_source: author.biographySource || undefined,
    books_count: author.books.length,
  };

  // Transform books data to match the expected format
  const books = author.books.map((book) => ({
    id: book.id,  // Primary key is now the shamela book ID
    title: book.titleArabic,
    titleLatin: book.titleLatin,
    author: author.nameArabic,
    authorLatin: author.nameLatin,
    datePublished: book.publicationYearGregorian || "",
    filename: book.filename,
    category: book.category?.nameArabic || "",
    subcategory: null,
    yearAH: parseInt(book.publicationYearHijri || "0"),
    timePeriod: book.timePeriod || "",
  }));

  return (
    <AuthorDetailClient
      authorName={author.nameArabic}
      authorLatin={author.nameLatin}
      books={books}
      metadata={metadata}
    />
  );
}
