import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Pagination
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const skip = (page - 1) * limit;

    // Filters
    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId");
    const authorId = searchParams.get("authorId");
    const timePeriod = searchParams.get("timePeriod");

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
    const [books, total] = await Promise.all([
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
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.book.count({ where }),
    ]);

    return NextResponse.json({
      books,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching books:", error);
    return NextResponse.json(
      { error: "Failed to fetch books" },
      { status: 500 }
    );
  }
}
