import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

const getCategories = unstable_cache(
  async () => {
    return prisma.category.findMany({
      include: {
        _count: {
          select: { books: true },
        },
        parent: {
          select: {
            id: true,
            nameArabic: true,
            nameEnglish: true,
          },
        },
        children: {
          select: {
            id: true,
            nameArabic: true,
            nameEnglish: true,
          },
        },
      },
      orderBy: {
        nameArabic: "asc",
      },
    });
  },
  ["categories"],
  { revalidate: 86400 } // 24 hours
);

/**
 * GET /api/categories
 *
 * Fetch all categories with book counts
 */
export async function GET(request: NextRequest) {
  const limited = rateLimit(request, "general");
  if (limited) return limited;

  try {
    const categories = await getCategories();

    return NextResponse.json(
      { categories },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}
