"use client";

import { useState, useEffect, useMemo } from "react";
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
  const { t, locale } = useTranslation();
  const { config } = useAppConfig();
  const { dateCalendar, bookTitleDisplay } = config;

  // Track translated titles keyed by book ID
  const [translatedTitles, setTranslatedTitles] = useState<Record<string, string>>({});

  // Compute the bookTitleLang param to pass to API
  const bookTitleLang = useMemo(() => {
    if (bookTitleDisplay === "none" || bookTitleDisplay === "transliteration") return undefined;
    return locale === "ar" ? "en" : locale;
  }, [bookTitleDisplay, locale]);

  // Fetch translated titles when bookTitleDisplay is "translation"
  useEffect(() => {
    if (!bookTitleLang || !metadata?.id) return;

    const fetchTranslations = async () => {
      try {
        const res = await fetch(`/api/authors/${encodeURIComponent(metadata.id)}?bookTitleLang=${encodeURIComponent(bookTitleLang)}`);
        if (!res.ok) return;
        const data = await res.json();
        const titles: Record<string, string> = {};
        for (const book of data.author?.books ?? []) {
          if (book.titleTranslated) {
            titles[book.id] = book.titleTranslated;
          }
        }
        setTranslatedTitles(titles);
      } catch {
        // Silently fail — will fall back to titleLatin
      }
    };

    fetchTranslations();
  }, [bookTitleLang, metadata?.id]);

  // Helper to get secondary title based on display setting
  const getSecondaryTitle = (book: Book): string | null => {
    if (bookTitleDisplay === "none") return null;
    if (bookTitleDisplay === "transliteration") return book.titleLatin;
    return translatedTitles[book.id] || book.titleLatin;
  };

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
      <div className="p-4 md:p-8">
        <PrefetchLink
          href="/authors"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 rtl:scale-x-[-1]" />
          {t("authors.backToAuthors")}
        </PrefetchLink>
        <div className="text-center text-muted-foreground">{t("authors.authorNotFound")}</div>
      </div>
    );
  }


  return (
    <div className="p-4 md:p-8">
      <PrefetchLink
        href="/authors"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
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
        <div className="mb-8 rounded-2xl bg-muted/25 p-6">
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

      <div className="mb-2 text-xs uppercase tracking-wider font-medium text-muted-foreground">
        {t("authors.showingBooks", { count: books.length })}
      </div>

      <div className="overflow-x-auto rounded-lg">
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
              books.map((book) => {
                const secondaryTitle = getSecondaryTitle(book);
                return (
                  <TableRow key={book.id}>
                    <TableCell>
                      <PrefetchLink
                        href={`/reader/${book.id}`}
                        className="font-medium hover:underline"
                      >
                        <div>{book.title}</div>
                        {secondaryTitle && (
                          <div className="text-sm text-muted-foreground">
                            {secondaryTitle}
                          </div>
                        )}
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
                        "\u2014"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

    </div>
  );
}
