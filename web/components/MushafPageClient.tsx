"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useAppConfig } from "@/lib/config";
import { triggerHaptic } from "@/lib/haptics";

// --- Types ---

interface MushafWord {
  position: number;
  charType: string;
  surahNumber: number;
  ayahNumber: number;
  wordPosition: number;
  text: string;
  glyph: string;
}

interface MushafLine {
  lineNumber: number;
  lineType: string;
  words: MushafWord[];
}

interface MushafSurahInfo {
  number: number;
  nameArabic: string;
  nameEnglish: string;
}

export interface MushafPageData {
  pageNumber: number;
  totalPages: number;
  juzNumber: number | null;
  hizbNumber: number | null;
  surahs: MushafSurahInfo[];
  lines: MushafLine[];
}

interface Props {
  initialData: MushafPageData;
}

// Pages where ALL lines should be center-aligned (Al-Fatiha, first page of Al-Baqarah)
const CENTER_ALIGNED_PAGES = [1, 2];

// Specific lines on specific pages that should be center-aligned
const CENTER_ALIGNED_LINES: Record<number, number[]> = {
  255: [2],
  528: [9],
  534: [6],
  545: [6],
  586: [1],
  593: [2],
  594: [5],
  600: [10],
  602: [5, 15],
  603: [10, 15],
  604: [4, 9, 14, 15],
};

function isCenterAligned(pageNumber: number, lineNumber: number): boolean {
  if (CENTER_ALIGNED_PAGES.includes(pageNumber)) return true;
  return CENTER_ALIGNED_LINES[pageNumber]?.includes(lineNumber) ?? false;
}

// --- Component ---

export function MushafPageClient({ initialData }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { config } = useAppConfig();
  const [data, setData] = useState<MushafPageData>(initialData);
  const [fontLoaded, setFontLoaded] = useState(false);
  const [surahFontLoaded, setSurahFontLoaded] = useState(false);
  const [pageInput, setPageInput] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const page = data.pageNumber;

  // Load page-specific QPC V2 font
  useEffect(() => {
    setFontLoaded(false);
    const fontName = `QCF2_P${String(page).padStart(3, "0")}`;
    const fontUrl = `/fonts/mushaf/v2/p${page}.woff2`;

    const font = new FontFace(fontName, `url(${fontUrl})`);
    font
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
        setFontLoaded(true);
      })
      .catch(() => {
        setFontLoaded(true);
      });

    // Prefetch adjacent page fonts
    [page - 1, page + 1]
      .filter((p) => p >= 1 && p <= 604)
      .forEach((p) => {
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.as = "font";
        link.href = `/fonts/mushaf/v2/p${p}.woff2`;
        link.crossOrigin = "anonymous";
        document.head.appendChild(link);
      });
  }, [page]);

  // Load Surah Name v2 font
  useEffect(() => {
    const font = new FontFace("SurahNameV2", 'url(/fonts/mushaf/surah-name-v2.woff2)');
    font
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
        setSurahFontLoaded(true);
      })
      .catch(() => {});
  }, []);

  const navigateTo = useCallback(
    (targetPage: number) => {
      router.push(`/mushaf/${targetPage}`, { scroll: false });
    },
    [router]
  );

  // Keyboard navigation (RTL: Left = next, Right = prev)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowLeft") navigateTo(Math.min(page + 1, 604));
      if (e.key === "ArrowRight") navigateTo(Math.max(page - 1, 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [page, navigateTo]);

  // Swipe navigation
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
        if (config.hapticsEnabled) triggerHaptic("light");
        if (dx < 0) navigateTo(Math.min(page + 1, 604));
        else navigateTo(Math.max(page - 1, 1));
      }
    },
    [page, config.hapticsEnabled, navigateTo]
  );

  // Page input handler
  const handlePageSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const target = Number(pageInput);
      if (target >= 1 && target <= 604) {
        navigateTo(target);
        setPageInput("");
      }
    },
    [pageInput, navigateTo]
  );

  const fontFamily = `QCF2_P${String(page).padStart(3, "0")}`;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Mushaf page content */}
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
            opacity: fontLoaded ? 1 : 0.3,
            transition: "opacity 0.15s ease-in",
          }}
        >
          {data.lines.map((line) => {
            // Surah header line
            if (line.lineType === "surah_name") {
              const surahWord = line.words.find((w) => w.charType === "surah_name");
              const surahNum = surahWord?.surahNumber ?? 0;
              const surahInfo = data.surahs.find((s) => s.number === surahNum);
              const ligature = `surah${String(surahNum).padStart(3, "0")}`;
              return (
                <div key={`line-${line.lineNumber}`} className="mushaf-surah-header">
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
                  key={`line-${line.lineNumber}`}
                  className="mushaf-bismillah-line"
                  style={{
                    fontFamily: '"QCF_Bismillah", "QPC Hafs", "UthmanicHafs", serif',
                  }}
                >
                  <span className="mushaf-word mushaf-bismillah">
                    {line.words.map((w) => w.glyph || w.text).join("") || "﷽"}
                  </span>
                </div>
              );
            }

            // Regular text line
            const centered = isCenterAligned(page, line.lineNumber);

            return (
              <div
                key={`line-${line.lineNumber}`}
                className={`mushaf-line ${centered ? "mushaf-line-center" : "mushaf-line-justify"}`}
                style={{
                  fontFamily: `"${fontFamily}", "UthmanicHafs", "QPC Hafs", serif`,
                }}
              >
                {line.words.map((w) => (
                  <span key={w.position} className="mushaf-word">
                    {w.glyph || w.text}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom navigation bar */}
      <div className="flex items-center justify-center px-3 py-2 border-t bg-card shrink-0 gap-4 text-sm">
        <button
          onClick={() => navigateTo(Math.min(page + 1, 604))}
          disabled={page >= 604}
          className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
          aria-label={t("mushaf.nextPage")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <form onSubmit={handlePageSubmit} className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={604}
            placeholder={String(page)}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            className="w-12 text-center bg-muted rounded px-1 py-0.5 text-sm border-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-label={t("mushaf.goToPage")}
          />
          <span className="text-muted-foreground">/ 604</span>
        </form>

        <button
          onClick={() => navigateTo(Math.max(page - 1, 1))}
          disabled={page <= 1}
          className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
          aria-label={t("mushaf.prevPage")}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <style jsx global>{`
        .mushaf-bg {
          background-color: hsl(var(--reader-bg, 40 30% 96%));
          color: hsl(var(--reader-fg, 0 0% 10%));
          padding: 1rem 0;
        }

        @media (min-width: 640px) {
          .mushaf-bg {
            padding: 1.5rem 0;
          }
        }

        .mushaf-page-frame {
          width: 100%;
          max-width: 540px;
          margin: 0 auto;
          padding: 0.5rem 1rem;
          display: flex;
          flex-direction: column;
          min-height: calc(100vh - 8rem);
        }

        @media (min-width: 640px) {
          .mushaf-page-frame {
            padding: 1.5rem 2rem;
            background: hsl(var(--reader-bg, 40 30% 96%));
            min-height: auto;
          }
        }

        .mushaf-line {
          display: flex;
          align-items: baseline;
          direction: rtl;
          line-height: 3.4;
          font-size: clamp(1.05rem, 4.3vw, 1.55rem);
          min-height: 2.8rem;
        }

        @media (min-width: 640px) {
          .mushaf-line {
            font-size: 1.7rem;
            line-height: 3.5;
          }
        }

        .mushaf-line-justify {
          justify-content: space-between;
        }

        .mushaf-line-center {
          justify-content: center;
          gap: 0.2em;
        }

        .mushaf-word {
          cursor: default;
        }

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

        :is(.dark) .mushaf-surah-header {
          border-color: hsl(0 0% 75%);
        }

        .mushaf-surah-name {
          font-family: "SurahNameV2", serif;
          font-size: 2.8rem;
          line-height: 1.4;
          display: block;
          width: 100%;
          text-align: center;
        }

        @media (min-width: 640px) {
          .mushaf-surah-name {
            font-size: 3.2rem;
          }
        }

        .mushaf-surah-name-fallback {
          font-family: "UthmanicHafs", "Noto Naskh Arabic", serif;
          font-size: 1.3rem;
          line-height: 1.6;
          color: hsl(25 50% 22%);
        }

        :is(.dark) .mushaf-surah-name-fallback {
          color: hsl(38 40% 80%);
        }

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
