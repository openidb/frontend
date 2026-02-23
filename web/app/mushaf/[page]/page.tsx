import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchAPI } from "@/lib/api-client";
import { MushafPageClient, type MushafPageData } from "@/components/MushafPageClient";

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
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
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

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-screen">
      <MushafPageClient key={pageNum} initialData={pageData} />
    </div>
  );
}
