import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { EpubReader } from "@/components/EpubReader";
import { prisma } from "@/lib/db";

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

// Cache book metadata (without language-specific translations)
const getBookMetadata = unstable_cache(
  async (id: string) => {
    return prisma.book.findUnique({
      where: { id },
      include: {
        author: true,
        toc: {
          orderBy: { orderIndex: "asc" },
        },
      },
    });
  },
  ["book-metadata"],
  { revalidate: 86400 } // 24 hours
);

// Fetch title translation separately (not cached due to language parameter)
async function getTitleTranslation(bookId: string, lang: string) {
  if (!lang || lang === "none" || lang === "transliteration") {
    return null;
  }

  const translation = await prisma.bookTitleTranslation.findFirst({
    where: { bookId, language: lang },
    select: { title: true },
  });

  return translation?.title || null;
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

  // Fetch book metadata from cache
  let book;
  try {
    book = await getBookMetadata(id);
  } catch (error) {
    console.error("Failed to fetch book:", error);
    notFound();
  }

  if (!book) {
    notFound();
  }

  // Fetch title translation separately if needed
  const titleTranslated = lang ? await getTitleTranslation(id, lang) : null;

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
