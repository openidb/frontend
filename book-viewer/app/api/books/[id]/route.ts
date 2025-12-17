import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/books/:id
 *
 * Fetch a single book by ID with all related data
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const bookId = parseInt(params.id);

    if (isNaN(bookId)) {
      return NextResponse.json({ error: "Invalid book ID" }, { status: 400 });
    }

    const book = await prisma.book.findUnique({
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
      },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    return NextResponse.json({ book });
  } catch (error) {
    console.error("Error fetching book:", error);
    return NextResponse.json(
      { error: "Failed to fetch book" },
      { status: 500 }
    );
  }
}
