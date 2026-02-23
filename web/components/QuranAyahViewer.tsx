"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import type { MushafPageData } from "./MushafPageClient";

interface AyahData {
  ayahNumber: number;
  textUthmani: string;
  pageNumber: number;
  surah: { number: number; nameArabic: string; nameEnglish: string };
}

interface Props {
  ayahs: AyahData[];
  targetAyah: number;
  surahNumber: number;
  surahNameEnglish: string;
  totalAyahs: number;
  mushafPages: MushafPageData[];
}

const PREFERRED_EDITIONS: Record<string, { id: string; name: string }> = {
  en: { id: "qul-131", name: "Dr. Mustafa Khattab, The Clear Quran" },
  ar: { id: "ara-kingfahadquranc-la", name: "King Fahad Quran Complex" },
  fr: { id: "qul-31", name: "Muhammad Hamidullah" },
  id: { id: "qul-33", name: "Indonesian Islamic Affairs Ministry" },
  ur: { id: "qul-158", name: "Dr. Israr Ahmad (Bayan-ul-Quran)" },
  es: { id: "qul-83", name: "Sheikh Isa Garcia" },
  zh: { id: "qul-56", name: "Ma Jian" },
  pt: { id: "qul-103", name: "Helmi Nasr" },
  ru: { id: "qul-79", name: "Abu Adel" },
  ja: { id: "qul-35", name: "Ryoichi Mita" },
  ko: { id: "qul-219", name: "Hamed Choi" },
  it: { id: "qul-153", name: "Hamza Roberto Piccardo" },
  bn: { id: "qul-213", name: "Dr. Abu Bakr Muhammad Zakaria" },
  ha: { id: "qul-32", name: "Abubakar Mahmoud Gumi" },
  sw: { id: "qul-49", name: "Ali Muhsin Al-Barwani" },
  nl: { id: "qul-144", name: "Sofian S. Siregar" },
  de: { id: "qul-27", name: "Frank Bubenheim & Nadeem" },
  tr: { id: "qul-52", name: "Elmalili Hamdi Yazir" },
  fa: { id: "qul-29", name: "Hussein Taji Kal Dari" },
  hi: { id: "qul-122", name: "Maulana Azizul Haque al-Umari" },
  ms: { id: "qul-784", name: "Abdullah Basamia" },
  pa: { id: "pan-drmuhamadhabibb", name: "Dr. Muhamad Habib" },
  ku: { id: "qul-81", name: "Burhan Muhammad-Amin" },
  ps: { id: "qul-118", name: "Zakaria Abulsalam" },
  so: { id: "qul-46", name: "Mahmud Muhammad Abduh" },
  uz: { id: "qul-127", name: "Muhammad Sodik Muhammad Yusuf" },
  yo: { id: "qul-125", name: "Shaykh Abu Rahimah Mikael Aykyuni" },
  ta: { id: "qul-133", name: "Abdul Hameed Baqavi" },
};

// Pages where ALL lines should be center-aligned
const CENTER_ALIGNED_PAGES = [1, 2];
const CENTER_ALIGNED_LINES: Record<number, number[]> = {
  255: [2], 528: [9], 534: [6], 545: [6], 586: [1], 593: [2], 594: [5],
  600: [10], 602: [5, 15], 603: [10, 15], 604: [4, 9, 14, 15],
};

function isCenterAligned(pageNumber: number, lineNumber: number): boolean {
  if (CENTER_ALIGNED_PAGES.includes(pageNumber)) return true;
  return CENTER_ALIGNED_LINES[pageNumber]?.includes(lineNumber) ?? false;
}

export function QuranAyahViewer({
  ayahs,
  targetAyah,
  surahNumber,
  surahNameEnglish,
  totalAyahs,
  mushafPages,
}: Props) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [fontsLoaded, setFontsLoaded] = useState<Set<number>>(new Set());
  const [surahFontLoaded, setSurahFontLoaded] = useState(false);
  const [translation, setTranslation] = useState<string>("");
  const [translatorName, setTranslatorName] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const canGoPrev = targetAyah > 1;
  const canGoNext = targetAyah < totalAyahs;
  // Show prev + current + next, but don't cross surah boundaries
  const ayahSet = new Set<number>();
  if (targetAyah > 1) ayahSet.add(targetAyah - 1);
  ayahSet.add(targetAyah);
  if (targetAyah < totalAyahs) ayahSet.add(targetAyah + 1);

  // Load QPC V2 fonts for relevant pages
  useEffect(() => {
    const pages = mushafPages.map((p) => p.pageNumber);
    const loaded = new Set<number>();
    Promise.all(
      pages.map(async (page) => {
        const fontName = `QCF2_P${String(page).padStart(3, "0")}`;
        try {
          const font = new FontFace(fontName, `url(/fonts/mushaf/v2/p${page}.woff2)`);
          const f = await font.load();
          document.fonts.add(f);
          loaded.add(page);
        } catch {}
      })
    ).then(() => setFontsLoaded(new Set(loaded)));
  }, [mushafPages]);

  // Load surah name font
  useEffect(() => {
    const font = new FontFace("SurahNameV2", "url(/fonts/mushaf/surah-name-v2.woff2)");
    font.load().then((f) => { document.fonts.add(f); setSurahFontLoaded(true); }).catch(() => {});
  }, []);

  // Fetch translation for target ayah
  useEffect(() => {
    const edition = PREFERRED_EDITIONS[locale] || PREFERRED_EDITIONS.en;
    setTranslatorName(edition.name);
    fetch(`/api/quran/translations/${surahNumber}/${targetAyah}?editionId=${edition.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.translations?.[0]?.text) setTranslation(d.translations[0].text); })
      .catch(() => {});
  }, [surahNumber, targetAyah, locale]);

  // Swipe navigation
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0 && canGoNext) router.push(`/quran/${surahNumber}/${targetAyah + 1}`);
      else if (dx > 0 && canGoPrev) router.push(`/quran/${surahNumber}/${targetAyah - 1}`);
    }
  }, [targetAyah, surahNumber, canGoPrev, canGoNext, router]);

  // Filter mushaf lines: only those containing any of our 3 ayahs
  const filteredLines: { pageNumber: number; line: typeof mushafPages[0]["lines"][0] }[] = [];
  for (const page of mushafPages) {
    for (const line of page.lines) {
      if (line.lineType === "text") {
        const hasOurAyah = line.words.some(
          (w) => w.surahNumber === surahNumber && ayahSet.has(w.ayahNumber)
        );
        if (hasOurAyah) filteredLines.push({ pageNumber: page.pageNumber, line });
      } else if (line.lineType === "surah_name" || line.lineType === "bismillah") {
        // Include surah headers/bismillah if the next text line has our ayahs
        const nextTextLine = page.lines.find(
          (l) => l.lineNumber > line.lineNumber && l.lineType === "text"
        );
        if (
          nextTextLine &&
          nextTextLine.words.some((w) => w.surahNumber === surahNumber && ayahSet.has(w.ayahNumber))
        ) {
          filteredLines.push({ pageNumber: page.pageNumber, line });
        }
      }
    }
  }

  const allFontsReady = mushafPages.every((p) => fontsLoaded.has(p.pageNumber));

  return (
    <div className="ayah-view flex flex-col h-full min-h-0">
      {/* Mushaf content — identical structure to MushafPageClient */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex justify-center mushaf-bg"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="mushaf-page-frame"
          dir="rtl"
          style={{
            opacity: allFontsReady ? 1 : 0.3,
            transition: "opacity 0.15s ease-in",
          }}
        >
          {filteredLines.map(({ pageNumber, line }) => {
            const fontFamily = `QCF2_P${String(pageNumber).padStart(3, "0")}`;

            // Surah header line
            if (line.lineType === "surah_name") {
              const surahWord = line.words.find((w) => w.charType === "surah_name");
              const surahNum = surahWord?.surahNumber ?? 0;
              const page = mushafPages.find((p) => p.pageNumber === pageNumber);
              const surahInfo = page?.surahs.find((s) => s.number === surahNum);
              const ligature = `surah${String(surahNum).padStart(3, "0")}`;
              return (
                <div key={`${pageNumber}-${line.lineNumber}`} className="mushaf-surah-header">
                  {surahFontLoaded ? (
                    <span className="mushaf-surah-name">{ligature}</span>
                  ) : (
                    <span className="mushaf-surah-name-fallback">
                      {surahInfo?.nameArabic || `سورة ${surahNum}`}
                    </span>
                  )}
                </div>
              );
            }

            // Bismillah line
            if (line.lineType === "bismillah") {
              return (
                <div
                  key={`${pageNumber}-${line.lineNumber}`}
                  className="mushaf-bismillah-line"
                  style={{ fontFamily: '"QCF_Bismillah", "QPC Hafs", "UthmanicHafs", serif' }}
                >
                  <span className="mushaf-word mushaf-bismillah">
                    {line.words.map((w) => w.glyph || w.text).join("") || "﷽"}
                  </span>
                </div>
              );
            }

            // Regular text line — identical to MushafPageClient
            const centered = isCenterAligned(pageNumber, line.lineNumber);
            return (
              <div
                key={`${pageNumber}-${line.lineNumber}`}
                className={`mushaf-line ${centered ? "mushaf-line-center" : "mushaf-line-justify"}`}
                style={{ fontFamily: `"${fontFamily}", "UthmanicHafs", "QPC Hafs", serif` }}
              >
                {line.words.map((w) => {
                  const isOurAyah = w.surahNumber === surahNumber && ayahSet.has(w.ayahNumber);
                  const isTarget = w.surahNumber === surahNumber && w.ayahNumber === targetAyah;
                  return (
                    <span
                      key={w.position}
                      className="mushaf-word"
                      style={{ opacity: !isOurAyah ? 0.15 : isTarget ? 1 : 0.4 }}
                    >
                      {w.glyph || w.text}
                    </span>
                  );
                })}
              </div>
            );
          })}

          {/* Translation — inside the frame, same width */}
          {translation && (
            <div dir="ltr" className="mushaf-ayah-translation">
              <p className="mushaf-ayah-translation-text">{translation}</p>
              <p className="mushaf-ayah-translation-source">
                {surahNameEnglish} {surahNumber}:{targetAyah} — [{translatorName}]
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav — same as mushaf */}
      <div className="flex items-center justify-center px-3 py-2 border-t bg-card shrink-0 gap-4 text-sm">
        <button
          onClick={() => canGoNext && router.push(`/quran/${surahNumber}/${targetAyah + 1}`)}
          disabled={!canGoNext}
          className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
          aria-label={t("mushaf.nextPage")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="text-muted-foreground">
          {t("mushaf.ayah")} {targetAyah} / {totalAyahs}
        </span>

        <button
          onClick={() => canGoPrev && router.push(`/quran/${surahNumber}/${targetAyah - 1}`)}
          disabled={!canGoPrev}
          className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
          aria-label={t("mushaf.prevPage")}
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <button
          onClick={() => router.push("/mushaf/pdf")}
          className="px-2 py-1 rounded text-xs bg-muted hover:bg-muted/80 transition-colors text-muted-foreground hidden sm:block"
        >
          {t("mushaf.viewFullSurah") || "View Full Surah"}
        </button>
      </div>

      <style jsx global>{`
        .mushaf-bg {
          background-color: hsl(var(--reader-bg, 40 30% 96%));
          color: hsl(var(--reader-fg, 0 0% 10%));
          padding: 1rem 0;
        }
        @media (min-width: 640px) {
          .mushaf-bg { padding: 1.5rem 0; }
        }

        .ayah-view .mushaf-page-frame {
          width: 100%;
          max-width: 540px;
          margin: 0 auto;
          padding: 0.5rem 1rem;
          display: flex;
          flex-direction: column;
          min-height: auto;
          align-self: flex-start;
        }
        @media (min-width: 640px) {
          .ayah-view .mushaf-page-frame {
            padding: 1.5rem 2rem;
            background: hsl(var(--reader-bg, 40 30% 96%));
          }
        }

        .mushaf-line {
          display: flex;
          align-items: baseline;
          direction: rtl;
          line-height: 3.4;
          font-size: 1.55rem;
          min-height: 2.8rem;
        }
        @media (min-width: 640px) {
          .mushaf-line {
            font-size: 1.7rem;
            line-height: 3.5;
          }
        }

        /* Force ayah-view lines to same compressed height as full mushaf */
        .ayah-view .mushaf-line {
          height: 2.8rem;
          overflow: visible;
        }
        @media (min-width: 640px) {
          .ayah-view .mushaf-line {
            height: 2.8rem;
          }
        }

        .mushaf-line-justify { justify-content: space-between; }
        .mushaf-line-center { justify-content: center; gap: 0.2em; }
        .mushaf-word { cursor: default; }

        .mushaf-surah-header {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          padding: 0.2rem 1rem;
          margin: 3.5rem 0 0.5rem;
          border-radius: 8px;
          border: 1.5px solid hsl(0 0% 25%);
        }
        :is(.dark) .mushaf-surah-header { border-color: hsl(0 0% 75%); }

        .mushaf-surah-name {
          font-family: "SurahNameV2", serif;
          font-size: 2.8rem;
          line-height: 1.4;
          display: block;
          width: 100%;
          text-align: center;
        }
        @media (min-width: 640px) {
          .mushaf-surah-name { font-size: 3.2rem; }
        }

        .mushaf-surah-name-fallback {
          font-family: "UthmanicHafs", "Noto Naskh Arabic", serif;
          font-size: 1.3rem;
          line-height: 1.6;
          color: hsl(25 50% 22%);
        }
        :is(.dark) .mushaf-surah-name-fallback { color: hsl(38 40% 80%); }

        .mushaf-bismillah-line {
          display: flex;
          align-items: baseline;
          justify-content: center;
          direction: rtl;
          line-height: 2;
          min-height: auto;
          gap: 0.2em;
        }
        .mushaf-bismillah {
          font-size: 1.6rem;
          line-height: 2 !important;
        }

        /* Translation block */
        .mushaf-ayah-translation {
          margin-top: 1rem;
          padding-top: 0.75rem;
          border-top: 1px solid hsl(var(--border));
          text-align: center;
        }
        .mushaf-ayah-translation-text {
          font-size: 0.875rem;
          line-height: 1.6;
          opacity: 0.7;
        }
        .mushaf-ayah-translation-source {
          font-size: 0.7rem;
          opacity: 0.4;
          margin-top: 0.25rem;
        }

        /* Font faces */
        @font-face {
          font-family: "UthmanicHafs";
          src: url("/fonts/mushaf/UthmanicHafs_V22.woff2") format("woff2");
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }
        @font-face {
          font-family: "SurahNameV2";
          src: url("/fonts/mushaf/surah-name-v2.woff2") format("woff2");
          font-weight: normal;
          font-style: normal;
          font-display: block;
        }
        @font-face {
          font-family: "QCF_Bismillah";
          src: url("/fonts/mushaf/QCF_Bismillah.woff2") format("woff2");
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }
      `}</style>
    </div>
  );
}
