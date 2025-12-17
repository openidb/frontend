"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Calendar, BookOpen } from "lucide-react";

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

interface AuthorDetailClientProps {
  authorName: string;
  authorLatin: string;
  books: Book[];
  metadata?: AuthorMetadata;
}

// Helper function to convert Arabic numerals to Western numerals
function arabicToWestern(str: string): string {
  if (!str) return str;
  return str
    .replace(/٠/g, '0')
    .replace(/١/g, '1')
    .replace(/٢/g, '2')
    .replace(/٣/g, '3')
    .replace(/٤/g, '4')
    .replace(/٥/g, '5')
    .replace(/٦/g, '6')
    .replace(/٧/g, '7')
    .replace(/٨/g, '8')
    .replace(/٩/g, '9');
}

export default function AuthorDetailClient({
  authorName,
  authorLatin,
  books,
  metadata,
}: AuthorDetailClientProps) {
  // Get author's death year for display - returns both CE and AH if available
  const getAuthorDeathYear = (): { gregorian: string | null; hijri: string | null } | null => {
    if (!metadata) return null;

    const gregorian = metadata.death_date_gregorian
      ? arabicToWestern(metadata.death_date_gregorian)
      : null;

    const hijri = metadata.death_date_hijri
      ? arabicToWestern(metadata.death_date_hijri)
      : null;

    // Return null only if both are missing
    if (!gregorian && !hijri) return null;

    return { gregorian, hijri };
  };

  const authorDeathYear = getAuthorDeathYear();
  if (books.length === 0) {
    return (
      <div className="p-8">
        <Link
          href="/authors"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Authors
        </Link>
        <div className="text-center text-muted-foreground">Author not found</div>
      </div>
    );
  }


  return (
    <div className="p-8">
      <Link
        href="/authors"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Authors
      </Link>

      <div className="mb-6" dir="rtl">
        <h1 className="text-3xl font-bold">{authorName}</h1>
        <p className="text-lg text-muted-foreground">{authorLatin}</p>
      </div>

      {/* Author Biographical Information */}
      {metadata && (
        <div className="mb-8 rounded-lg border bg-card p-6 text-card-foreground">
          {/* Dates and Stats */}
          <div className="mb-4 flex flex-wrap gap-6 text-sm" dir="rtl">
            {(metadata.birth_date_hijri || metadata.death_date_hijri) && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {metadata.birth_date_hijri && `${metadata.birth_date_hijri}`}
                  {metadata.birth_date_hijri && metadata.death_date_hijri && ' - '}
                  {metadata.death_date_hijri && `${metadata.death_date_hijri} هـ`}
                  {(metadata.birth_date_gregorian || metadata.death_date_gregorian) && (
                    <span className="mx-2">/</span>
                  )}
                  {metadata.birth_date_gregorian && `${metadata.birth_date_gregorian}`}
                  {metadata.birth_date_gregorian && metadata.death_date_gregorian && ' - '}
                  {metadata.death_date_gregorian && `${metadata.death_date_gregorian} م`}
                </span>
              </div>
            )}

            {metadata.books_count && (
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {metadata.books_count} {metadata.books_count === 1 ? 'كتاب' : 'كتب'}
                </span>
              </div>
            )}
          </div>

          {/* Biography Text */}
          {metadata.biography && (
            <div>
              <div className="whitespace-pre-line text-sm leading-relaxed" dir="rtl">
                {metadata.biography}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Year</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {books.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  No books found
                </TableCell>
              </TableRow>
            ) : (
              books.map((book) => (
                <TableRow key={book.id}>
                  <TableCell>
                    <Link
                      href={`/reader/${book.id}`}
                      className="font-medium hover:underline"
                    >
                      <div>{book.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {book.titleLatin}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    {authorDeathYear ? (
                      <>
                        {authorDeathYear.gregorian && `${authorDeathYear.gregorian} CE`}
                        {authorDeathYear.gregorian && authorDeathYear.hijri && ' / '}
                        {authorDeathYear.hijri && `${authorDeathYear.hijri} AH`}
                      </>
                    ) : book.datePublished && book.datePublished !== "TEST" ? (
                      book.datePublished
                    ) : book.yearAH && book.yearAH > 0 ? (
                      `${book.yearAH} AH`
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 text-sm text-muted-foreground">
        Showing {books.length} books
      </div>
    </div>
  );
}
