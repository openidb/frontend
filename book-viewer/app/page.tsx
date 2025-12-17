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
import catalog from "@/lib/catalog.json";
import authorsMetadata from "@/lib/authors-metadata.json";

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
  name_arabic: string;
  name_latin: string;
  shamela_author_id?: string;
  death_date_hijri?: string;
  birth_date_hijri?: string;
  death_date_gregorian?: string;
  birth_date_gregorian?: string;
  biography?: string;
  biography_source?: string;
  books_count?: number;
}

// Helper function to convert Arabic numerals to Western numerals
function arabicToWestern(str: string): string {
  if (!str) return str;
  return str
    .replace(/٠/g, '0')
    .replace(/١/g, '1')
    .replace(/٢/g, '2')
    .replace(/٣/g, '3')
    .replace(/٤/g, '4')
    .replace(/٥/g, '5')
    .replace(/٦/g, '6')
    .replace(/٧/g, '7')
    .replace(/٨/g, '8')
    .replace(/٩/g, '9');
}

// Get author's death year for a book
function getBookYear(book: Book): string {
  const metadata = (authorsMetadata as Record<string, AuthorMetadata>)[book.authorLatin];

  if (metadata) {
    const gregorian = metadata.death_date_gregorian
      ? arabicToWestern(metadata.death_date_gregorian)
      : null;
    const hijri = metadata.death_date_hijri
      ? arabicToWestern(metadata.death_date_hijri)
      : null;

    if (gregorian || hijri) {
      const parts = [];
      if (gregorian) parts.push(`${gregorian} CE`);
      if (hijri) parts.push(`${hijri} AH`);
      return parts.join(' / ');
    }
  }

  // Fallback to catalog data
  if (book.datePublished && book.datePublished !== "TEST") {
    return book.datePublished;
  }
  if (book.yearAH && book.yearAH > 0) {
    return `${book.yearAH} AH`;
  }
  return "—";
}

export default function BooksPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTimePeriods, setSelectedTimePeriods] = useState<string[]>([]);

  const categoryOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    (catalog as Book[]).forEach((book) => {
      counts[book.category] = (counts[book.category] || 0) + 1;
    });

    return Object.entries(counts).map(([category, count]) => ({
      value: category,
      label: category,
      count,
    }));
  }, []);

  const timePeriodOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    (catalog as Book[]).forEach((book) => {
      counts[book.timePeriod] = (counts[book.timePeriod] || 0) + 1;
    });

    const labels: Record<string, { label: string; labelArabic: string }> = {
      "pre-islamic": { label: "Pre-Islamic", labelArabic: "الجاهلية" },
      "early-islamic": { label: "Early Islamic (1-40 AH)", labelArabic: "صدر الإسلام" },
      "umayyad": { label: "Umayyad (41-132 AH)", labelArabic: "العصر الأموي" },
      "abbasid": { label: "Abbasid (133-656 AH)", labelArabic: "العصر العباسي" },
      "post-abbasid": { label: "Post-Abbasid (657+ AH)", labelArabic: "ما بعد العباسي" },
    };

    return Object.entries(counts).map(([period, count]) => ({
      value: period,
      label: labels[period]?.label || period,
      labelArabic: labels[period]?.labelArabic,
      count,
    }));
  }, []);

  const filteredBooks = (catalog as Book[]).filter((book) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      book.title.toLowerCase().includes(query) ||
      book.titleLatin.toLowerCase().includes(query) ||
      book.author.toLowerCase().includes(query) ||
      book.authorLatin.toLowerCase().includes(query) ||
      book.datePublished.toLowerCase().includes(query);

    const matchesCategory =
      selectedCategories.length === 0 ||
      selectedCategories.includes(book.category);

    const matchesTimePeriod =
      selectedTimePeriods.length === 0 ||
      selectedTimePeriods.includes(book.timePeriod);

    return matchesSearch && matchesCategory && matchesTimePeriod;
  });

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
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No books found
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
                      <div>{book.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {book.titleLatin}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div>{book.author}</div>
                    <div className="text-sm text-muted-foreground">
                      {book.authorLatin}
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
        Showing {filteredBooks.length} of {catalog.length} books
      </div>
    </div>
  );
}
