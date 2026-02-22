import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchAPI } from "@/lib/api-client";
import { MushafPageClient, type MushafPageData } from "@/components/MushafPageClient";

interface SurahList {
  surahs: Array<{
    number: number;
    nameArabic: string;
    nameEnglish: string;
    ayahCount: number;
  }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}): Promise<Metadata> {
  const { page } = await params;
  const pageNum = Number(page);

  if (isNaN(pageNum) || pageNum < 1 || pageNum > 604) {
    return { title: "Quran - OpenIDB" };
  }

  try {
    const data = await fetchAPI<MushafPageData>(
      `/api/quran/mushaf/${pageNum}`,
      { revalidate: 86400 }
    );
    const surahNames = data.surahs.map((s) => s.nameEnglish).join(", ");
    return {
      title: `Quran Page ${pageNum} — ${surahNames} - OpenIDB`,
      description: `Read Quran page ${pageNum} (${surahNames}) in the mushaf viewer.`,
    };
  } catch {
    return { title: `Quran Page ${pageNum} - OpenIDB` };
  }
}

export default async function MushafPage({
  params,
  searchParams,
}: {
  params: Promise<{ page: string }>;
  searchParams: Promise<{ highlight?: string }>;
}) {
  const { page } = await params;
  const { highlight } = await searchParams;
  const pageNum = Number(page);

  if (isNaN(pageNum) || pageNum < 1 || pageNum > 604) {
    notFound();
  }

  let pageData: MushafPageData;
  try {
    pageData = await fetchAPI<MushafPageData>(
      `/api/quran/mushaf/${pageNum}`,
      { revalidate: 86400 }
    );
  } catch {
    notFound();
  }

  // Fetch surah list for navigation
  let surahList: SurahList;
  try {
    surahList = await fetchAPI<SurahList>("/api/quran/surahs", {
      revalidate: 86400,
    });
  } catch {
    surahList = { surahs: [] };
  }

  // Parse highlight parameter (format: "2:255" for surah:ayah)
  let highlightAyah: { surah: number; ayah: number } | null = null;
  if (highlight) {
    const [s, a] = highlight.split(":").map(Number);
    if (s && a) highlightAyah = { surah: s, ayah: a };
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-screen">
      <MushafPageClient
        initialData={pageData}
        allSurahs={surahList.surahs}
        highlightAyah={highlightAyah}
      />
    </div>
  );
}
