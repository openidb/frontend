"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

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

interface SurahSummary {
  number: number;
  nameArabic: string;
  nameEnglish: string;
  ayahCount: number;
}

interface Props {
  initialData: MushafPageData;
  allSurahs: SurahSummary[];
  highlightAyah?: { surah: number; ayah: number } | null;
}

// Juz start pages (standard Madani mushaf)
const JUZ_START_PAGES = [
  1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282,
  302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

// Pages where ALL lines should be center-aligned (Al-Fatiha, first page of Al-Baqarah)
const CENTER_ALIGNED_PAGES = [1, 2];

// Specific lines on specific pages that should be center-aligned
// (last ayah of certain surahs where text doesn't fill the line)
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

export function MushafPageClient({ initialData, allSurahs, highlightAyah }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [data, setData] = useState<MushafPageData>(initialData);
  const [fontLoaded, setFontLoaded] = useState(false);
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
        // Font load failed — fallback to unicode text
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

  // Keyboard navigation (RTL: Left = next, Right = prev)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowLeft") navigateTo(Math.min(page + 1, 604));
      if (e.key === "ArrowRight") navigateTo(Math.max(page - 1, 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [page]);

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
        if (dx < 0) navigateTo(Math.min(page + 1, 604));
        else navigateTo(Math.max(page - 1, 1));
      }
    },
    [page]
  );

  const navigateTo = useCallback(
    (targetPage: number) => {
      router.push(`/mushaf/${targetPage}`, { scroll: false });
    },
    [router]
  );

  // Surah select handler
  const handleSurahSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const surahNum = Number(e.target.value);
      if (!surahNum) return;
      fetch(`/api/quran/ayahs?surah=${surahNum}&limit=1`)
        .then((res) => res.json())
        .then((data) => {
          if (data.ayahs?.[0]?.pageNumber) {
            navigateTo(data.ayahs[0].pageNumber);
          }
        })
        .catch(() => {});
    },
    [navigateTo]
  );

  // Juz select handler
  const handleJuzSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const juzNum = Number(e.target.value);
      if (!juzNum || juzNum < 1 || juzNum > 30) return;
      navigateTo(JUZ_START_PAGES[juzNum - 1]);
    },
    [navigateTo]
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
  const isHighlighted = (w: MushafWord) =>
    highlightAyah
      ? w.surahNumber === highlightAyah.surah && w.ayahNumber === highlightAyah.ayah
      : false;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top navigation bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-card shrink-0 gap-2 flex-wrap">
        {/* Left: Surah and Juz selectors */}
        <div className="flex items-center gap-2 text-sm">
          <select
            value=""
            onChange={handleSurahSelect}
            className="bg-muted text-foreground rounded px-2 py-1 text-sm border-0 cursor-pointer"
            aria-label={t("mushaf.goToSurah")}
          >
            <option value="">{t("mushaf.surah")}</option>
            {allSurahs.map((s) => (
              <option key={s.number} value={s.number}>
                {s.number}. {s.nameEnglish}
              </option>
            ))}
          </select>

          <select
            value=""
            onChange={handleJuzSelect}
            className="bg-muted text-foreground rounded px-2 py-1 text-sm border-0 cursor-pointer"
            aria-label={t("mushaf.goToJuz")}
          >
            <option value="">{t("mushaf.juz")}</option>
            {Array.from({ length: 30 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {t("mushaf.juz")} {i + 1}
              </option>
            ))}
          </select>
        </div>

        {/* Center: Page info and navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigateTo(Math.max(page - 1, 1))}
            disabled={page <= 1}
            className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
            aria-label={t("mushaf.prevPage")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <form onSubmit={handlePageSubmit} className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">{t("mushaf.page")}</span>
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
            <span className="text-sm text-muted-foreground">{t("mushaf.of")} 604</span>
          </form>

          <button
            onClick={() => navigateTo(Math.min(page + 1, 604))}
            disabled={page >= 604}
            className="p-1.5 rounded hover:bg-muted disabled:opacity-30 transition-colors"
            aria-label={t("mushaf.nextPage")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Right: Juz/Surah info */}
        <div className="text-xs text-muted-foreground hidden sm:block">
          {data.surahs.map((s) => s.nameEnglish).join(" / ")}
          {data.juzNumber && ` — ${t("mushaf.juz")} ${data.juzNumber}`}
        </div>
      </div>

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
              const surahInfo = surahWord
                ? data.surahs.find((s) => s.number === surahWord.surahNumber)
                : null;
              return (
                <div key={`line-${line.lineNumber}`} className="mushaf-surah-header">
                  <div className="mushaf-surah-header-inner">
                    <div className="mushaf-surah-ornament mushaf-surah-ornament-right" />
                    <span
                      className="mushaf-surah-name"
                      style={{ fontFamily: '"QCF_SurahHeader", "Surah Names", serif' }}
                    >
                      {/* Render the glyph code for the surah header font */}
                      {surahWord?.glyph || surahInfo?.nameArabic || ""}
                    </span>
                    <div className="mushaf-surah-ornament mushaf-surah-ornament-left" />
                  </div>
                </div>
              );
            }

            // Bismillah line
            if (line.lineType === "bismillah") {
              return (
                <div
                  key={`line-${line.lineNumber}`}
                  className="mushaf-line mushaf-line-center"
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
                {line.words.map((w) => {
                  const highlighted = isHighlighted(w);
                  const isEnd = w.charType === "end";

                  return (
                    <span
                      key={w.position}
                      className={`mushaf-word${highlighted ? " mushaf-word-highlighted" : ""}${isEnd ? " mushaf-word-end" : ""}`}
                    >
                      {w.glyph || w.text}
                    </span>
                  );
                })}
              </div>
            );
          })}

          {/* Page number footer */}
          <div className="mushaf-page-number">{page}</div>
        </div>
      </div>

      {/* Bottom page indicator (mobile) */}
      <div className="sm:hidden flex items-center justify-center py-2 border-t bg-card text-xs text-muted-foreground shrink-0">
        {data.surahs.map((s) => s.nameEnglish).join(" / ")}
        {" — "}
        {t("mushaf.page")} {page}
        {data.juzNumber && ` — ${t("mushaf.juz")} ${data.juzNumber}`}
      </div>

      <style jsx global>{`
        /* ===== Mushaf Page Layout ===== */

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

        /* Page frame — fixed width to match mushaf proportions */
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
            border: 1px solid hsl(var(--border, 0 0% 85%));
            border-radius: 4px;
            background: hsl(var(--reader-bg, 40 30% 96%));
            box-shadow: 0 2px 20px rgba(0, 0, 0, 0.04);
            min-height: auto;
          }
        }

        /* ===== Line Layout ===== */

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

        /* Key: space-between to fill the line width (like printed mushaf) */
        .mushaf-line-justify {
          justify-content: space-between;
        }

        /* Center alignment for Al-Fatiha, page 2, and short last-ayah lines */
        .mushaf-line-center {
          justify-content: center;
          gap: 0.2em;
        }

        /* ===== Words ===== */

        .mushaf-word {
          cursor: default;
          padding: 0 1px;
          border-radius: 2px;
          transition: background-color 0.15s;
        }

        .mushaf-word:hover {
          background-color: hsl(var(--accent, 150 40% 90%) / 0.4);
        }

        .mushaf-word-highlighted {
          background-color: hsl(160 50% 90% / 0.6);
        }

        :is(.dark) .mushaf-word-highlighted {
          background-color: hsl(160 40% 20% / 0.5);
        }

        .mushaf-word-end {
          font-size: 0.75em;
          color: hsl(160 50% 30%);
        }

        :is(.dark) .mushaf-word-end {
          color: hsl(160 40% 60%);
        }

        /* ===== Surah Header ===== */

        .mushaf-surah-header {
          margin: 0.6rem 0;
        }

        .mushaf-surah-header-inner {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          background: linear-gradient(
            135deg,
            hsl(150 30% 94%),
            hsl(150 25% 90%)
          );
          border: 1px solid hsl(150 20% 82%);
          position: relative;
        }

        :is(.dark) .mushaf-surah-header-inner {
          background: linear-gradient(
            135deg,
            hsl(150 20% 14%),
            hsl(150 15% 12%)
          );
          border-color: hsl(150 15% 25%);
        }

        .mushaf-surah-name {
          font-size: 1.6rem;
          color: hsl(150 40% 25%);
          line-height: 2;
        }

        :is(.dark) .mushaf-surah-name {
          color: hsl(150 30% 75%);
        }

        .mushaf-surah-ornament {
          flex: 1;
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent,
            hsl(150 20% 70%),
            transparent
          );
        }

        :is(.dark) .mushaf-surah-ornament {
          background: linear-gradient(
            90deg,
            transparent,
            hsl(150 15% 35%),
            transparent
          );
        }

        /* ===== Bismillah ===== */

        .mushaf-bismillah {
          font-size: 1.6rem;
        }

        /* ===== Page Number ===== */

        .mushaf-page-number {
          text-align: center;
          padding-top: 0.75rem;
          margin-top: auto;
          font-size: 0.8rem;
          color: hsl(0 0% 55%);
          font-family: serif;
          letter-spacing: 0.05em;
        }

        /* ===== Font face for static mushaf fonts ===== */

        @font-face {
          font-family: "UthmanicHafs";
          src: url("/fonts/mushaf/UthmanicHafs_V22.woff2") format("woff2");
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }

        @font-face {
          font-family: "QCF_SurahHeader";
          src: url("/fonts/mushaf/QCF_SurahHeader_COLOR-Regular.woff2") format("woff2");
          font-weight: normal;
          font-style: normal;
          font-display: swap;
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
