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
import { defaultSearchConfig, TranslationDisplayOption } from "@/components/SearchConfigDropdown";
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
function getBookYear(book: Book, showPublicationDates: boolean): string {
  const result = formatBookYear(book);
  if (!result.year) return "—";
  if (result.isPublicationYear && !showPublicationDates) return "—";
  return result.isPublicationYear ? `${result.year} (pub.)` : result.year;
}

const STORAGE_KEY = "searchConfig";

export default function BooksClient({ books: initialBooks }: BooksClientProps) {
  const { t, locale } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCenturies, setSelectedCenturies] = useState<string[]>([]);
  const [showPublicationDates, setShowPublicationDates] = useState(defaultSearchConfig.showPublicationDates);
  const [bookTitleDisplay, setBookTitleDisplay] = useState<TranslationDisplayOption>(defaultSearchConfig.bookTitleDisplay);
  const [autoTranslation, setAutoTranslation] = useState(defaultSearchConfig.autoTranslation);
  const [books, setBooks] = useState<Book[]>(initialBooks);

  // Get effective book title display setting (auto uses UI locale)
  const effectiveBookTitleDisplay = useMemo(() => {
    if (autoTranslation) {
      // Use UI locale, fall back to transliteration for Arabic
      return locale === "ar" ? "transliteration" : (locale as TranslationDisplayOption);
    }
    return bookTitleDisplay;
  }, [autoTranslation, bookTitleDisplay, locale]);

  // Load display options from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (typeof parsed.showPublicationDates === "boolean") {
          setShowPublicationDates(parsed.showPublicationDates);
        }
        // Handle new bookTitleDisplay setting
        if (parsed.bookTitleDisplay) {
          setBookTitleDisplay(parsed.bookTitleDisplay);
        } else if (typeof parsed.showTransliterations === "boolean") {
          // Backward compatibility: migrate old setting
          setBookTitleDisplay(parsed.showTransliterations ? "transliteration" : "none");
        }
        if (typeof parsed.autoTranslation === "boolean") {
          setAutoTranslation(parsed.autoTranslation);
        }
      } catch {
        // Invalid JSON, use defaults
      }
    }
  }, []);

  // Fetch books with translations when display setting changes to a language
  useEffect(() => {
    const fetchBooksWithTranslations = async () => {
      if (effectiveBookTitleDisplay === "none" || effectiveBookTitleDisplay === "transliteration") {
        setBooks(initialBooks);
        return;
      }

      try {
        const response = await fetch(`/api/books?bookTitleLang=${effectiveBookTitleDisplay}&limit=1000`);
        if (response.ok) {
          const data = await response.json();
          setBooks(data.books);
        }
      } catch (error) {
        console.error("Failed to fetch book translations:", error);
      }
    };

    fetchBooksWithTranslations();
  }, [effectiveBookTitleDisplay, initialBooks]);

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
                      {getBookYear(book, showPublicationDates)}
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
