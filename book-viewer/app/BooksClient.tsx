"use client";

import { useState, useMemo } from "react";
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

// Helper function to convert Arabic numerals to Western numerals
function arabicToWestern(str: string): string {
  if (!str) return str;
  return str
    .replace(/٠/g, "0")
    .replace(/١/g, "1")
    .replace(/٢/g, "2")
    .replace(/٣/g, "3")
    .replace(/٤/g, "4")
    .replace(/٥/g, "5")
    .replace(/٦/g, "6")
    .replace(/٧/g, "7")
    .replace(/٨/g, "8")
    .replace(/٩/g, "9");
}

interface Author {
  id: number;
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
  id: number;
  shamelaBookId: string;
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

// Get year display for a book
function getBookYear(book: Book): string {
  // Primary: Use author's death year
  if (book.author.deathDateGregorian || book.author.deathDateHijri) {
    const parts = [];
    if (book.author.deathDateGregorian) {
      parts.push(`${arabicToWestern(book.author.deathDateGregorian)} CE`);
    }
    if (book.author.deathDateHijri) {
      parts.push(`${arabicToWestern(book.author.deathDateHijri)} AH`);
    }
    return parts.join(" / ");
  }

  // Fallback: Use publication year
  if (book.publicationYearGregorian) {
    return book.publicationYearGregorian;
  }
  if (book.publicationYearHijri) {
    return `${book.publicationYearHijri} AH`;
  }

  return "—";
}

export default function BooksClient({ books }: BooksClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTimePeriods, setSelectedTimePeriods] = useState<string[]>([]);

  const categoryOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    books.forEach((book) => {
      if (book.category) {
        counts[book.category.nameArabic] =
          (counts[book.category.nameArabic] || 0) + 1;
      }
    });

    return Object.entries(counts).map(([category, count]) => ({
      value: category,
      label: category,
      count,
    }));
  }, [books]);

  const timePeriodOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    books.forEach((book) => {
      if (book.timePeriod) {
        counts[book.timePeriod] = (counts[book.timePeriod] || 0) + 1;
      }
    });

    const labels: Record<string, { label: string; labelArabic: string }> = {
      "pre-islamic": { label: "Pre-Islamic", labelArabic: "الجاهلية" },
      "early-islamic": {
        label: "Early Islamic (1-40 AH)",
        labelArabic: "صدر الإسلام",
      },
      umayyad: { label: "Umayyad (41-132 AH)", labelArabic: "العصر الأموي" },
      abbasid: {
        label: "Abbasid (133-656 AH)",
        labelArabic: "العصر العباسي",
      },
      "post-abbasid": {
        label: "Post-Abbasid (657+ AH)",
        labelArabic: "ما بعد العباسي",
      },
    };

    return Object.entries(counts).map(([period, count]) => ({
      value: period,
      label: labels[period]?.label || period,
      labelArabic: labels[period]?.labelArabic,
      count,
    }));
  }, [books]);

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

      const matchesTimePeriod =
        selectedTimePeriods.length === 0 ||
        (book.timePeriod && selectedTimePeriods.includes(book.timePeriod));

      return matchesSearch && matchesCategory && matchesTimePeriod;
    });
  }, [books, searchQuery, selectedCategories, selectedTimePeriods]);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Books</h1>
        <div className="flex items-center gap-3">
          <div className="hidden min-[896px]:flex items-center gap-3">
            <MultiSelectDropdown
              title="Category"
              options={categoryOptions}
              selected={selectedCategories}
              onChange={setSelectedCategories}
            />
            <MultiSelectDropdown
              title="Time Period"
              options={timePeriodOptions}
              selected={selectedTimePeriods}
              onChange={setSelectedTimePeriods}
            />
          </div>
          <Input
            type="text"
            placeholder="Search books..."
            className="w-64"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Year</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBooks.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center text-muted-foreground"
                >
                  No books found
                </TableCell>
              </TableRow>
            ) : (
              filteredBooks.map((book) => (
                <TableRow key={book.id}>
                  <TableCell>
                    <Link
                      href={`/reader/${book.shamelaBookId}`}
                      className="font-medium hover:underline"
                    >
                      <div>{book.titleArabic}</div>
                      <div className="text-sm text-muted-foreground">
                        {book.titleLatin}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div>{book.author.nameArabic}</div>
                    <div className="text-sm text-muted-foreground">
                      {book.author.nameLatin}
                    </div>
                  </TableCell>
                  <TableCell>{getBookYear(book)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 text-sm text-muted-foreground">
        Showing {filteredBooks.length} of {books.length} books
      </div>
    </div>
  );
}
