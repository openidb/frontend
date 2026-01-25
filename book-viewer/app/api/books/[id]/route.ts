import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/books/:id
 *
 * Fetch a single book by ID with all related data
 *
 * Query parameters:
 * - lang: Language code for book title translation (e.g., "en", "fr")
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const bookId = params.id;
    const searchParams = request.nextUrl.searchParams;
    const lang = searchParams.get("lang");

    if (!bookId) {
      return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
    }

    const bookRaw = await prisma.book.findUnique({
      where: { id: bookId },
      include: {
        author: true,
        category: true,
        publisher: true,
        editor: true,
        keywords: true,
        toc: {
          orderBy: {
            orderIndex: "asc",
          },
        },
        ...(lang && lang !== "none" && lang !== "transliteration"
          ? {
              titleTranslations: {
                where: { language: lang },
                select: { title: true },
                take: 1,
              },
            }
          : {}),
      },
    });

    if (!bookRaw) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Extract titleTranslated from titleTranslations
    const { titleTranslations, ...rest } = bookRaw as typeof bookRaw & {
      titleTranslations?: { title: string }[];
    };

    const book = {
      ...rest,
      titleTranslated: titleTranslations?.[0]?.title || null,
    };

    return NextResponse.json({ book });
  } catch (error) {
    console.error("Error fetching book:", error);
    return NextResponse.json(
      { error: "Failed to fetch book" },
      { status: 500 }
    );
  }
}
