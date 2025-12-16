import type { Metadata } from "next";
import "./globals.css";
import { BookOpen, Users } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Book Viewer",
  description: "Browse and read your EPUB library",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex h-screen">
          {/* Sidebar */}
          <aside className="w-48 border-r bg-white p-4">
            <nav className="space-y-2">
              <Link
                href="/"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-gray-100"
              >
                <BookOpen className="h-4 w-4" />
                Books
              </Link>
              <Link
                href="/authors"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-gray-100"
              >
                <Users className="h-4 w-4" />
                Authors
              </Link>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-auto bg-white">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
