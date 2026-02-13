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
    // No active filters — reset to server-provided initial data
    if (debouncedSearch === "" && selectedCenturies.length === 0) {
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
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
          <div className="h-10 w-64 bg-muted animate-pulse rounded" />
        </div>
        <div className="rounded-md border">
          <div className="h-12 bg-muted/50 border-b" />
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-16 border-b flex items-center gap-4 px-4">
              <div className="h-4 w-48 bg-muted animate-pulse rounded" />
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8" suppressHydrationWarning>
      <div className="mb-4 md:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-bold">{t("authors.title")}</h1>
        <div className="flex flex-wrap items-center gap-2 md:gap-3" suppressHydrationWarning>
          {centuryOptions.length > 0 && (
            <MultiSelectDropdown
              title={t("books.century")}
              options={centuryOptions}
              selected={selectedCenturies}
              onChange={setSelectedCenturies}
            />
          )}
          <Input
            type="text"
            placeholder={t("authors.searchPlaceholder")}
            className="w-full sm:w-64 text-base sm:text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>{t("authors.tableHeaders.name")}</TableHead>
              <TableHead className="w-40">{t("authors.tableHeaders.deathYear")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(10)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="h-4 w-10 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-48 bg-muted animate-pulse rounded mb-2" />
                    <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-16 bg-muted animate-pulse rounded" />
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
                    <Link
                      href={`/authors/${author.id}`}
                      className="font-medium hover:underline"
                    >
                      <div className="truncate">{author.nameArabic}</div>
                      <div className="truncate text-sm text-muted-foreground">
                        {author.nameLatin}
                      </div>
                    </Link>
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
