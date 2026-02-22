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

// Juz start pages (approximate standard mushaf)
const JUZ_START_PAGES = [
  1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282,
  302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

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

  // Load page-specific V4-tajweed font
  useEffect(() => {
    setFontLoaded(false);
    const fontName = `p${page}-v4`;
    const fontUrl = `/fonts/mushaf/v4/p${page}.woff2`;

    const font = new FontFace(fontName, `url(${fontUrl})`);
    font.load().then((loaded) => {
      document.fonts.add(loaded);
      setFontLoaded(true);
    }).catch(() => {
      // Font load failed — fallback to unicode text
      setFontLoaded(true);
    });

    // Prefetch adjacent page fonts
    [page - 1, page + 1].filter((p) => p >= 1 && p <= 604).forEach((p) => {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = "font";
      link.href = `/fonts/mushaf/v4/p${p}.woff2`;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    });
  }, [page]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      // RTL: Left = next page, Right = prev page
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

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      // RTL: swipe left = next, swipe right = prev
      if (dx < 0) navigateTo(Math.min(page + 1, 604));
      else navigateTo(Math.max(page - 1, 1));
    }
  }, [page]);

  const navigateTo = useCallback((targetPage: number) => {
    router.push(`/mushaf/${targetPage}`, { scroll: false });
  }, [router]);

  // Surah select handler
  const handleSurahSelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const surahNum = Number(e.target.value);
    if (!surahNum) return;
    // Find the first page of this surah from our data
    // Use the API to look up the page (approximate: surah start pages)
    fetch(`/api/quran/ayahs?surah=${surahNum}&limit=1`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ayahs?.[0]?.pageNumber) {
          navigateTo(data.ayahs[0].pageNumber);
        }
      })
      .catch(() => {});
  }, [navigateTo]);

  // Juz select handler
  const handleJuzSelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const juzNum = Number(e.target.value);
    if (!juzNum || juzNum < 1 || juzNum > 30) return;
    navigateTo(JUZ_START_PAGES[juzNum - 1]);
  }, [navigateTo]);

  // Page input handler
  const handlePageSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const target = Number(pageInput);
    if (target >= 1 && target <= 604) {
      navigateTo(target);
      setPageInput("");
    }
  }, [pageInput, navigateTo]);

  const fontFamily = `p${page}-v4`;
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
            <span className="text-sm text-muted-foreground">
              {t("mushaf.of")} 604
            </span>
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
        className="flex-1 overflow-auto flex justify-center py-4 sm:py-6 mushaf-bg"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="w-full max-w-[600px] mx-auto px-4 sm:px-6"
          dir="rtl"
          style={{
            opacity: fontLoaded ? 1 : 0.3,
            transition: "opacity 0.2s ease-in",
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
                <div key={`line-${line.lineNumber}`} className="my-3">
                  <div className="flex items-center justify-center gap-3 py-2 px-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                    <span
                      className="text-2xl text-emerald-800 dark:text-emerald-200"
                      style={{ fontFamily: '"Surah Names", "QPC Hafs", serif' }}
                    >
                      {surahInfo?.nameArabic || ""}
                    </span>
                  </div>
                </div>
              );
            }

            // Bismillah line (centered, uses Unicode ﷽ character)
            if (line.lineType === "bismillah") {
              return (
                <div
                  key={`line-${line.lineNumber}`}
                  className="flex justify-center my-2 leading-[3rem]"
                  style={{
                    fontFamily: '"QPC Hafs", serif',
                    fontSize: "1.75rem",
                  }}
                >
                  <span className="mushaf-word">﷽</span>
                </div>
              );
            }

            // Centered text line (e.g., Al-Fatiha, start of Al-Baqarah)
            const isCentered = line.lineType === "center";

            return (
              <div
                key={`line-${line.lineNumber}`}
                className={`flex items-baseline leading-[3.2rem] sm:leading-[3.5rem] min-h-[2.5rem] ${
                  isCentered ? "justify-center gap-[0.3em]" : "justify-between"
                }`}
                style={{
                  fontFamily: `"${fontFamily}", "QPC Hafs", serif`,
                  fontSize: "1.65rem",
                }}
              >
                {line.words.map((w) => {
                  const highlighted = isHighlighted(w);
                  const isEnd = w.charType === "end";

                  return (
                    <span
                      key={w.position}
                      className={`mushaf-word rounded px-px ${
                        highlighted
                          ? "bg-emerald-100 dark:bg-emerald-900/40"
                          : ""
                      } ${isEnd ? "text-[0.75em] text-emerald-700 dark:text-emerald-400 mx-0.5" : ""}`}
                    >
                      {w.glyph || w.text}
                    </span>
                  );
                })}
              </div>
            );
          })}
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
        .mushaf-bg {
          background-color: hsl(var(--reader-bg));
          color: hsl(var(--reader-fg));
        }
      `}</style>
    </div>
  );
}
