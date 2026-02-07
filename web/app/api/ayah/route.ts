import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const limited = rateLimit(request, "general");
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const surahNumber = parseInt(searchParams.get("surah") || "0");
  const ayahNumber = parseInt(searchParams.get("ayah") || "0");
  const lang = searchParams.get("lang");

  if (!surahNumber || !ayahNumber) {
    return NextResponse.json({ error: "Missing surah or ayah" }, { status: 400 });
  }

  if (surahNumber < 1 || surahNumber > 114) {
    return NextResponse.json({ error: "Invalid surah number (1-114)" }, { status: 400 });
  }

  if (ayahNumber < 1 || ayahNumber > 286) {
    return NextResponse.json({ error: "Invalid ayah number (1-286)" }, { status: 400 });
  }

  const surah = await prisma.surah.findUnique({
    where: { number: surahNumber },
  });

  if (!surah) {
    return NextResponse.json({ error: "Surah not found" }, { status: 404 });
  }

  const ayah = await prisma.ayah.findFirst({
    where: {
      surahId: surah.id,
      ayahNumber: ayahNumber,
    },
  });

  if (!ayah) {
    return NextResponse.json({ error: "Ayah not found" }, { status: 404 });
  }

  let translation: string | undefined;
  if (lang && lang !== "none") {
    const trans = await prisma.ayahTranslation.findUnique({
      where: {
        surahNumber_ayahNumber_language: {
          surahNumber,
          ayahNumber,
          language: lang,
        },
      },
    });
    translation = trans?.text;
  }

  return NextResponse.json({
    surahNumber,
    ayahNumber,
    surahNameArabic: surah.nameArabic,
    surahNameEnglish: surah.nameEnglish,
    text: ayah.textUthmani,
    translation,
  });
}
