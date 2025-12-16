import catalog from "@/lib/catalog.json";
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

export async function generateStaticParams() {
  const books = catalog as Book[];
  const authors = new Set(books.map((book) => book.authorLatin));

  return Array.from(authors).map((authorLatin) => ({
    name: encodeURIComponent(authorLatin),
  }));
}

export default async function AuthorDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const authorLatinParam = decodeURIComponent(name);
  const books = (catalog as Book[]).filter((book) => book.authorLatin === authorLatinParam);
  const authorName = books.length > 0 ? books[0].author : "";
  const authorLatin = books.length > 0 ? books[0].authorLatin : "";

  return <AuthorDetailClient authorName={authorName} authorLatin={authorLatin} books={books} />;
}
