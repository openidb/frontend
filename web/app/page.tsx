import { fetchAPI } from "@/lib/api-client";
import BooksClient from "./BooksClient";

export const dynamic = "force-dynamic";

interface Book {
  id: string;
  titleArabic: string;
  titleLatin: string;
  filename: string;
  timePeriod: string | null;
  publicationYearHijri: string | null;
  publicationYearGregorian: string | null;
  author: {
    id: string;
    nameArabic: string;
    nameLatin: string;
    deathDateHijri: string | null;
    deathDateGregorian: string | null;
  };
  category: {
    id: number;
    nameArabic: string;
    nameEnglish: string | null;
  } | null;
}

export default async function BooksPage() {
  let books: Book[] = [];

  try {
    const data = await fetchAPI<{ books: Book[] }>("/api/books?limit=100");
    books = data.books;
  } catch (error) {
    console.error("Failed to fetch books:", error);
  }

  return <BooksClient books={books} />;
}
