import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchAPI } from "@/lib/api-client";
import { RootPageClient } from "./RootPageClient";
import type { RootFamilyData } from "@/lib/types/dictionary";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ root: string }>;
}): Promise<Metadata> {
  const { root } = await params;
  const decoded = decodeURIComponent(root);
  return {
    title: `Root: ${decoded} — OpenIslamicDB`,
    description: `Arabic root ${decoded}: derived forms, word family, and dictionary definitions`,
  };
}

export default async function RootPage({
  params,
}: {
  params: Promise<{ root: string }>;
}) {
  const { root } = await params;

  let data: RootFamilyData;
  try {
    data = await fetchAPI<RootFamilyData>(
      `/api/dictionary/root/${encodeURIComponent(root)}`
    );
  } catch {
    notFound();
  }

  if (!data.derivedForms.length && !data.dictionaryEntries.length) {
    notFound();
  }

  return <RootPageClient data={data} />;
}
