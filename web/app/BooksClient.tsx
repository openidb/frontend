"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { formatBookYear, getBookCentury, getCenturyLabel, type DateCalendar } from "@/lib/dates";
import { useAppConfig, TranslationDisplayOption } from "@/lib/config";
import { useTranslation } from "@/lib/i18n";

interface Author {
  id: string;
  nameArabic: string;
  nameLatin: string;
  deathDateHijri: string | null;
  deathDateGregorian: string | null;
}

interface Category {
  id: number;
  nameArabic: string;
  nameEnglish: string | null;
}

interface Book {
  id: string;
  titleArabic: string;
  titleLatin: string;
  titleTranslated?: string | null;
  filename: string;
  timePeriod: string | null;
  publicationYearHijri: string | null;
  publicationYearGregorian: string | null;
  author: Author;
  category: Category | null;
}

interface BooksClientProps {
  books: Book[];
}

// Get year display for a book using centralized utility
function getBookYear(book: Book, showPublicationDates: boolean, calendar: DateCalendar = "both"): string {
  const result = formatBookYear(book, calendar);
  if (!result.year) return "—";
  if (result.isPublicationYear && !showPublicationDates) return "—";
  return result.isPublicationYear ? `${result.year} (pub.)` : result.year;
}

// Cache key for translated books
const BOOKS_CACHE_KEY = "booksCache";

export default function BooksClient({ books: initialBooks }: BooksClientProps) {
  const { t, locale } = useTranslation();
  const { config, isLoaded } = useAppConfig();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCenturies, setSelectedCenturies] = useState<string[]>([]);
  const [books, setBooks] = useState<Book[]>(initialBooks);

  // Extract config values
  const { showPublicationDates, bookTitleDisplay, autoTranslation, dateCalendar } = config;

  // Get effective book title display setting (auto defaults to transliteration)
  const effectiveBookTitleDisplay = useMemo(() => {
    if (autoTranslation) {
      return "transliteration";
    }
    return bookTitleDisplay;
  }, [autoTranslation, bookTitleDisplay]);

  // Fetch books with translations when display setting changes to a language
  useEffect(() => {
    if (!isLoaded) return;

    const fetchBooksWithTranslations = async () => {
      if (effectiveBookTitleDisplay === "none" || effectiveBookTitleDisplay === "transliteration") {
        setBooks(initialBooks);
        return;
      }

      // Check sessionStorage cache first
      const cacheKey = `${BOOKS_CACHE_KEY}_${effectiveBookTitleDisplay}`;
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const cachedBooks = JSON.parse(cached);
          setBooks(cachedBooks);
          return;
        }
      } catch {
        // Cache read failed, continue to fetch
      }

      try {
        const response = await fetch(`/api/books?bookTitleLang=${effectiveBookTitleDisplay}&limit=1000`);
        if (response.ok) {
          const data = await response.json();
          setBooks(data.books);
          // Cache the result
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(data.books));
          } catch {
            // Cache write failed, ignore
          }
        }
      } catch (error) {
        console.error("Failed to fetch book translations:", error);
      }
    };

    fetchBooksWithTranslations();
  }, [effectiveBookTitleDisplay, initialBooks, isLoaded]);

  // Helper to get secondary title based on display setting
  const getSecondaryTitle = (book: Book): string | null => {
    if (effectiveBookTitleDisplay === "none") {
      return null;
    }
    if (effectiveBookTitleDisplay === "transliteration") {
      return book.titleLatin;
    }
    // For language translations, use titleTranslated or fall back to titleLatin
    return book.titleTranslated || book.titleLatin;
  };

  // Helper to get secondary author name based on display setting
  const getSecondaryAuthorName = (author: Author): string | null => {
    if (effectiveBookTitleDisplay === "none") {
      return null;
    }
    // For now, always show Latin transliteration for author (no author translations yet)
    return author.nameLatin;
  };

  // Get all unique categories (for stable option list)
  const allCategories = useMemo(() => {
    const categories = new Set<string>();
    books.forEach((book) => {
      if (book.category) {
        categories.add(book.category.nameArabic);
      }
    });
    return Array.from(categories).sort();
  }, [books]);

  // Get all unique centuries (for stable option list)
  const allCenturies = useMemo(() => {
    const centuries = new Set<number>();
    books.forEach((book) => {
      const century = getBookCentury(book);
      if (century) {
        centuries.add(century);
      }
    });
    return Array.from(centuries).sort((a, b) => a - b);
  }, [books]);

  // Category options with counts filtered by selected centuries
  const categoryOptions = useMemo(() => {
    const counts: Record<string, number> = {};

    // Initialize all categories with 0
    allCategories.forEach((cat) => {
      counts[cat] = 0;
    });

    // Count books matching selected centuries (or all if none selected)
    books.forEach((book) => {
      if (!book.category) return;

      const bookCentury = getBookCentury(book);
      const matchesCentury =
        selectedCenturies.length === 0 ||
        (bookCentury && selectedCenturies.includes(bookCentury.toString()));

      if (matchesCentury) {
        counts[book.category.nameArabic] = (counts[book.category.nameArabic] || 0) + 1;
      }
    });

    return allCategories.map((category) => ({
      value: category,
      label: category,
      count: counts[category],
      disabled: counts[category] === 0,
    }));
  }, [books, allCategories, selectedCenturies]);

  // Century options with counts filtered by selected categories
  const centuryOptions = useMemo(() => {
    const counts: Record<number, number> = {};

    // Initialize all centuries with 0
    allCenturies.forEach((century) => {
      counts[century] = 0;
    });

    // Count books matching selected categories (or all if none selected)
    books.forEach((book) => {
      const century = getBookCentury(book);
      if (!century) return;

      const matchesCategory =
        selectedCategories.length === 0 ||
        (book.category && selectedCategories.includes(book.category.nameArabic));

      if (matchesCategory) {
        counts[century] = (counts[century] || 0) + 1;
      }
    });

    return allCenturies.map((century) => {
      const labels = getCenturyLabel(century);
      return {
        value: labels.value,
        label: labels.label,
        labelArabic: labels.labelArabic,
        count: counts[century],
        disabled: counts[century] === 0,
        sortKey: century,
      };
    });
  }, [books, allCenturies, selectedCategories]);

  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        book.titleArabic.toLowerCase().includes(query) ||
        book.titleLatin.toLowerCase().includes(query) ||
        book.author.nameArabic.toLowerCase().includes(query) ||
        book.author.nameLatin.toLowerCase().includes(query);

      const matchesCategory =
        selectedCategories.length === 0 ||
        (book.category &&
          selectedCategories.includes(book.category.nameArabic));

      const bookCentury = getBookCentury(book);
      const matchesCentury =
        selectedCenturies.length === 0 ||
        (bookCentury && selectedCenturies.includes(bookCentury.toString()));

      return matchesSearch && matchesCategory && matchesCentury;
    });
  }, [books, searchQuery, selectedCategories, selectedCenturies]);

  // Show loading skeleton until config is loaded to prevent flicker
  if (!isLoaded) {
    return (
      <div className="p-4 md:p-8">
        <div className="mb-4 md:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
          <div className="h-10 w-64 bg-muted animate-pulse rounded" />
        </div>
        <div className="rounded-md border">
          <div className="h-12 bg-muted/50 border-b" />
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-16 border-b flex items-center gap-4 px-4">
              <div className="h-4 w-48 bg-muted animate-pulse rounded" />
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              <div className="h-4 w-16 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-4 md:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">{t("books.title")}</h1>
        <div className="flex items-center gap-2 md:gap-3" suppressHydrationWarning>
          <div className="hidden min-[896px]:flex items-center gap-3">
            <MultiSelectDropdown
              title={t("books.category")}
              options={categoryOptions}
              selected={selectedCategories}
              onChange={setSelectedCategories}
            />
            <MultiSelectDropdown
              title={t("books.century")}
              options={centuryOptions}
              selected={selectedCenturies}
              onChange={setSelectedCenturies}
            />
          </div>
          <Input
            type="text"
            placeholder={t("books.searchPlaceholder")}
            className="w-full sm:w-64 text-base sm:text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("books.tableHeaders.name")}</TableHead>
              <TableHead>{t("books.tableHeaders.author")}</TableHead>
              <TableHead>{t("books.tableHeaders.year")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBooks.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center text-muted-foreground"
                >
                  {t("books.noBooks")}
                </TableCell>
              </TableRow>
            ) : (
              filteredBooks.map((book) => {
                const secondaryTitle = getSecondaryTitle(book);
                const secondaryAuthor = getSecondaryAuthorName(book.author);
                return (
                  <TableRow key={book.id}>
                    <TableCell>
                      <Link
                        href={`/reader/${book.id}`}
                        className="font-medium hover:underline"
                      >
                        <div>{book.titleArabic}</div>
                        {secondaryTitle && (
                          <div className="text-sm text-muted-foreground">
                            {secondaryTitle}
                          </div>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>{book.author.nameArabic}</div>
                      {secondaryAuthor && (
                        <div className="text-sm text-muted-foreground">
                          {secondaryAuthor}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {getBookYear(book, showPublicationDates, dateCalendar)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 text-sm text-muted-foreground">
        {t("books.showing", { count: filteredBooks.length, total: books.length })}
      </div>
    </div>
  );
}
