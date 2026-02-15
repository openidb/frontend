"use client";

import { useState, useEffect, useMemo } from "react";
import { PrefetchLink } from "@/components/PrefetchLink";
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
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
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

interface CategoryItem {
  id: number;
  nameArabic: string;
  nameEnglish: string | null;
  booksCount: number;
}

interface CenturyItem {
  century: number;
  booksCount: number;
}

interface BooksClientProps {
  initialBooks: Book[];
  initialPagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  initialCategories: CategoryItem[];
  initialCenturies: CenturyItem[];
}

// Get year display for a book using centralized utility
function getBookYear(book: Book, showPublicationDates: boolean, calendar: DateCalendar = "both", pubLabel = "(pub.)"): string {
  const result = formatBookYear(book, calendar);
  if (!result.year) return "—";
  if (result.isPublicationYear && !showPublicationDates) return "—";
  return result.isPublicationYear ? `${result.year} ${pubLabel}` : result.year;
}

export default function BooksClient({
  initialBooks,
  initialPagination,
  initialCategories,
  initialCenturies,
}: BooksClientProps) {
  const { t, locale } = useTranslation();
  const { config, isLoaded } = useAppConfig();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [books, setBooks] = useState<Book[]>(initialBooks);
  const [pagination, setPagination] = useState(initialPagination);
  const [loading, setLoading] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCenturies, setSelectedCenturies] = useState<string[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>(initialCategories);
  const [centuries, setCenturies] = useState<CenturyItem[]>(initialCenturies);

  // Extract config values
  const { showPublicationDates, bookTitleDisplay, dateCalendar } = config;

  const effectiveBookTitleDisplay = bookTitleDisplay;

  // Re-fetch facet counts when filters change (interdependent filters)
  useEffect(() => {
    if (selectedCategories.length === 0 && selectedCenturies.length === 0) {
      setCategories(initialCategories);
      setCenturies(initialCenturies);
      return;
    }

    const fetchFacets = async () => {
      const [catRes, cenRes] = await Promise.all([
        // Fetch categories filtered by selected centuries
        selectedCenturies.length > 0
          ? fetch(`/api/categories?flat=true&century=${selectedCenturies.join(",")}`).then((r) => r.json())
          : null,
        // Fetch centuries filtered by selected categories
        selectedCategories.length > 0
          ? fetch(`/api/centuries?categoryId=${selectedCategories.join(",")}`).then((r) => r.json())
          : null,
      ]);

      if (catRes?.categories) {
        setCategories(catRes.categories);
      } else {
        setCategories(initialCategories);
      }

      if (cenRes?.centuries) {
        setCenturies(cenRes.centuries);
      } else {
        setCenturies(initialCenturies);
      }
    };

    fetchFacets().catch(console.error);
  }, [selectedCategories, selectedCenturies, initialCategories, initialCenturies]);

  // Build category options for MultiSelectDropdown (locale-aware via i18n)
  const categoryOptions = useMemo(() =>
    categories.map((c) => ({
      value: c.id.toString(),
      label: t(`categories.${c.id}`),
      count: c.booksCount,
      disabled: c.booksCount === 0,
    })),
    [categories, t]
  );

  // Build century options for MultiSelectDropdown (locale-aware via i18n)
  const centuryOptions = useMemo(() =>
    centuries.map((c) => ({
      value: c.century.toString(),
      label: t(`centuries.${c.century}`),
      count: c.booksCount,
      disabled: c.booksCount === 0,
    })),
    [centuries, t]
  );

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Compute the bookTitleLang param to pass to API (language code or undefined)
  const bookTitleLang = useMemo(() => {
    if (effectiveBookTitleDisplay === "none" || effectiveBookTitleDisplay === "transliteration") return undefined;
    // "translation" → resolve to actual locale code
    return locale === "ar" ? "en" : locale;
  }, [effectiveBookTitleDisplay, locale]);

  // Fetch books from API when search, filters, pagination, or title language changes
  useEffect(() => {
    // No active filters, no translation needed, and on page 1 — use server-provided initial data
    if (debouncedSearch === "" && selectedCategories.length === 0 && selectedCenturies.length === 0 && !bookTitleLang && pagination.page === 1) {
      setBooks(initialBooks);
      setPagination(initialPagination);
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
        if (selectedCategories.length > 0) {
          params.set("categoryId", selectedCategories.join(","));
        }
        if (selectedCenturies.length > 0) {
          params.set("century", selectedCenturies.join(","));
        }
        if (bookTitleLang) {
          params.set("bookTitleLang", bookTitleLang);
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
  }, [pagination.page, pagination.limit, debouncedSearch, selectedCategories, selectedCenturies, bookTitleLang]);

  // Reset to page 1 when search, filters, or title language change
  useEffect(() => {
    if (debouncedSearch !== "" || selectedCategories.length > 0 || selectedCenturies.length > 0 || bookTitleLang) {
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  }, [debouncedSearch, selectedCategories, selectedCenturies, bookTitleLang]);

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

  // Helper to get secondary author name based on showAuthorTransliteration setting
  const getSecondaryAuthorName = (author: Author): string | null => {
    if (!config.showAuthorTransliteration) return null;
    return author.nameLatin;
  };

  // Show loading skeleton until config is loaded
  if (!isLoaded) {
    return (
      <div className="p-4 md:p-8">
        <div className="mb-4 md:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="h-8 w-32 bg-muted animate-shimmer rounded" />
          <div className="h-10 w-64 bg-muted animate-shimmer rounded" />
        </div>
        <div className="space-y-1">
          <div className="h-10 rounded-lg" />
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-14 bg-muted/25 rounded-lg flex items-center gap-4 px-4">
              <div className="h-4 w-48 bg-muted animate-shimmer rounded" />
              <div className="h-4 w-32 bg-muted animate-shimmer rounded" />
              <div className="h-4 w-16 bg-muted animate-shimmer rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 space-y-4">
        <h1 className="text-2xl md:text-3xl font-bold">{t("books.title")}</h1>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/60 p-1.5" suppressHydrationWarning>
          <div className="relative flex-1 min-w-[16rem] rounded-lg ring-1 ring-transparent focus-within:ring-brand/50 focus-within:shadow-[0_0_0_3px_hsl(var(--brand)/0.1)] transition-[box-shadow,ring-color] duration-200">
            <Input
              type="text"
              placeholder={t("books.searchPlaceholder")}
              className="text-base sm:text-sm h-10 rounded-lg border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {categoryOptions.length > 0 && (
            <MultiSelectDropdown
              title={t("books.category")}
              options={categoryOptions}
              selected={selectedCategories}
              onChange={setSelectedCategories}
            />
          )}
          {centuryOptions.length > 0 && (
            <MultiSelectDropdown
              title={t("books.century")}
              options={centuryOptions}
              selected={selectedCenturies}
              onChange={setSelectedCenturies}
            />
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>{t("books.tableHeaders.name")}</TableHead>
              <TableHead className="w-1/4">{t("books.tableHeaders.author")}</TableHead>
              <TableHead className="w-24 md:w-40">{t("books.tableHeaders.year")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(10)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="h-4 w-10 bg-muted animate-shimmer rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-48 bg-muted animate-shimmer rounded mb-2" />
                    <div className="h-3 w-32 bg-muted animate-shimmer rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-32 bg-muted animate-shimmer rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-16 bg-muted animate-shimmer rounded" />
                  </TableCell>
                </TableRow>
              ))
            ) : books.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
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
                    <TableCell className="text-muted-foreground tabular-nums">
                      {book.id}
                    </TableCell>
                    <TableCell className="overflow-hidden">
                      <PrefetchLink
                        href={`/reader/${book.id}`}
                        className="font-medium hover:underline"
                      >
                        <div className="truncate">{book.titleArabic}</div>
                        {secondaryTitle && (
                          <div className="truncate text-sm text-muted-foreground">
                            {secondaryTitle}
                          </div>
                        )}
                      </PrefetchLink>
                    </TableCell>
                    <TableCell className="overflow-hidden">
                      <div className="truncate">{book.author.nameArabic}</div>
                      {secondaryAuthor && (
                        <div className="truncate text-sm text-muted-foreground">
                          {secondaryAuthor}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {getBookYear(book, showPublicationDates, dateCalendar, t("books.publication"))}
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
            <span className="text-sm tabular-nums text-muted-foreground px-2">
              {pagination.page} / {pagination.totalPages}
            </span>
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
