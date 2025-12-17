import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/authors
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - search: Search query (searches name)
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

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { nameArabic: { contains: search, mode: "insensitive" } },
        { nameLatin: { contains: search, mode: "insensitive" } },
      ];
    }

    // Fetch authors with book count
    const [authors, total] = await Promise.all([
      prisma.author.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: {
            select: { books: true },
          },
        },
        orderBy: {
          nameLatin: "asc",
        },
      }),
      prisma.author.count({ where }),
    ]);

    return NextResponse.json({
      authors,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching authors:", error);
    return NextResponse.json(
      { error: "Failed to fetch authors" },
      { status: 500 }
    );
  }
}
