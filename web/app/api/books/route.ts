import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { parsePagination, createPaginationResponse } from "@/lib/api-utils";

// Cache for unfiltered paginated queries
const getBooksPage = unstable_cache(
  async (page: number, limit: number, skip: number) => {
    const [booksRaw, total] = await Promise.all([
      prisma.book.findMany({
        skip,
        take: limit,
        select: {
          id: true,
          titleArabic: true,
          titleLatin: true,
          filename: true,
          timePeriod: true,
          publicationYearHijri: true,
          publicationYearGregorian: true,
          createdAt: true,
          updatedAt: true,
          authorId: true,
          categoryId: true,
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
      }),
      prisma.book.count(),
    ]);

    const books = booksRaw.map((book) => ({
      ...book,
      titleTranslated: null,
    }));

    return { books, total };
  },
  ["books-list"],
  { revalidate: 3600 } // 1 hour
);

/**
 * GET /api/books
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - search: Search query (searches title and author)
 * - category: Filter by category ID
 * - authorId: Filter by author ID
 * - timePeriod: Filter by time period
 * - bookTitleLang: Language code for book title translation (e.g., "en", "fr")
 */
export async function GET(request: NextRequest) {
  const limited = rateLimit(request, "general");
  if (limited) return limited;

  try {
    const searchParams = request.nextUrl.searchParams;
    const { page, limit, offset: skip } = parsePagination(request);

    // Filters
    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId");
    const authorId = searchParams.get("authorId");
    const timePeriod = searchParams.get("timePeriod");
    const bookTitleLang = searchParams.get("bookTitleLang");

    // Check if request has any filters
    const hasFilters = search || categoryId || authorId || timePeriod || bookTitleLang;

    if (!hasFilters) {
      // Use cached query for unfiltered requests
      const { books, total } = await getBooksPage(page, limit, skip);

      return NextResponse.json(
        {
          books,
          pagination: createPaginationResponse(page, limit, total),
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
          },
        }
      );
    }

    // Build where clause for filtered queries
    const where: any = {};

    if (search) {
      where.OR = [
        { titleArabic: { contains: search, mode: "insensitive" } },
        { titleLatin: { contains: search, mode: "insensitive" } },
        {
          author: {
            OR: [
              { nameArabic: { contains: search, mode: "insensitive" } },
              { nameLatin: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ];
    }

    if (categoryId) {
      where.categoryId = parseInt(categoryId);
    }

    if (authorId) {
      where.authorId = parseInt(authorId);
    }

    if (timePeriod) {
      where.timePeriod = timePeriod;
    }

    // Fetch books with relations
    const [booksRaw, total] = await Promise.all([
      prisma.book.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          titleArabic: true,
          titleLatin: true,
          filename: true,
          timePeriod: true,
          publicationYearHijri: true,
          publicationYearGregorian: true,
          createdAt: true,
          updatedAt: true,
          authorId: true,
          categoryId: true,
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
          ...(bookTitleLang && bookTitleLang !== "none" && bookTitleLang !== "transliteration"
            ? {
                titleTranslations: {
                  where: { language: bookTitleLang },
                  select: { title: true },
                  take: 1,
                },
              }
            : {}),
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.book.count({ where }),
    ]);

    // Add titleTranslated field to each book
    type BookWithTranslations = (typeof booksRaw)[number] & {
      titleTranslations?: { title: string }[];
    };
    const books = booksRaw.map((book: BookWithTranslations) => {
      const { titleTranslations, ...rest } = book as typeof book & {
        titleTranslations?: { title: string }[];
      };
      return {
        ...rest,
        titleTranslated: titleTranslations?.[0]?.title || null,
      };
    });

    return NextResponse.json({
      books,
      pagination: createPaginationResponse(page, limit, total),
    });
  } catch (error) {
    console.error("Error fetching books:", error);
    return NextResponse.json(
      { error: "Failed to fetch books" },
      { status: 500 }
    );
  }
}
