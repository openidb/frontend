import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/authors/:name
 *
 * Fetch author by Latin name with their books
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  const limited = rateLimit(request, "general");
  if (limited) return limited;

  try {
    const params = await context.params;
    const authorName = decodeURIComponent(params.name);

    const author = await prisma.author.findUnique({
      where: { nameLatin: authorName },
      include: {
        books: {
          include: {
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
        },
        _count: {
          select: { books: true },
        },
      },
    });

    if (!author) {
      return NextResponse.json({ error: "Author not found" }, { status: 404 });
    }

    return NextResponse.json({ author });
  } catch (error) {
    console.error("Error fetching author:", error);
    return NextResponse.json(
      { error: "Failed to fetch author" },
      { status: 500 }
    );
  }
}
