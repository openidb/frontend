import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchAPI } from "@/lib/api-client";
import { QuranAyahViewer } from "@/components/QuranAyahViewer";
import type { MushafPageData } from "@/components/MushafPageClient";

interface AyahData {
  ayahNumber: number;
  textUthmani: string;
  pageNumber: number;
  surah: { number: number; nameArabic: string; nameEnglish: string };
}

interface AyahsResponse {
  ayahs: AyahData[];
  total: number;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ surah: string; ayah: string }>;
}): Promise<Metadata> {
  const { surah, ayah } = await params;
  const surahNum = Number(surah);
  const ayahNum = Number(ayah);

  if (isNaN(surahNum) || isNaN(ayahNum)) {
    return { title: "Quran - OpenIDB" };
  }

  try {
    const data = await fetchAPI<AyahsResponse>(
      `/api/quran/ayahs?surah=${surahNum}&offset=${ayahNum - 1}&limit=1`,
      { revalidate: 86400 }
    );
    const surahName = data.ayahs[0]?.surah?.nameEnglish || `Surah ${surahNum}`;
    return {
      title: `${surahName} ${surahNum}:${ayahNum} - OpenIDB`,
      description: `Read ${surahName}, Ayah ${ayahNum} with context.`,
    };
  } catch {
    return { title: `Quran ${surahNum}:${ayahNum} - OpenIDB` };
  }
}

export default async function QuranAyahPage({
  params,
}: {
  params: Promise<{ surah: string; ayah: string }>;
}) {
  const { surah, ayah } = await params;
  const surahNum = Number(surah);
  const ayahNum = Number(ayah);

  if (isNaN(surahNum) || surahNum < 1 || surahNum > 114) notFound();
  if (isNaN(ayahNum) || ayahNum < 1) notFound();

  // Fetch 3 ayahs: prev, current, next
  const startAyah = Math.max(1, ayahNum - 1);
  const offset = startAyah - 1;

  let data: AyahsResponse;
  try {
    data = await fetchAPI<AyahsResponse>(
      `/api/quran/ayahs?surah=${surahNum}&offset=${offset}&limit=3`,
      { revalidate: 86400 }
    );
  } catch {
    notFound();
  }

  if (!data.ayahs.length) notFound();

  // Get unique page numbers for displayed ayahs
  const pageNumbers = [...new Set(data.ayahs.map((a) => a.pageNumber))];

  // Fetch mushaf page data
  const mushafPages: MushafPageData[] = [];
  await Promise.all(
    pageNumbers.map(async (p) => {
      try {
        const pd = await fetchAPI<MushafPageData>(`/api/quran/mushaf/${p}`, { revalidate: 86400 });
        mushafPages.push(pd);
      } catch {}
    })
  );
  mushafPages.sort((a, b) => a.pageNumber - b.pageNumber);

  if (!mushafPages.length) notFound();

  const surahInfo = data.ayahs.find((a) => a.ayahNumber === ayahNum)?.surah || data.ayahs[0].surah;

  return (
    <div className="flex flex-col h-screen">
      <QuranAyahViewer
        ayahs={data.ayahs}
        targetAyah={ayahNum}
        surahNumber={surahNum}
        surahNameEnglish={surahInfo.nameEnglish}
        surahNameArabic={surahInfo.nameArabic}
        totalAyahs={data.total}
        mushafPages={mushafPages}
      />
    </div>
  );
}
