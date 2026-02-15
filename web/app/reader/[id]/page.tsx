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
    tableOfContents?: TocEntry[] | null;
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
    const data = await fetchAPI<BookData>(`/api/books/${encodeURIComponent(id)}`);
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

  let bookData: BookData;
  try {
    const langParam = lang && lang !== "none" && lang !== "transliteration" ? `&bookTitleLang=${encodeURIComponent(lang)}` : "";
    bookData = await fetchAPI<BookData>(`/api/books/${encodeURIComponent(id)}?${langParam}`);
  } catch {
    notFound();
  }

  const book = bookData.book;
  if (!book) notFound();

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
      totalPages={book.totalPages || 0}
      totalVolumes={book.totalVolumes || 1}
      maxPrintedPage={book.maxPrintedPage ?? book.totalPages ?? 0}
      toc={book.tableOfContents || []}
    />
  );
}
