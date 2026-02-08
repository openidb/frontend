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

export default async function AuthorsPage() {
  let data = {
    authors: [] as Author[],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } as Pagination,
  };

  try {
    const res = await fetchAPI<{ authors: Author[]; pagination: Pagination }>(
      "/api/authors?limit=50"
    );
    data = res;
  } catch (error) {
    console.error("Failed to fetch authors:", error);
  }

  return (
    <AuthorsClient
      initialAuthors={data.authors}
      initialPagination={data.pagination}
    />
  );
}
