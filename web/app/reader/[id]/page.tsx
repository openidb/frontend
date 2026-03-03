import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchAPI } from "@/lib/api-client";
import { HtmlReader } from "@/components/HtmlReader";

interface BookMetadata {
  id: string;
  title: string;
  titleLatin: string;
  titleTranslated?: string | null;
  author: string;
  authorLatin: string;
  authorId: string;
  datePublished: string;
  filename: string;
  toc: never[];
}

interface TocEntry {
  title: string;
  level: number;
  page: number;
}

interface BookData {
  book: {
    id: string;
    titleArabic: string;
    titleLatin: string;
    titleTranslated?: string | null;
    filename: string;
    totalVolumes: number;
    totalPages: number | null;
    maxPrintedPage: number | null;
    volumeStartPages?: Record<string, number>;
    volumeMaxPrintedPages?: Record<string, number>;
    volumeMinPrintedPages?: Record<string, number>;
    tableOfContents?: TocEntry[] | null;
    translatedLanguages?: string[];
    publicationYearGregorian: string | null;
    author: {
      id: string;
      nameArabic: string;
      nameLatin: string;
    };
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const data = await fetchAPI<BookData>(`/api/books/${encodeURIComponent(id)}`, { revalidate: 3600 });
    const title = data.book?.titleArabic || data.book?.titleLatin || `Book ${id}`;
    return {
      title: `${title} - OpenIDB`,
      description: `Read ${title} by ${data.book?.author?.nameArabic || ""}`,
    };
  } catch {
    return { title: "Reader - OpenIDB" };
  }
}

export default async function ReaderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pn?: string; lang?: string }>;
}) {
  const { id } = await params;
  const { pn, lang } = await searchParams;

  const encodedId = encodeURIComponent(id);
  const initialPage = pn ? parseInt(pn, 10) : 0;
  const langParam = lang && lang !== "none" && lang !== "transliteration" ? `&bookTitleLang=${encodeURIComponent(lang)}` : "";

  // Fetch book metadata and first page in parallel
  const [bookResult, pageResult] = await Promise.allSettled([
    fetchAPI<BookData>(`/api/books/${encodedId}?${langParam}`, { revalidate: 3600 }),
    fetchAPI<{ page: unknown }>(`/api/books/${encodedId}/pages/${initialPage}`, { revalidate: 86400 }),
  ]);

  if (bookResult.status === "rejected") notFound();
  const book = bookResult.value.book;
  if (!book) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialPageData: any = pageResult.status === "fulfilled" ? (pageResult.value.page ?? null) : null;

  const bookMetadata: BookMetadata = {
    id: book.id,
    title: book.titleArabic,
    titleLatin: book.titleLatin,
    titleTranslated: book.titleTranslated || null,
    author: book.author.nameArabic,
    authorLatin: book.author.nameLatin,
    authorId: book.author.id,
    datePublished: book.publicationYearGregorian || "",
    filename: book.filename,
    toc: [],
  };

  return (
    <HtmlReader
      bookMetadata={bookMetadata}
      initialPageNumber={pn}
      initialPageData={initialPageData}
      totalPages={book.totalPages || 0}
      totalVolumes={book.totalVolumes || 1}
      maxPrintedPage={book.maxPrintedPage ?? book.totalPages ?? 0}
      volumeStartPages={book.volumeStartPages || {}}
      volumeMaxPrintedPages={book.volumeMaxPrintedPages || {}}
      volumeMinPrintedPages={book.volumeMinPrintedPages || {}}
      toc={book.tableOfContents || []}
      translatedLanguages={book.translatedLanguages}
    />
  );
}
