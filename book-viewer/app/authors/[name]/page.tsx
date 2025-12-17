import catalogData from "@/lib/catalog.json";
import authorsMetadata from "@/lib/authors-metadata.json";
import AuthorDetailClient from "./AuthorDetailClient";

interface Book {
  id: string;
  title: string;
  titleLatin: string;
  author: string;
  authorLatin: string;
  datePublished: string;
  filename: string;
  category: string;
  subcategory?: string | null;
  yearAH: number;
  timePeriod: string;
}

interface AuthorMetadata {
  name_arabic: string;
  name_latin: string;
  shamela_author_id?: string;
  death_date_hijri?: string;
  birth_date_hijri?: string;
  death_date_gregorian?: string;
  birth_date_gregorian?: string;
  biography?: string;
  biography_source?: string;
  books_count?: number;
}

export async function generateStaticParams() {
  const catalog = catalogData as Book[];
  const authors = new Set(catalog.map((book) => book.authorLatin));

  return Array.from(authors).map((author) => ({
    name: encodeURIComponent(author),
  }));
}

export default async function AuthorDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const authorLatin = decodeURIComponent(name);
  const catalog = catalogData as Book[];
  const books = catalog.filter((book) => book.authorLatin === authorLatin);

  // Load author metadata if available (keyed by Latin name)
  const metadata = (authorsMetadata as Record<string, AuthorMetadata>)[authorLatin];
  const authorName = metadata?.name_arabic || books[0]?.author || authorLatin;

  return (
    <AuthorDetailClient
      authorName={authorName}
      authorLatin={authorLatin}
      books={books}
      metadata={metadata}
    />
  );
}
