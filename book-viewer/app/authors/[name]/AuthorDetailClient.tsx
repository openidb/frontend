"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";

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

interface AuthorDetailClientProps {
  authorName: string;
  authorLatin: string;
  books: Book[];
}

export default function AuthorDetailClient({
  authorName,
  authorLatin,
  books,
}: AuthorDetailClientProps) {
  if (books.length === 0) {
    return (
      <div className="p-8">
        <Link
          href="/authors"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Authors
        </Link>
        <div className="text-center text-muted-foreground">Author not found</div>
      </div>
    );
  }


  return (
    <div className="p-8">
      <Link
        href="/authors"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Authors
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold">{authorName}</h1>
        <p className="text-lg text-muted-foreground">{authorLatin}</p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Date Published</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {books.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  No books found
                </TableCell>
              </TableRow>
            ) : (
              books.map((book) => (
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
                  <TableCell>{book.datePublished}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 text-sm text-muted-foreground">
        Showing {books.length} books
      </div>
    </div>
  );
}
