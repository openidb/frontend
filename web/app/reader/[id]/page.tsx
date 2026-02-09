import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchAPI } from "@/lib/api-client";
import { EpubReader } from "@/components/EpubReader";

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

interface BookData {
  book: {
    id: string;
    titleArabic: string;
    titleLatin: string;
    titleTranslated?: string | null;
    filename: string;
    publicationYearGregorian: string | null;
    author: {
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
    const data = await fetchAPI<BookData>(`/api/books/${id}`);
    const title = data.book?.titleArabic || data.book?.titleLatin || `Book ${id}`;
    return {
      title: `${title} - Sanad`,
      description: `Read ${title} by ${data.book?.author?.nameArabic || ""}`,
    };
  } catch {
    return { title: "Reader - Sanad" };
  }
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

  let bookData: BookData;
  try {
    const langParam = lang && lang !== "none" && lang !== "transliteration" ? `&lang=${lang}` : "";
    bookData = await fetchAPI<BookData>(`/api/books/${id}?${langParam}`);
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
    datePublished: book.publicationYearGregorian || "",
    filename: book.filename,
    toc: [],
  };

  return <EpubReader bookMetadata={bookMetadata} initialPage={page} initialPageNumber={pn} />;
}
