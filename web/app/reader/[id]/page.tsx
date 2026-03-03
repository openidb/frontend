import type { Metadata } from "next";
import { cookies } from "next/headers";
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
    const data = await fetchAPI<BookData>(`/api/books/${encodeURIComponent(id)}`, { revalidate: 86400 });
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

  // Check if user has translation enabled via cookie
  const cookieStore = await cookies();
  const translationEnabled = cookieStore.get("reader-translation")?.value === "1";
  const localeCookie = cookieStore.get("locale")?.value || cookieStore.get("detected-locale")?.value || "en";
  const translationLang = localeCookie === "ar" ? "en" : localeCookie;

  // Fetch book metadata, first page, TOC, and translation (if enabled) in parallel
  // Book content is static — use long/indefinite revalidation
  const bookUrl = langParam ? `/api/books/${encodedId}?${langParam}` : `/api/books/${encodedId}`;
  const bookPromise = fetchAPI<BookData>(bookUrl, { revalidate: 86400 });
  const pagePromise = fetchAPI<{ page: unknown }>(`/api/books/${encodedId}/pages/${initialPage}`, { revalidate: false });
  const tocPromise = fetchAPI<{ toc: TocEntry[] }>(`/api/books/${encodedId}/toc`, { revalidate: false });
  const translationPromise = translationEnabled
    ? fetchAPI<{ paragraphs: { index: number; translation: string }[] }>(
        `/api/books/${encodedId}/pages/${initialPage}/translation?lang=${encodeURIComponent(translationLang)}`,
        { revalidate: 3600 }
      ).catch(() => null)
    : null;

  const [bookResult, pageResult, tocResult] = await Promise.allSettled([bookPromise, pagePromise, tocPromise]);

  if (bookResult.status === "rejected") notFound();
  const book = bookResult.value.book;
  if (!book) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initialPageData: any = pageResult.status === "fulfilled" ? (pageResult.value.page ?? null) : null;
  const initialToc: TocEntry[] = tocResult.status === "fulfilled" ? (tocResult.value.toc ?? []) : [];

  // Await translation (already running in parallel, just resolve the result)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const translationData: any = translationPromise ? await translationPromise : null;
  const initialTranslationData = translationData?.paragraphs ?? null;

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
  };

  return (
    <HtmlReader
      bookMetadata={bookMetadata}
      initialPageNumber={pn}
      initialPageData={initialPageData}
      initialTranslationData={initialTranslationData}
      totalPages={book.totalPages || 0}
      totalVolumes={book.totalVolumes || 1}
      maxPrintedPage={book.maxPrintedPage ?? book.totalPages ?? 0}
      volumeStartPages={book.volumeStartPages || {}}
      volumeMaxPrintedPages={book.volumeMaxPrintedPages || {}}
      volumeMinPrintedPages={book.volumeMinPrintedPages || {}}
      toc={initialToc}
      translatedLanguages={book.translatedLanguages}
    />
  );
}
