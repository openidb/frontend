import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parsePagination, createPaginationResponse } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/authors
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - search: Search query (fuzzy search on Arabic and Latin names)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { page, limit, offset } = parsePagination(request);

    // Filters
    const search = searchParams.get("search")?.trim() || "";

    if (search) {
      // Use fuzzy search with pg_trgm for typo-tolerant matching
      // Combines exact ILIKE matches with similarity scoring
      const authors = await prisma.$queryRaw<Array<{
        id: string;
        name_arabic: string;
        name_latin: string | null;
        death_date_hijri: string | null;
        death_date_gregorian: string | null;
        biography: string | null;
        book_count: bigint;
        similarity_score: number;
      }>>`
        SELECT
          a.id,
          a.name_arabic,
          a.name_latin,
          a.death_date_hijri,
          a.death_date_gregorian,
          a.biography,
          COUNT(b.id)::bigint as book_count,
          GREATEST(
            COALESCE(similarity(a.name_arabic, ${search}), 0),
            COALESCE(similarity(a.name_latin, ${search}), 0)
          ) as similarity_score
        FROM authors a
        LEFT JOIN books b ON b.author_id = a.id
        WHERE
          a.name_arabic ILIKE ${'%' + search + '%'}
          OR a.name_latin ILIKE ${'%' + search + '%'}
          OR similarity(a.name_arabic, ${search}) > 0.2
          OR similarity(a.name_latin, ${search}) > 0.2
        GROUP BY a.id
        ORDER BY similarity_score DESC, a.name_latin ASC NULLS LAST
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      // Get total count for fuzzy search
      const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT a.id) as count
        FROM authors a
        WHERE
          a.name_arabic ILIKE ${'%' + search + '%'}
          OR a.name_latin ILIKE ${'%' + search + '%'}
          OR similarity(a.name_arabic, ${search}) > 0.2
          OR similarity(a.name_latin, ${search}) > 0.2
      `;

      const total = Number(countResult[0].count);

      // Transform to expected format
      type AuthorRow = typeof authors[number];
      const transformedAuthors = authors.map((a: AuthorRow) => ({
        id: a.id,
        nameArabic: a.name_arabic,
        nameLatin: a.name_latin,
        deathDateHijri: a.death_date_hijri,
        deathDateGregorian: a.death_date_gregorian,
        biography: a.biography,
        _count: { books: Number(a.book_count) },
      }));

      return NextResponse.json({
        authors: transformedAuthors,
        pagination: createPaginationResponse(page, limit, total),
      });
    }

    // No search - use standard Prisma query
    const [authors, total] = await Promise.all([
      prisma.author.findMany({
        skip: offset,
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
      prisma.author.count(),
    ]);

    return NextResponse.json({
      authors,
      pagination: createPaginationResponse(page, limit, total),
    });
  } catch (error) {
    console.error("Error fetching authors:", error);
    return NextResponse.json(
      { error: "Failed to fetch authors" },
      { status: 500 }
    );
  }
}
