import type { MetadataRoute } from "next";
import { fetchAPI } from "@/lib/api-client";

const SITE_URL = process.env.SITE_URL || "https://openidb.org";

interface BookEntry { id: string }
interface AuthorEntry { id: string; nameLatin: string | null }

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/search`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/authors`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  // Fetch books and authors from API for dynamic pages
  try {
    const [booksRes, authorsRes] = await Promise.all([
      fetchAPI<{ books: BookEntry[]; total: number }>("/api/books?limit=50000&offset=0").catch(() => null),
      fetchAPI<{ authors: AuthorEntry[] }>("/api/books/authors?limit=50000&offset=0").catch(() => null),
    ]);

    if (booksRes?.books) {
      for (const book of booksRes.books) {
        staticPages.push({
          url: `${SITE_URL}/reader/${book.id}`,
          changeFrequency: "monthly",
          priority: 0.5,
        });
      }
    }

    if (authorsRes?.authors) {
      for (const author of authorsRes.authors) {
        if (author.nameLatin) {
          staticPages.push({
            url: `${SITE_URL}/authors/${encodeURIComponent(author.nameLatin)}`,
            changeFrequency: "monthly",
            priority: 0.4,
          });
        }
      }
    }
  } catch {
    // If API is unavailable, return static pages only
  }

  return staticPages;
}
