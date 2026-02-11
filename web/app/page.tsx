import { fetchAPI } from "@/lib/api-client";
import BooksClient from "./BooksClient";

export const dynamic = "force-dynamic";

interface Author {
  id: string;
  nameArabic: string;
  nameLatin: string;
  deathDateHijri: string | null;
  deathDateGregorian: string | null;
}

interface Category {
  id: number;
  nameArabic: string;
  nameEnglish: string | null;
}

interface Book {
  id: string;
  titleArabic: string;
  titleLatin: string;
  filename: string;
  timePeriod: string | null;
  publicationYearHijri: string | null;
  publicationYearGregorian: string | null;
  author: Author;
  category: Category | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface APIResponse {
  books: Book[];
  total: number;
  limit: number;
  offset: number;
}

export default async function BooksPage() {
  let books: Book[] = [];
  let pagination: Pagination = { page: 1, limit: 50, total: 0, totalPages: 0 };

  try {
    const data = await fetchAPI<APIResponse>("/api/books?limit=50");
    books = data.books;
    pagination = {
      page: Math.floor((data.offset || 0) / (data.limit || 50)) + 1,
      limit: data.limit || 50,
      total: data.total || 0,
      totalPages: Math.ceil((data.total || 0) / (data.limit || 50)),
    };
  } catch (error) {
    console.error("Failed to fetch books:", error);
  }

  return <BooksClient initialBooks={books} initialPagination={pagination} />;
}
