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
import { formatYear } from "@/lib/dates";
import { useTranslation } from "@/lib/i18n";
import { useAppConfig } from "@/lib/config";

interface Author {
  id: string;
  nameArabic: string;
  nameLatin: string;
  deathDateHijri: string | null;
  deathDateGregorian: string | null;
  _count: {
    books: number;
  };
}

interface CenturyItem {
  century: number;
  authorsCount: number;
}

interface AuthorsClientProps {
  initialAuthors: Author[];
  initialPagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  initialCenturies: CenturyItem[];
}

export default function AuthorsClient({ initialAuthors, initialPagination, initialCenturies }: AuthorsClientProps) {
  const { t, locale } = useTranslation();
  const { config, isLoaded } = useAppConfig();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [authors, setAuthors] = useState<Author[]>(initialAuthors);
  const [pagination, setPagination] = useState(initialPagination);
  const [loading, setLoading] = useState(false);
  const [selectedCenturies, setSelectedCenturies] = useState<string[]>([]);

  // Build century options for MultiSelectDropdown (locale-aware via i18n)
  const centuryOptions = useMemo(() =>
    initialCenturies.map((c) => ({
      value: c.century.toString(),
      label: t(`centuries.${c.century}`),
      count: c.authorsCount,
    })),
    [initialCenturies, t]
  );

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch authors from API when search, filters, or pagination changes
  useEffect(() => {
    // No active filters and on page 1 — reset to server-provided initial data
    if (debouncedSearch === "" && selectedCenturies.length === 0 && pagination.page === 1) {
      setAuthors(initialAuthors);
      setPagination(initialPagination);
      return;
    }

    const fetchAuthors = async () => {
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
        if (selectedCenturies.length > 0) {
          params.set("century", selectedCenturies.join(","));
        }

        const response = await fetch(`/api/authors?${params}`);
        const data = await response.json();

        setAuthors(data.authors || []);
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
        console.error("Error fetching authors:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAuthors();
  }, [pagination.page, pagination.limit, debouncedSearch, selectedCenturies]);

  // Reset to page 1 when search or filters change
  useEffect(() => {
    if (debouncedSearch !== "" || selectedCenturies.length > 0) {
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  }, [debouncedSearch, selectedCenturies]);

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
              <div className="h-4 w-24 bg-muted animate-shimmer rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8" suppressHydrationWarning>
      <div className="mb-6 space-y-4">
        <h1 className="text-2xl md:text-3xl font-bold">{t("authors.title")}</h1>
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 rounded-2xl bg-muted/60 p-1.5" suppressHydrationWarning>
          <div className="relative flex-1 min-w-0 sm:min-w-[16rem] rounded-lg ring-1 ring-transparent focus-within:ring-brand/50 focus-within:shadow-[0_0_0_3px_hsl(var(--brand)/0.1)] transition-[box-shadow,ring-color] duration-200">
            <Input
              type="text"
              placeholder={t("authors.searchPlaceholder")}
              className="text-base sm:text-sm h-12 sm:h-10 rounded-lg border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
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
      </div>

      {/* Mobile row layout */}
      <div className="sm:hidden space-y-1">
        {loading ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className="p-2.5 rounded-lg bg-muted/25 animate-pulse">
              <div className="h-4 w-3/4 bg-muted rounded mb-2" />
              <div className="h-3 w-1/2 bg-muted rounded mb-2" />
              <div className="h-3 w-1/3 bg-muted rounded" />
            </div>
          ))
        ) : authors.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            {t("authors.noAuthors")}
          </div>
        ) : (
          authors.map((author) => {
            const deathYear = (author.deathDateHijri || author.deathDateGregorian)
              ? formatYear(author.deathDateHijri, author.deathDateGregorian, config.dateCalendar)
              : null;
            return (
              <PrefetchLink
                key={author.id}
                href={`/authors/${author.id}`}
                className="block p-2.5 rounded-lg bg-muted/25 hover:bg-muted/70 transition-colors"
              >
                <div className="font-medium text-sm truncate" dir="rtl">{author.nameArabic}</div>
                {config.showAuthorTransliteration && (
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{author.nameLatin}</div>
                )}
                <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground/70">
                  <span className="tabular-nums">#{author.id}</span>
                  {deathYear && <><span>·</span><span>{deathYear}</span></>}
                  {author._count?.books != null && (
                    <><span>·</span><span>{author._count.books} {author._count.books === 1 ? t("authors.bookSingular") : t("authors.bookPlural")}</span></>
                  )}
                </div>
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
              <TableHead className="w-16">ID</TableHead>
              <TableHead>{t("authors.tableHeaders.name")}</TableHead>
              <TableHead className="w-24 md:w-40">{t("authors.tableHeaders.deathYear")}</TableHead>
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
                    <div className="h-4 w-16 bg-muted animate-shimmer rounded" />
                  </TableCell>
                </TableRow>
              ))
            ) : authors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  {t("authors.noAuthors")}
                </TableCell>
              </TableRow>
            ) : (
              authors.map((author) => (
                <TableRow key={author.id}>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {author.id}
                  </TableCell>
                  <TableCell className="overflow-hidden">
                    <PrefetchLink
                      href={`/authors/${author.id}`}
                      className="font-medium hover:underline"
                    >
                      <div className="truncate">{author.nameArabic}</div>
                      {config.showAuthorTransliteration && (
                        <div className="truncate text-sm text-muted-foreground">
                          {author.nameLatin}
                        </div>
                      )}
                    </PrefetchLink>
                  </TableCell>
                  <TableCell>
                    {author.deathDateHijri || author.deathDateGregorian ? (
                      <span>
                        {formatYear(author.deathDateHijri, author.deathDateGregorian, config.dateCalendar)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {t("authors.showing", { count: authors.length, total: pagination.total })}
          {pagination.totalPages > 1 && (
            <span> {t("authors.pagination", { page: pagination.page, totalPages: pagination.totalPages })}</span>
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
              {t("authors.previous")}
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
              {t("authors.next")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
