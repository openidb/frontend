import { fetchAPI } from "@/lib/api-client";
import BooksClient from "./BooksClient";

export const dynamic = 'force-dynamic'; // skip build-time render (API unavailable during Docker build)

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

interface CategoryItem {
  id: number;
  nameArabic: string;
  nameEnglish: string | null;
  booksCount: number;
}

interface CenturyItem {
  century: number;
  booksCount: number;
}

interface FeatureCounts {
  hasPdf: number;
  isIndexed: number;
  isTranslated: number;
}

export default async function BooksPage() {
  let books: Book[] = [];
  let pagination: Pagination = { page: 1, limit: 50, total: 0, totalPages: 0 };
  let categories: CategoryItem[] = [];
  let centuries: CenturyItem[] = [];
  let features: FeatureCounts = { hasPdf: 0, isIndexed: 0, isTranslated: 0 };

  try {
    const [booksData, categoriesData, centuriesData, featuresData] = await Promise.all([
      fetchAPI<APIResponse>("/api/books?limit=50", { revalidate: 86400 }),
      fetchAPI<{ categories: CategoryItem[] }>("/api/books/categories?flat=true", { revalidate: 86400 }).catch(() => ({ categories: [] })),
      fetchAPI<{ centuries: CenturyItem[] }>("/api/books/centuries", { revalidate: 86400 }).catch(() => ({ centuries: [] })),
      fetchAPI<{ features: FeatureCounts }>("/api/books/features?lang=en", { revalidate: 86400 }).catch(() => ({ features: { hasPdf: 0, isIndexed: 0, isTranslated: 0 } })),
    ]);

    books = booksData.books;
    pagination = {
      page: Math.floor((booksData.offset || 0) / (booksData.limit || 50)) + 1,
      limit: booksData.limit || 50,
      total: booksData.total || 0,
      totalPages: Math.ceil((booksData.total || 0) / (booksData.limit || 50)),
    };
    categories = categoriesData.categories;
    centuries = centuriesData.centuries;
    features = featuresData.features;
  } catch (error) {
    console.error("Failed to fetch books:", error);
  }

  return (
    <BooksClient
      initialBooks={books}
      initialPagination={pagination}
      initialCategories={categories}
      initialCenturies={centuries}
      initialFeatures={features}
    />
  );
}
