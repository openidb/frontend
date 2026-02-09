import { fetchAPI } from "@/lib/api-client";
import AuthorsClient from "./AuthorsClient";

export const dynamic = "force-dynamic";

interface Author {
  id: string;
  nameArabic: string;
  nameLatin: string;
  deathDateHijri: string | null;
  deathDateGregorian: string | null;
  _count: { books: number };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface APIResponse {
  authors: Author[];
  total: number;
  limit: number;
  offset: number;
}

export default async function AuthorsPage() {
  let authors: Author[] = [];
  let pagination: Pagination = { page: 1, limit: 50, total: 0, totalPages: 0 };

  try {
    const res = await fetchAPI<APIResponse>("/api/books/authors?limit=50");
    authors = res.authors;
    pagination = {
      page: Math.floor((res.offset || 0) / (res.limit || 50)) + 1,
      limit: res.limit || 50,
      total: res.total || 0,
      totalPages: Math.ceil((res.total || 0) / (res.limit || 50)),
    };
  } catch (error) {
    console.error("Failed to fetch authors:", error);
  }

  return (
    <AuthorsClient
      initialAuthors={authors}
      initialPagination={pagination}
    />
  );
}
