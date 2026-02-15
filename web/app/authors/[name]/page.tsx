import type { Metadata } from "next";
import { fetchAPI } from "@/lib/api-client";
import { notFound } from "next/navigation";
import AuthorDetailClient from "./AuthorDetailClient";

interface AuthorData {
  author: {
    id: string;
    nameArabic: string;
    nameLatin: string;
    deathDateHijri: string | null;
    birthDateHijri: string | null;
    deathDateGregorian: string | null;
    birthDateGregorian: string | null;
    biography: string | null;
    biographySource: string | null;
    books: Array<{
      id: string;
      titleArabic: string;
      titleLatin: string;
      filename: string;
      publicationYearHijri: string | null;
      publicationYearGregorian: string | null;
      timePeriod: string | null;
      category: {
        id: number;
        nameArabic: string;
        nameEnglish: string | null;
      } | null;
    }>;
    _count: { books: number };
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name } = await params;
  const authorId = name;
  try {
    const data = await fetchAPI<AuthorData>(`/api/books/authors/${encodeURIComponent(authorId)}`);
    const title = data.author?.nameArabic || data.author?.nameLatin || authorId;
    const latin = data.author?.nameLatin || "";
    return {
      title: `${title} - OpenIDB`,
      description: `Books by ${title}${latin ? ` (${latin})` : ""}`,
    };
  } catch {
    return { title: "Author - OpenIDB" };
  }
}

export default async function AuthorDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const authorId = name;

  let data: AuthorData;
  try {
    data = await fetchAPI<AuthorData>(`/api/books/authors/${encodeURIComponent(authorId)}`);
  } catch {
    notFound();
  }

  const author = data.author;
  if (!author) notFound();

  const metadata = {
    id: author.id,
    nameArabic: author.nameArabic,
    nameLatin: author.nameLatin,
    deathDateHijri: author.deathDateHijri || undefined,
    birthDateHijri: author.birthDateHijri || undefined,
    deathDateGregorian: author.deathDateGregorian || undefined,
    birthDateGregorian: author.birthDateGregorian || undefined,
    biography: author.biography || undefined,
    biographySource: author.biographySource || undefined,
    booksCount: author.books.length,
  };

  const books = author.books.map((book) => ({
    id: book.id,
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
