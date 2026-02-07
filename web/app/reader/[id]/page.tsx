import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { EpubReader } from "@/components/EpubReader";
import { prisma } from "@/lib/db";

interface BookMetadata {
  id: string;
  title: string;
  titleLatin: string;
  titleTranslated?: string | null;
  author: string;
  authorLatin: string;
  datePublished: string;
  filename: string;
  toc: never[];
}

// Cache book metadata (without language-specific translations)
const getBookMetadata = unstable_cache(
  async (id: string) => {
    return prisma.book.findUnique({
      where: { id },
      include: {
        author: true,
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
    toc: [],
  };

  return <EpubReader bookMetadata={bookMetadata} initialPage={page} initialPageNumber={pn} />;
}
