"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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

interface FeatureCounts {
  hasPdf: number;
  isIndexed: number;
  isTranslated: number;
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
  const { config } = useAppConfig();

  // Restore persisted filter state from sessionStorage
  const saved = useRef<{ search: string; categories: string[]; centuries: string[]; features: string[]; page: number } | null>(null);
  if (saved.current === null) {
    try {
      const raw = sessionStorage.getItem("books_filters");
      if (raw) saved.current = JSON.parse(raw);
    } catch {}
    if (!saved.current) saved.current = { search: "", categories: [], centuries: [], features: [], page: 1 };
  }

  const [searchQuery, setSearchQuery] = useState(saved.current.search);
  const [debouncedSearch, setDebouncedSearch] = useState(saved.current.search);
  const [books, setBooks] = useState<Book[]>(initialBooks);
  const [pagination, setPagination] = useState({ ...initialPagination, page: saved.current.page });
  const [loading, setLoading] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(saved.current.categories);
  const [selectedCenturies, setSelectedCenturies] = useState<string[]>(saved.current.centuries);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(saved.current.features);
  const [categories, setCategories] = useState<CategoryItem[]>(initialCategories);
  const [centuries, setCenturies] = useState<CenturyItem[]>(initialCenturies);
  const [featureCounts, setFeatureCounts] = useState<FeatureCounts>({ hasPdf: 0, isIndexed: 0, isTranslated: 0 });

  // Persist filter state to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem("books_filters", JSON.stringify({
        search: searchQuery,
        categories: selectedCategories,
        centuries: selectedCenturies,
        features: selectedFeatures,
        page: pagination.page,
      }));
    } catch {}
  }, [searchQuery, selectedCategories, selectedCenturies, selectedFeatures, pagination.page]);

  // Extract config values
  const { showPublicationDates, bookTitleDisplay, dateCalendar } = config;

  const effectiveBookTitleDisplay = bookTitleDisplay;

  // Fetch feature counts on mount and re-fetch all facets when any filter changes
  const [initialFeatures, setInitialFeatures] = useState<FeatureCounts | null>(null);

  useEffect(() => {
    const hasAnyFilter = selectedCategories.length > 0 || selectedCenturies.length > 0 || selectedFeatures.length > 0;

    // Build shared feature filter params
    const featureFilterParams = new URLSearchParams();
    if (selectedFeatures.includes("hasPdf")) featureFilterParams.set("hasPdf", "true");
    if (selectedFeatures.includes("isIndexed")) featureFilterParams.set("isIndexed", "true");
    const featureQS = featureFilterParams.toString();

    const controller = new AbortController();

    const fetchFacets = async () => {
      const featuresLang = locale === "ar" ? "en" : locale;

      // Build params for each endpoint
      const catParams = new URLSearchParams({ flat: "true" });
      if (selectedCenturies.length > 0) catParams.set("century", selectedCenturies.join(","));
      if (featureQS) featureQS.split("&").forEach((kv) => { const [k, v] = kv.split("="); catParams.set(k, v); });

      const cenParams = new URLSearchParams();
      if (selectedCategories.length > 0) cenParams.set("categoryId", selectedCategories.join(","));
      if (featureQS) featureQS.split("&").forEach((kv) => { const [k, v] = kv.split("="); cenParams.set(k, v); });

      const featParams = new URLSearchParams({ lang: featuresLang });
      if (selectedCategories.length > 0) featParams.set("categoryId", selectedCategories.join(","));
      if (selectedCenturies.length > 0) featParams.set("century", selectedCenturies.join(","));
      if (selectedFeatures.includes("hasPdf")) featParams.set("hasPdf", "true");
      if (selectedFeatures.includes("isIndexed")) featParams.set("isIndexed", "true");

      const [catRes, cenRes, featRes] = await Promise.all([
        // Fetch categories filtered by centuries + features
        (selectedCenturies.length > 0 || selectedFeatures.length > 0)
          ? fetch(`/api/books/categories?${catParams}`, { signal: controller.signal }).then((r) => r.json()).catch(() => null)
          : null,
        // Fetch centuries filtered by categories + features
        (selectedCategories.length > 0 || selectedFeatures.length > 0)
          ? fetch(`/api/books/centuries?${cenParams}`, { signal: controller.signal }).then((r) => r.json()).catch(() => null)
          : null,
        // Fetch feature counts filtered by categories + centuries + other features
        fetch(`/api/books/features?${featParams}`, { signal: controller.signal }).then((r) => r.json()).catch(() => null),
      ]);

      if (controller.signal.aborted) return;

      if (catRes?.categories) {
        setCategories(catRes.categories);
      } else if (!hasAnyFilter || selectedCenturies.length === 0 && selectedFeatures.length === 0) {
        setCategories(initialCategories);
      }

      if (cenRes?.centuries) {
        setCenturies(cenRes.centuries);
      } else if (!hasAnyFilter || selectedCategories.length === 0 && selectedFeatures.length === 0) {
        setCenturies(initialCenturies);
      }

      if (featRes?.features) {
        setFeatureCounts(featRes.features);
        // Store unfiltered features as baseline
        if (!hasAnyFilter) {
          setInitialFeatures(featRes.features);
        }
      }
    };

    fetchFacets().catch((err) => {
      if (!controller.signal.aborted) console.error(err);
    });

    return () => controller.abort();
  }, [selectedCategories, selectedCenturies, selectedFeatures, initialCategories, initialCenturies, locale]);

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

  // Build feature options for MultiSelectDropdown
  const featureOptions = useMemo(() => [
    { value: "hasPdf", label: t("books.features.hasPdf"), count: featureCounts.hasPdf },
    { value: "isIndexed", label: t("books.features.isIndexed"), count: featureCounts.isIndexed },
    { value: "isTranslated", label: t("books.features.isTranslated"), count: featureCounts.isTranslated },
  ], [featureCounts, t]);

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
    if (debouncedSearch === "" && selectedCategories.length === 0 && selectedCenturies.length === 0 && selectedFeatures.length === 0 && !bookTitleLang && pagination.page === 1) {
      setBooks(initialBooks);
      setPagination(initialPagination);
      return;
    }

    const controller = new AbortController();

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
        // Resolve language for bookTitleLang; also needed for isTranslated filter
        const effectiveLang = bookTitleLang || (selectedFeatures.includes("isTranslated") ? (locale === "ar" ? "en" : locale) : undefined);
        if (effectiveLang) {
          params.set("bookTitleLang", effectiveLang);
        }
        if (selectedFeatures.includes("hasPdf")) params.set("hasPdf", "true");
        if (selectedFeatures.includes("isIndexed")) params.set("isIndexed", "true");
        if (selectedFeatures.includes("isTranslated")) params.set("isTranslated", "true");

        const response = await fetch(`/api/books?${params}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
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
        if (controller.signal.aborted) return;
        console.error("Error fetching books:", error);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchBooks();
    return () => controller.abort();
  }, [pagination.page, pagination.limit, debouncedSearch, selectedCategories, selectedCenturies, selectedFeatures, bookTitleLang]);

  // Reset to page 1 when search, filters, or title language change
  useEffect(() => {
    if (debouncedSearch !== "" || selectedCategories.length > 0 || selectedCenturies.length > 0 || selectedFeatures.length > 0 || bookTitleLang) {
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  }, [debouncedSearch, selectedCategories, selectedCenturies, selectedFeatures, bookTitleLang]);

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

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 space-y-4">
        <h1 className="text-2xl md:text-3xl font-bold">{t("books.title")}</h1>
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 rounded-2xl bg-muted/60 p-1.5" suppressHydrationWarning>
          <div className="relative flex-1 min-w-0 sm:min-w-[16rem] rounded-lg ring-1 ring-transparent focus-within:ring-brand/50 focus-within:shadow-[0_0_0_3px_hsl(var(--brand)/0.1)] transition-[box-shadow,ring-color] duration-200">
            <Input
              type="text"
              placeholder={t("books.searchPlaceholder")}
              className="text-base sm:text-sm h-12 sm:h-10 rounded-lg border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
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
            <MultiSelectDropdown
              title={t("books.features.title")}
              options={featureOptions}
              selected={selectedFeatures}
              onChange={setSelectedFeatures}
            />
          </div>
        </div>
      </div>

      {/* Mobile row layout */}
      <div className="sm:hidden space-y-1">
        {loading ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className="p-4 rounded-lg bg-card animate-pulse">
              <div className="h-4 w-3/4 bg-muted rounded mb-2" />
              <div className="h-3 w-1/2 bg-muted rounded mb-2" />
              <div className="h-3 w-1/3 bg-muted rounded" />
            </div>
          ))
        ) : books.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            {t("books.noBooks")}
          </div>
        ) : (
          books.map((book) => {
            const secondaryTitle = getSecondaryTitle(book);
            const secondaryAuthor = book.author ? getSecondaryAuthorName(book.author) : null;
            const year = getBookYear(book, showPublicationDates, dateCalendar, t("books.publication"));
            return (
              <PrefetchLink
                key={book.id}
                href={`/reader/${book.id}`}
                className="block p-4 rounded-lg border border-border/50 dark:border-border/30 bg-card/50 hover:bg-card transition-colors"
              >
                <div className="font-medium text-sm truncate" dir="rtl">{book.titleArabic}</div>
                {book.author && <div className="text-xs text-muted-foreground truncate mt-0.5" dir="rtl">{book.author.nameArabic}</div>}
                {secondaryTitle && (
                  <div className="text-xs text-muted-foreground truncate mt-1">{secondaryTitle}</div>
                )}
                {secondaryAuthor && (
                  <div className="text-xs text-muted-foreground truncate">{secondaryAuthor}</div>
                )}
                {year && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground/70">
                    <span>{year}</span>
                  </div>
                )}
              </PrefetchLink>
            );
          })
        )}
      </div>

      {/* Desktop table layout */}
      <div className="hidden sm:block overflow-x-auto rounded-lg">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
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
                  colSpan={3}
                  className="text-center text-muted-foreground"
                >
                  {t("books.noBooks")}
                </TableCell>
              </TableRow>
            ) : (
              books.map((book) => {
                const secondaryTitle = getSecondaryTitle(book);
                const secondaryAuthor = book.author ? getSecondaryAuthorName(book.author) : null;
                return (
                  <TableRow key={book.id}>
                    <TableCell className="overflow-hidden py-3">
                      <PrefetchLink
                        href={`/reader/${book.id}`}
                        className="font-medium hover:underline"
                      >
                        <div className="truncate text-[15px]">{book.titleArabic}</div>
                        {secondaryTitle && (
                          <div className="truncate text-sm text-muted-foreground mt-0.5">
                            {secondaryTitle}
                          </div>
                        )}
                      </PrefetchLink>
                    </TableCell>
                    <TableCell className="overflow-hidden py-3">
                      <div className="truncate">{book.author?.nameArabic}</div>
                      {secondaryAuthor && (
                        <div className="truncate text-sm text-muted-foreground mt-0.5">
                          {secondaryAuthor}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-3">
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
