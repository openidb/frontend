import { notFound } from "next/navigation";
import { EpubReader } from "@/components/EpubReader";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface BookMetadata {
  id: string;
  title: string;
  titleLatin: string;
  author: string;
  authorLatin: string;
  datePublished: string;
  filename: string;
}

export async function generateStaticParams() {
  const books = await prisma.book.findMany({
    select: { shamelaBookId: true },
  });

  return books.map((book) => ({
    id: book.shamelaBookId,
  }));
}

export default async function ReaderPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch book from database
  const book = await prisma.book.findUnique({
    where: { shamelaBookId: id },
    include: {
      author: true,
    },
  });

  if (!book) {
    notFound();
  }

  // Transform to expected format
  const bookMetadata: BookMetadata = {
    id: book.shamelaBookId,
    title: book.titleArabic,
    titleLatin: book.titleLatin,
    author: book.author.nameArabic,
    authorLatin: book.author.nameLatin,
    datePublished: book.publicationYearGregorian || "",
    filename: book.filename,
  };

  return <EpubReader bookMetadata={bookMetadata} />;
}
