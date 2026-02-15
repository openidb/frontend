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

interface CenturyItem {
  century: number;
  authorsCount: number;
}

export default async function AuthorsPage() {
  let authors: Author[] = [];
  let pagination: Pagination = { page: 1, limit: 50, total: 0, totalPages: 0 };
  let centuries: CenturyItem[] = [];

  try {
    const [authorsData, centuriesData] = await Promise.all([
      fetchAPI<APIResponse>("/api/books/authors?limit=50"),
      fetchAPI<{ centuries: CenturyItem[] }>("/api/books/centuries/authors", { revalidate: 3600 }).catch(() => ({ centuries: [] })),
    ]);

    authors = authorsData.authors;
    pagination = {
      page: Math.floor((authorsData.offset || 0) / (authorsData.limit || 50)) + 1,
      limit: authorsData.limit || 50,
      total: authorsData.total || 0,
      totalPages: Math.ceil((authorsData.total || 0) / (authorsData.limit || 50)),
    };
    centuries = centuriesData.centuries;
  } catch (error) {
    console.error("Failed to fetch authors:", error);
  }

  return (
    <AuthorsClient
      initialAuthors={authors}
      initialPagination={pagination}
      initialCenturies={centuries}
    />
  );
}
