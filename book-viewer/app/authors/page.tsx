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

interface Author {
  name: string;
  nameLatin: string;
  bookCount: number;
  books: Book[];
  timePeriods: Set<string>;
  deathYear: string;
}

export default function AuthorsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTimePeriods, setSelectedTimePeriods] = useState<string[]>([]);

  // Group books by author
  const authorsMap = (catalog as Book[]).reduce((acc, book) => {
    const key = book.author;
    if (!acc[key]) {
      acc[key] = {
        name: book.author,
        nameLatin: book.authorLatin,
        bookCount: 0,
        books: [],
        timePeriods: new Set<string>(),
        deathYear: book.datePublished,
      };
    }
    acc[key].bookCount++;
    acc[key].books.push(book);
    acc[key].timePeriods.add(book.timePeriod);
    return acc;
  }, {} as Record<string, Author>);

  const authors = Object.values(authorsMap);

  const timePeriodOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    authors.forEach((author) => {
      author.timePeriods.forEach((period) => {
        counts[period] = (counts[period] || 0) + 1;
      });
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
  }, [authors]);

  const filteredAuthors = authors.filter((author) => {
    // Search filter
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      !query ||
      author.name.toLowerCase().includes(query) ||
      author.nameLatin.toLowerCase().includes(query);

    // Time period filter - author matches if any of their books match selected periods
    const matchesTimePeriod =
      selectedTimePeriods.length === 0 ||
      selectedTimePeriods.some((period) => author.timePeriods.has(period));

    return matchesSearch && matchesTimePeriod;
  });

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Authors</h1>
        <div className="flex items-center gap-3">
          <div className="hidden min-[896px]:flex items-center gap-3">
            <MultiSelectDropdown
              title="Time Period"
              options={timePeriodOptions}
              selected={selectedTimePeriods}
              onChange={setSelectedTimePeriods}
            />
          </div>
          <Input
            type="text"
            placeholder="Search authors..."
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
              <TableHead>Death Year</TableHead>
              <TableHead>Books</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAuthors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No authors found
                </TableCell>
              </TableRow>
            ) : (
              filteredAuthors.map((author) => (
                <TableRow key={author.name}>
                  <TableCell>
                    <Link
                      href={`/authors/${encodeURIComponent(author.nameLatin)}`}
                      className="font-medium hover:underline"
                    >
                      <div>{author.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {author.nameLatin}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>{author.deathYear}</TableCell>
                  <TableCell>{author.bookCount}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 text-sm text-muted-foreground">
        Showing {filteredAuthors.length} of {authors.length} authors
      </div>
    </div>
  );
}
