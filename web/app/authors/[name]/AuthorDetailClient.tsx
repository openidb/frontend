"use client";

import { PrefetchLink } from "@/components/PrefetchLink";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Calendar } from "lucide-react";
import { formatAuthorDates, formatYear } from "@/lib/dates";
import { useTranslation } from "@/lib/i18n";
import { useAppConfig } from "@/lib/config";

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
  id: string;
  nameArabic: string;
  nameLatin: string;
  deathDateHijri?: string;
  birthDateHijri?: string;
  deathDateGregorian?: string;
  birthDateGregorian?: string;
  biography?: string;
  biographySource?: string;
  booksCount?: number;
}

interface AuthorDetailClientProps {
  authorName: string;
  authorLatin: string;
  books: Book[];
  metadata?: AuthorMetadata;
}

export default function AuthorDetailClient({
  authorName,
  authorLatin,
  books,
  metadata,
}: AuthorDetailClientProps) {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const { dateCalendar } = config;

  // Format author death year using centralized utility
  const authorDeathYearDisplay = metadata
    ? formatYear(metadata.deathDateHijri, metadata.deathDateGregorian, dateCalendar)
    : "";

  // Format full author date range for display
  const authorDatesDisplay = metadata
    ? formatAuthorDates({
        birthDateHijri: metadata.birthDateHijri,
        deathDateHijri: metadata.deathDateHijri,
        birthDateGregorian: metadata.birthDateGregorian,
        deathDateGregorian: metadata.deathDateGregorian,
      }, { calendar: dateCalendar })
    : "";
  if (books.length === 0) {
    return (
      <div className="p-8">
        <PrefetchLink
          href="/authors"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 rtl:scale-x-[-1]" />
          {t("authors.backToAuthors")}
        </PrefetchLink>
        <div className="text-center text-muted-foreground">{t("authors.authorNotFound")}</div>
      </div>
    );
  }


  return (
    <div className="p-8">
      <PrefetchLink
        href="/authors"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:scale-x-[-1]" />
        {t("authors.backToAuthors")}
      </PrefetchLink>

      <div className="mb-6" dir="rtl">
        <h1 className="text-3xl font-bold">{authorName}</h1>
        {config.showAuthorTransliteration && (
          <p className="text-lg text-muted-foreground">{authorLatin}</p>
        )}
      </div>

      {/* Author Biographical Information */}
      {metadata && (
        <div className="mb-8 rounded-lg border bg-card p-6 text-card-foreground">
          {/* Dates and Stats */}
          <div className="mb-4 flex flex-wrap gap-6 text-sm" dir="rtl">
            {authorDatesDisplay && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground" dir="ltr">
                  {authorDatesDisplay}
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
              <TableHead>{t("books.tableHeaders.name")}</TableHead>
              <TableHead>{t("books.tableHeaders.year")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {books.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  {t("books.noBooks")}
                </TableCell>
              </TableRow>
            ) : (
              books.map((book) => (
                <TableRow key={book.id}>
                  <TableCell>
                    <PrefetchLink
                      href={`/reader/${book.id}`}
                      className="font-medium hover:underline"
                    >
                      <div>{book.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {book.titleLatin}
                      </div>
                    </PrefetchLink>
                  </TableCell>
                  <TableCell>
                    {authorDeathYearDisplay ? (
                      authorDeathYearDisplay
                    ) : book.datePublished && book.datePublished !== "TEST" ? (
                      `${book.datePublished} (pub.)`
                    ) : book.yearAH && book.yearAH > 0 ? (
                      `${book.yearAH} AH (pub.)`
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
        {t("authors.showingBooks", { count: books.length })}
      </div>
    </div>
  );
}
