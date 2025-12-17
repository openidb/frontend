import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/categories
 *
 * Fetch all categories with book counts
 */
export async function GET(request: NextRequest) {
  try {
    const categories = await prisma.category.findMany({
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

    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}
