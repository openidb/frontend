"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBookYear, type DateCalendar } from "@/lib/dates";
import { useAppConfig } from "@/lib/config";
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
  initialBooks: Book[];
  initialPagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Get year display for a book using centralized utility
function getBookYear(book: Book, showPublicationDates: boolean, calendar: DateCalendar = "both"): string {
  const result = formatBookYear(book, calendar);
  if (!result.year) return "—";
  if (result.isPublicationYear && !showPublicationDates) return "—";
  return result.isPublicationYear ? `${result.year} (pub.)` : result.year;
}

export default function BooksClient({ initialBooks, initialPagination }: BooksClientProps) {
  const { t } = useTranslation();
  const { config, isLoaded } = useAppConfig();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [books, setBooks] = useState<Book[]>(initialBooks);
  const [pagination, setPagination] = useState(initialPagination);
  const [loading, setLoading] = useState(false);

  // Extract config values
  const { showPublicationDates, bookTitleDisplay, autoTranslation, dateCalendar } = config;

  // Get effective book title display setting (auto defaults to transliteration)
  const effectiveBookTitleDisplay = useMemo(() => {
    if (autoTranslation) {
      return "transliteration";
    }
    return bookTitleDisplay;
  }, [autoTranslation, bookTitleDisplay]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch books from API when search or pagination changes
  useEffect(() => {
    // Skip initial render with no search
    if (debouncedSearch === "" && pagination.page === 1) {
      return;
    }

    const fetchBooks = async () => {
      setLoading(true);
      try {
        const offset = (pagination.page - 1) * pagination.limit;
        const params = new URLSearchParams({
          offset: offset.toString(),
          limit: pagination.limit.toString(),
        });
        if (debouncedSearch) {
          params.set("search", debouncedSearch);
        }

        const response = await fetch(`/api/books?${params}`);
        const data = await response.json();

        setBooks(data.books || []);
        const resTotal = data.total || 0;
        const resLimit = data.limit || pagination.limit;
        const resOffset = data.offset || 0;
        setPagination({
          page: Math.floor(resOffset / resLimit) + 1,
          limit: resLimit,
          total: resTotal,
          totalPages: Math.ceil(resTotal / resLimit),
        });
      } catch (error) {
        console.error("Error fetching books:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
  }, [pagination.page, pagination.limit, debouncedSearch]);

  // Reset to page 1 when search changes
  useEffect(() => {
    if (debouncedSearch !== "") {
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  }, [debouncedSearch]);

  const handlePrevPage = () => {
    if (pagination.page > 1) {
      setPagination((prev) => ({ ...prev, page: prev.page - 1 }));
    }
  };

  const handleNextPage = () => {
    if (pagination.page < pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page: prev.page + 1 }));
    }
  };

  // Helper to get secondary title based on display setting
  const getSecondaryTitle = (book: Book): string | null => {
    if (effectiveBookTitleDisplay === "none") return null;
    if (effectiveBookTitleDisplay === "transliteration") return book.titleLatin;
    return book.titleTranslated || book.titleLatin;
  };

  // Helper to get secondary author name based on display setting
  const getSecondaryAuthorName = (author: Author): string | null => {
    if (effectiveBookTitleDisplay === "none") return null;
    return author.nameLatin;
  };

  // Show loading skeleton until config is loaded
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
            {loading ? (
              [...Array(10)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="h-4 w-48 bg-muted animate-pulse rounded mb-2" />
                    <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                  </TableCell>
                </TableRow>
              ))
            ) : books.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center text-muted-foreground"
                >
                  {t("books.noBooks")}
                </TableCell>
              </TableRow>
            ) : (
              books.map((book) => {
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

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {t("books.showing", { count: books.length, total: pagination.total })}
          {pagination.totalPages > 1 && (
            <span> {t("books.pagination", { page: pagination.page, totalPages: pagination.totalPages })}</span>
          )}
        </div>
        {pagination.totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={pagination.page === 1}
            >
              {t("books.previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={pagination.page === pagination.totalPages}
            >
              {t("books.next")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
