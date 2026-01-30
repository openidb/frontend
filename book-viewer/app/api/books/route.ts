import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parsePagination, createPaginationResponse } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

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
  try {
    const searchParams = request.nextUrl.searchParams;
    const { page, limit, offset: skip } = parsePagination(request);

    // Filters
    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId");
    const authorId = searchParams.get("authorId");
    const timePeriod = searchParams.get("timePeriod");
    const bookTitleLang = searchParams.get("bookTitleLang");

    // Build where clause
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
