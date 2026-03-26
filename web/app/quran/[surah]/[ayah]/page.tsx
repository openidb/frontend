import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchAPI } from "@/lib/api-client";
import { QuranAyahViewer } from "@/components/QuranAyahViewer";

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
  searchParams,
}: {
  params: Promise<{ surah: string; ayah: string }>;
  searchParams: Promise<{ audio?: string }>;
}) {
  const { surah, ayah } = await params;
  const { audio } = await searchParams;
  const surahNum = Number(surah);
  const ayahNum = Number(ayah);

  if (isNaN(surahNum) || surahNum < 1 || surahNum > 114) notFound();
  if (isNaN(ayahNum) || ayahNum < 1) notFound();

  // Fetch 4 ayahs: 1 before, current, 2 after
  const startAyah = Math.max(1, ayahNum - 1);
  const offset = startAyah - 1;

  let data: AyahsResponse;
  try {
    data = await fetchAPI<AyahsResponse>(
      `/api/quran/ayahs?surah=${surahNum}&offset=${offset}&limit=4`,
      { revalidate: 86400 }
    );
  } catch {
    notFound();
  }

  if (!data.ayahs.length) notFound();

  const surahInfo = data.ayahs.find((a) => a.ayahNumber === ayahNum)?.surah || data.ayahs[0].surah;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <QuranAyahViewer
        ayahs={data.ayahs}
        targetAyah={ayahNum}
        surahNumber={surahNum}
        surahNameEnglish={surahInfo.nameEnglish}
        surahNameArabic={surahInfo.nameArabic}
        totalAyahs={data.total}
        initialAudioMode={audio === "1"}
      />
    </div>
  );
}
