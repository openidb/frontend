import { notFound } from "next/navigation";
import { EpubReader } from "@/components/EpubReader";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface TocEntry {
  id: number;
  chapterTitle: string;
  pageNumber: number;
  volumeNumber: number;
  orderIndex: number;
  parentId: number | null;
}

interface BookMetadata {
  id: string;
  title: string;
  titleLatin: string;
  titleTranslated?: string | null;
  author: string;
  authorLatin: string;
  datePublished: string;
  filename: string;
  toc: TocEntry[];
}

export default async function ReaderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; pn?: string; lang?: string }>;
}) {
  const { id } = await params;
  const { page, pn, lang } = await searchParams;

  // Fetch book from database with TOC and optional title translation
  let book;
  try {
    book = await prisma.book.findUnique({
      where: { id },
      include: {
        author: true,
        toc: {
          orderBy: { orderIndex: "asc" },
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
  } catch (error) {
    console.error("Failed to fetch book:", error);
    notFound();
  }

  if (!book) {
    notFound();
  }

  // Extract title translation
  const bookWithTranslations = book as typeof book & {
    titleTranslations?: { title: string }[];
  };
  const titleTranslated = bookWithTranslations.titleTranslations?.[0]?.title || null;

  // Map TOC entries
  const toc: TocEntry[] = book.toc.map((entry) => ({
    id: entry.id,
    chapterTitle: entry.chapterTitle,
    pageNumber: entry.pageNumber,
    volumeNumber: entry.volumeNumber,
    orderIndex: entry.orderIndex,
    parentId: entry.parentId,
  }));

  // Transform to expected format
  const bookMetadata: BookMetadata = {
    id: book.id,
    title: book.titleArabic,
    titleLatin: book.titleLatin,
    titleTranslated,
    author: book.author.nameArabic,
    authorLatin: book.author.nameLatin,
    datePublished: book.publicationYearGregorian || "",
    filename: book.filename,
    toc,
  };

  return <EpubReader bookMetadata={bookMetadata} initialPage={page} initialPageNumber={pn} />;
}
