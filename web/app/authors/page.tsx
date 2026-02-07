import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import AuthorsClient from "./AuthorsClient";

// Use dynamic rendering since database isn't available at build time
export const dynamic = "force-dynamic";

const getAuthors = unstable_cache(
  async () => {
    const [authors, total] = await Promise.all([
      prisma.author.findMany({
        select: {
          id: true,
          nameArabic: true,
          nameLatin: true,
          deathDateHijri: true,
          deathDateGregorian: true,
          _count: {
            select: {
              books: true,
            },
          },
        },
        orderBy: {
          nameArabic: "asc",
        },
        take: 50,
      }),
      prisma.author.count(),
    ]);

    return {
      authors,
      pagination: {
        page: 1,
        limit: 50,
        total,
        totalPages: Math.ceil(total / 50),
      },
    };
  },
  ["authors-list"],
  { revalidate: 3600 } // 1 hour
);

export default async function AuthorsPage() {
  let data = {
    authors: [] as Awaited<ReturnType<typeof getAuthors>>["authors"],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
  };

  try {
    data = await getAuthors();
  } catch (error) {
    console.error("Failed to fetch authors:", error);
  }

  return (
    <AuthorsClient
      initialAuthors={data.authors}
      initialPagination={data.pagination}
    />
  );
}
