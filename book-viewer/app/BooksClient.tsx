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
import { formatBookYear, getBookCentury, getCenturyLabel } from "@/lib/dates";
import { defaultSearchConfig } from "@/components/SearchConfigDropdown";
import { useTranslation } from "@/lib/i18n";

interface Author {
  id: string;  // shamela_author_id is now the primary key
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
function getBookYear(book: Book, showPublicationDates: boolean): string {
  const result = formatBookYear(book);
  if (!result.year) return "—";
  if (result.isPublicationYear && !showPublicationDates) return "—";
  return result.isPublicationYear ? `${result.year} (pub.)` : result.year;
}

const STORAGE_KEY = "searchConfig";

export default function BooksClient({ books }: BooksClientProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCenturies, setSelectedCenturies] = useState<string[]>([]);
  const [showPublicationDates, setShowPublicationDates] = useState(defaultSearchConfig.showPublicationDates);
  const [showTransliterations, setShowTransliterations] = useState(defaultSearchConfig.showTransliterations);

  // Load display options from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.showPublicationDates === "boolean") {
          setShowPublicationDates(parsed.showPublicationDates);
        }
        if (typeof parsed.showTransliterations === "boolean") {
          setShowTransliterations(parsed.showTransliterations);
        }
      } catch {
        // Invalid JSON, use defaults
      }
    }
  }, []);

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
            className="w-full sm:w-64"
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
              filteredBooks.map((book) => (
                <TableRow key={book.id}>
                  <TableCell>
                    <Link
                      href={`/reader/${book.id}`}
                      className="font-medium hover:underline"
                    >
                      <div>{book.titleArabic}</div>
                      {showTransliterations && (
                        <div className="text-sm text-muted-foreground">
                          {book.titleLatin}
                        </div>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div>{book.author.nameArabic}</div>
                    {showTransliterations && (
                      <div className="text-sm text-muted-foreground">
                        {book.author.nameLatin}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {getBookYear(book, showPublicationDates)}
                  </TableCell>
                </TableRow>
              ))
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
