"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Headphones, Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useQuranAudio } from "@/lib/use-quran-audio";
import type { MushafPageData } from "./MushafPageClient";

interface TafsirEdition {
  id: string;
  name: string;
  language: string;
  author: string | null;
  direction: string;
}

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
  surahNameArabic: string;
  totalAyahs: number;
  mushafPages: MushafPageData[];
  initialAudioMode?: boolean;
}

const PREFERRED_EDITIONS: Record<string, { id: string; name: string }> = {
  en: { id: "eng-mustafakhattabg", name: "Dr. Mustafa Khattab, The Clear Quran" },
  ar: { id: "ara-kingfahadquranc", name: "King Fahad Quran Complex" },
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

// Get display name for a language code using Intl API; returns null if unresolvable
function getLanguageName(code: string): string | null {
  try {
    const name = new Intl.DisplayNames([code, "en"], { type: "language" }).of(code);
    if (name && name !== code) return name;
  } catch {}
  return null;
}

// Preferred tafsir editions per language (Ibn Kathir where available)
const PREFERRED_TAFSIRS: Record<string, string> = {
  en: "en-tafisr-ibn-kathir",     // Ibn Kathir (abridged)
  ar: "ar-tafsir-ibn-kathir",     // Tafsir Ibn Kathir
  bn: "bn-tafseer-ibn-e-kaseer",  // Tafseer ibn Kathir
  ur: "ur-tafseer-ibn-e-kaseer",  // Tafsir Ibn Kathir
  ru: "qul-913",                  // Tafsir Ibne Kathir
  tr: "qul-914",                  // Tafsir Ibne Kathir
};

// Pages where ALL lines should be center-aligned
const CENTER_ALIGNED_PAGES = [1, 2];
// Module-level caches (persist across React re-renders and navigations)
const loadedFonts = new Set<string>();
const translationCache = new Map<string, string>(); // "surah:ayah:edition" → text
const tafsirCache = new Map<string, string>(); // "surah:ayah:edition" → html
const tafsirFetching = new Set<string>(); // dedup in-flight tafsir fetches

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
  surahNameArabic,
  totalAyahs,
  mushafPages: serverMushafPages,
  initialAudioMode = false,
}: Props) {
  const { t, locale } = useTranslation();
  const router = useRouter();

  // --- Client-side state for instant ayah transitions in audio mode ---
  const [clientAyah, setClientAyah] = useState(targetAyah);
  const [clientMushafPages, setClientMushafPages] = useState(serverMushafPages);
  const mushafCacheRef = useRef(new Map<number, MushafPageData>());

  // Sync from server props when they change (real navigation / initial load)
  useEffect(() => { setClientAyah(targetAyah); }, [targetAyah]);
  useEffect(() => {
    setClientMushafPages(serverMushafPages);
    for (const p of serverMushafPages) mushafCacheRef.current.set(p.pageNumber, p);
  }, [serverMushafPages]);

  // Client-side navigation: update state + URL without server round-trip
  const handleAudioNavigate = useCallback((ayah: number) => {
    history.replaceState(null, '', `/quran/${surahNumber}/${ayah}?audio=1`);
    setClientAyah(ayah);

    // Find cached mushaf pages containing the 3 display ayahs
    const displayAyahs = new Set<number>();
    if (ayah > 1) displayAyahs.add(ayah - 1);
    displayAyahs.add(ayah);
    if (ayah < totalAyahs) displayAyahs.add(ayah + 1);

    const pages: MushafPageData[] = [];
    for (const page of mushafCacheRef.current.values()) {
      for (const line of page.lines) {
        if (line.lineType !== 'text') continue;
        if (line.words.some(w => w.surahNumber === surahNumber && displayAyahs.has(w.ayahNumber))) {
          pages.push(page);
          break;
        }
      }
    }
    if (pages.length > 0) {
      pages.sort((a, b) => a.pageNumber - b.pageNumber);
      setClientMushafPages(pages);
    }
  }, [surahNumber, totalAyahs]);

  const {
    isAudioMode,
    isPlaying,
    toggleAudioMode,
    play,
    pause,
    skipForward,
    skipBack,
    highlightedPosition,
    audioRef,
  } = useQuranAudio(surahNumber, clientAyah, totalAyahs, clientMushafPages, router, initialAudioMode, handleAudioNavigate);

  // Pre-fetch upcoming mushaf pages in audio mode
  useEffect(() => {
    if (!isAudioMode) return;
    const maxPage = Math.max(...clientMushafPages.map(p => p.pageNumber));
    for (let p = maxPage + 1; p <= Math.min(maxPage + 3, 604); p++) {
      if (mushafCacheRef.current.has(p)) continue;
      fetch(`/api/quran/mushaf/${p}`)
        .then(r => r.ok ? r.json() : null)
        .then((data: MushafPageData | null) => {
          if (data) mushafCacheRef.current.set(data.pageNumber, data);
        })
        .catch(() => {});
    }
  }, [isAudioMode, clientMushafPages]);

  const [fontsLoaded, setFontsLoaded] = useState<Set<number>>(new Set());
  const [surahFontLoaded, setSurahFontLoaded] = useState(false);
  const [tafsirEditions, setTafsirEditions] = useState<TafsirEdition[]>([]);
  const [tafsirLang, setTafsirLang] = useState<string>("");
  const [tafsirEditionId, setTafsirEditionId] = useState<string>("");
  const [tafsirTick, setTafsirTick] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const canGoPrev = clientAyah > 1;
  const canGoNext = clientAyah < totalAyahs;
  // Show prev + current + next, but don't cross surah boundaries
  const ayahSet = new Set<number>();
  if (clientAyah > 1) ayahSet.add(clientAyah - 1);
  ayahSet.add(clientAyah);
  if (clientAyah < totalAyahs) ayahSet.add(clientAyah + 1);

  // Load QPC V2 fonts for relevant pages (skip already-loaded fonts)
  useEffect(() => {
    const pages = clientMushafPages.map((p) => p.pageNumber);
    const alreadyLoaded = new Set<number>();
    const toLoad: number[] = [];
    for (const page of pages) {
      const fontName = `QCF2_P${String(page).padStart(3, "0")}`;
      if (loadedFonts.has(fontName)) {
        alreadyLoaded.add(page);
      } else {
        toLoad.push(page);
      }
    }
    if (toLoad.length === 0) {
      setFontsLoaded(new Set(pages));
      return;
    }
    Promise.all(
      toLoad.map(async (page) => {
        const fontName = `QCF2_P${String(page).padStart(3, "0")}`;
        try {
          const font = new FontFace(fontName, `url(/fonts/mushaf/v2/p${page}.woff2)`);
          const f = await font.load();
          document.fonts.add(f);
          loadedFonts.add(fontName);
          alreadyLoaded.add(page);
        } catch {}
      })
    ).then(() => setFontsLoaded(new Set(alreadyLoaded)));
  }, [clientMushafPages]);

  // Prefetch adjacent ayah routes for non-audio navigation
  useEffect(() => {
    if (isAudioMode) return; // Audio mode uses client-side transitions
    if (canGoPrev) router.prefetch(`/quran/${surahNumber}/${clientAyah - 1}`);
    if (canGoNext) router.prefetch(`/quran/${surahNumber}/${clientAyah + 1}`);
  }, [surahNumber, clientAyah, canGoPrev, canGoNext, router, isAudioMode]);

  // Load surah name font
  useEffect(() => {
    const font = new FontFace("SurahNameV2", "url(/fonts/mushaf/surah-name-v2.woff2)");
    font.load().then((f) => { document.fonts.add(f); setSurahFontLoaded(true); }).catch(() => {});
  }, []);

  // Translations: read synchronously from module-level cache (zero flicker)
  const ayahNumbers = Array.from(ayahSet).sort((a, b) => a - b);
  const translationEdition = PREFERRED_EDITIONS[locale] || PREFERRED_EDITIONS.en;
  const [translationTick, setTranslationTick] = useState(0);

  // Synchronous read from cache — available on the SAME render frame
  const translations: Record<number, string> = {};
  if (locale !== "ar") {
    for (const num of ayahNumbers) {
      const val = translationCache.get(`${surahNumber}:${num}:${translationEdition.id}`);
      if (val) translations[num] = val;
    }
  }
  const translatorName = locale !== "ar" ? translationEdition.name : "";

  // Background fetch: populate cache, bump tick to trigger re-render when done
  useEffect(() => {
    if (locale === "ar") return;
    const warmRange = isAudioMode ? 20 : 2;
    const toFetch: number[] = [];
    for (let i = -warmRange; i <= warmRange; i++) {
      const a = clientAyah + i;
      if (a >= 1 && a <= totalAyahs && !translationCache.has(`${surahNumber}:${a}:${translationEdition.id}`)) {
        toFetch.push(a);
      }
    }
    if (toFetch.length === 0) return;
    let cancelled = false;
    Promise.all(
      toFetch.map((num) =>
        fetch(`/api/quran/translations/${surahNumber}/${num}?editionId=${translationEdition.id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d?.translations?.[0]?.text) {
              translationCache.set(`${surahNumber}:${num}:${translationEdition.id}`, d.translations[0].text);
            }
          })
          .catch(() => {})
      )
    ).then(() => { if (!cancelled) setTranslationTick((t) => t + 1); });
    return () => { cancelled = true; };
  }, [surahNumber, clientAyah, locale, isAudioMode, totalAyahs]);

  // Fetch available tafsir editions
  useEffect(() => {
    fetch("/api/quran/tafsirs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.tafsirs) return;
        const editions: TafsirEdition[] = d.tafsirs.filter(
          (t: TafsirEdition) => t.language && t.language !== "unknown"
        );
        setTafsirEditions(editions);
        // Default to user's locale or Arabic (only if language name is resolvable)
        const hasLang = (l: string) => editions.some((e: TafsirEdition) => e.language === l) && getLanguageName(l);
        const defaultLang = hasLang(locale) ? locale
          : hasLang("ar") ? "ar" : editions.find((e: TafsirEdition) => getLanguageName(e.language))?.language || "";
        setTafsirLang(defaultLang);
        // Prefer Ibn Kathir for the default language, otherwise first edition
        const langEditions = editions.filter((e: TafsirEdition) => e.language === defaultLang);
        const preferred = PREFERRED_TAFSIRS[defaultLang];
        const defaultEdition = (preferred && langEditions.find((e) => e.id === preferred)) || langEditions[0];
        if (defaultEdition) setTafsirEditionId(defaultEdition.id);
      })
      .catch(() => {});
  }, []);

  // Group tafsir editions by language
  const tafsirLangs = useMemo(() => {
    const langMap: Record<string, TafsirEdition[]> = {};
    for (const e of tafsirEditions) {
      if (!langMap[e.language]) langMap[e.language] = [];
      langMap[e.language].push(e);
    }
    return langMap;
  }, [tafsirEditions]);

  // When tafsir language changes, prefer Ibn Kathir or first edition
  useEffect(() => {
    if (!tafsirLang || !tafsirLangs[tafsirLang]) return;
    const editions = tafsirLangs[tafsirLang];
    if (editions.length > 0 && !editions.some((e) => e.id === tafsirEditionId)) {
      const preferred = PREFERRED_TAFSIRS[tafsirLang];
      const pick = (preferred && editions.find((e) => e.id === preferred)) || editions[0];
      setTafsirEditionId(pick.id);
    }
  }, [tafsirLang, tafsirLangs]);

  // Tafsir: read synchronously from cache
  const currentTafsir = tafsirEditionId
    ? tafsirCache.get(`${surahNumber}:${clientAyah}:${tafsirEditionId}`) ?? null
    : null;

  // Helper: fetch a single tafsir into cache (deduped)
  const fetchTafsir = useCallback((surah: number, ayah: number, editionId: string, onDone?: () => void) => {
    const key = `${surah}:${ayah}:${editionId}`;
    if (tafsirCache.has(key) || tafsirFetching.has(key)) return;
    tafsirFetching.add(key);
    fetch(`/api/quran/tafsir/${surah}/${ayah}?editionId=${editionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.tafsirs?.[0]?.text) tafsirCache.set(key, d.tafsirs[0].text);
        onDone?.();
      })
      .catch(() => {})
      .finally(() => tafsirFetching.delete(key));
  }, []);

  // Fetch current ayah tafsir + bump tick when it arrives
  useEffect(() => {
    if (!tafsirEditionId) return;
    const key = `${surahNumber}:${clientAyah}:${tafsirEditionId}`;
    if (tafsirCache.has(key)) return; // already cached
    let cancelled = false;
    fetchTafsir(surahNumber, clientAyah, tafsirEditionId, () => {
      if (!cancelled) setTafsirTick((t) => t + 1);
    });
    return () => { cancelled = true; };
  }, [surahNumber, clientAyah, tafsirEditionId, fetchTafsir]);

  // Aggressively pre-warm tafsir: +20 ayahs ahead in audio mode
  useEffect(() => {
    if (!isAudioMode || !tafsirEditionId) return;
    for (let i = 1; i <= 20; i++) {
      const a = clientAyah + i;
      if (a <= totalAyahs) fetchTafsir(surahNumber, a, tafsirEditionId);
    }
  }, [isAudioMode, surahNumber, clientAyah, tafsirEditionId, totalAyahs, fetchTafsir]);

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
      if (isAudioMode) {
        if (dx < 0 && canGoNext) handleAudioNavigate(clientAyah + 1);
        else if (dx > 0 && canGoPrev) handleAudioNavigate(clientAyah - 1);
      } else {
        if (dx < 0 && canGoNext) router.replace(`/quran/${surahNumber}/${clientAyah + 1}`);
        else if (dx > 0 && canGoPrev) router.replace(`/quran/${surahNumber}/${clientAyah - 1}`);
      }
    }
  }, [clientAyah, surahNumber, canGoPrev, canGoNext, router, isAudioMode, handleAudioNavigate]);

  // Filter mushaf lines: only those containing any of our 3 ayahs
  const filteredLines: { pageNumber: number; line: typeof clientMushafPages[0]["lines"][0] }[] = [];
  for (const page of clientMushafPages) {
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

  // Use module-level cache for instant font readiness (no state flash on page boundary)
  const allFontsReady = clientMushafPages.every((p) => {
    const fontName = `QCF2_P${String(p.pageNumber).padStart(3, "0")}`;
    return loadedFonts.has(fontName);
  }) || fontsLoaded.size > 0 && clientMushafPages.every((p) => fontsLoaded.has(p.pageNumber));

  // Scroll to top + subtle fade on ayah change (like book reader)
  const prevAyahRef = useRef(clientAyah);
  useEffect(() => {
    containerRef.current?.scrollTo(0, 0);
    if (prevAyahRef.current !== clientAyah) {
      prevAyahRef.current = clientAyah;
      const el = contentRef.current;
      if (el) {
        el.style.transition = 'none';
        el.style.opacity = '0.5';
        requestAnimationFrame(() => {
          el.style.transition = 'opacity 0.1s ease-out';
          el.style.opacity = '1';
        });
      }
    }
  }, [clientAyah]);

  // Pre-load fonts for upcoming mushaf pages in audio mode
  useEffect(() => {
    if (!isAudioMode) return;
    for (const page of mushafCacheRef.current.values()) {
      const fontName = `QCF2_P${String(page.pageNumber).padStart(3, "0")}`;
      if (loadedFonts.has(fontName)) continue;
      const font = new FontFace(fontName, `url(/fonts/mushaf/v2/p${page.pageNumber}.woff2)`);
      font.load().then((f) => { document.fonts.add(f); loadedFonts.add(fontName); }).catch(() => {});
    }
  }, [isAudioMode, clientMushafPages]);

  return (
    <div className="ayah-view flex flex-col h-full min-h-0">
      {/* Header bar */}
      <div className="ayah-header flex items-center px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] border-b bg-card shrink-0 gap-2">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          aria-label={t("common.close")}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="flex-1 text-sm font-medium truncate">
          {locale === "ar" ? surahNameArabic : `${t("mushaf.surah")} ${surahNameEnglish}`}
        </span>
        <button
          onClick={toggleAudioMode}
          className={`p-1.5 rounded-lg transition-colors ${
            isAudioMode
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted text-muted-foreground"
          }`}
          aria-label={isAudioMode ? t("mushaf.stopListening") : t("mushaf.listenToAyah")}
        >
          <Headphones className="h-5 w-5" />
        </button>
        <button
          onClick={() => router.push(`/mushaf/pdf?page=${clientMushafPages[0]?.pageNumber ?? 1}`)}
          className="px-3 py-1.5 rounded-lg text-xs bg-foreground/[0.06] hover:bg-foreground/[0.1] transition-colors text-muted-foreground font-medium"
        >
          {t("mushaf.viewFullSurah")}
        </button>
      </div>

      {/* Mushaf content */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto flex justify-center mushaf-bg"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={contentRef}
          className="mushaf-page-frame"
          dir="rtl"
          style={{
            opacity: allFontsReady ? 1 : 0.3,
            transition: "opacity 0.15s ease-in",
          }}
        >
          {/* Ayah range and page info */}
          <div className="mushaf-ayah-title" dir="ltr">
            {ayahNumbers.length > 1
              ? `${surahNumber}:${ayahNumbers[0]}–${ayahNumbers[ayahNumbers.length - 1]}`
              : `${surahNumber}:${clientAyah}`}
            {" · "}
            {t("mushaf.page")} {clientMushafPages.map((p) => p.pageNumber).join("–")}
          </div>

          {filteredLines.map(({ pageNumber, line }) => {
            const fontFamily = `QCF2_P${String(pageNumber).padStart(3, "0")}`;

            // Surah header line
            if (line.lineType === "surah_name") {
              const surahWord = line.words.find((w) => w.charType === "surah_name");
              const surahNum = surahWord?.surahNumber ?? 0;
              const page = clientMushafPages.find((p) => p.pageNumber === pageNumber);
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
                  const isTarget = w.surahNumber === surahNumber && w.ayahNumber === clientAyah;
                  const isHighlighted = isAudioMode && isTarget && w.charType === "word" && w.wordPosition === highlightedPosition;
                  return (
                    <span
                      key={w.position}
                      className={`mushaf-word${isHighlighted ? " mushaf-word-highlight" : ""}`}
                      style={{ opacity: !isOurAyah ? 0.15 : isTarget ? 1 : 0.4 }}
                    >
                      {w.glyph || w.text}
                    </span>
                  );
                })}
              </div>
            );
          })}

          {/* Translations for all displayed ayahs */}
          {Object.keys(translations).length > 0 && (
            <div dir="ltr" className="mushaf-ayah-translation">
              <p className="mushaf-ayah-translation-label">[{translatorName}]</p>
              {ayahNumbers.map((num) =>
                translations[num] ? (
                  <p key={num} className={`mushaf-ayah-translation-text ${num === clientAyah ? "" : "mushaf-ayah-translation-context"}`}>
                    <span className="mushaf-ayah-translation-num">{surahNumber}:{num}</span>{" "}
                    {translations[num]}
                  </p>
                ) : null
              )}
            </div>
          )}

          {/* Tafsir section */}
          {tafsirEditions.length > 0 && (
            <div dir="ltr" className="mushaf-tafsir-section">
              <p className="mushaf-tafsir-title">{t("mushaf.tafsir")}</p>
              <div className="mushaf-tafsir-selectors">
                <select
                  value={tafsirLang}
                  onChange={(e) => setTafsirLang(e.target.value)}
                  className="mushaf-tafsir-select"
                >
                  {Object.keys(tafsirLangs).sort().map((lang) => {
                    const name = getLanguageName(lang);
                    if (!name) return null;
                    return (
                      <option key={lang} value={lang}>
                        {name} ({tafsirLangs[lang].length})
                      </option>
                    );
                  })}
                </select>

                <select
                  value={tafsirEditionId}
                  onChange={(e) => setTafsirEditionId(e.target.value)}
                  className="mushaf-tafsir-select mushaf-tafsir-select-edition"
                >
                  {(tafsirLangs[tafsirLang] || []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>

              {currentTafsir && (
                <div className="mushaf-tafsir-content">
                  <div
                    className="mushaf-tafsir-text"
                    dir={tafsirEditions.find((e) => e.id === tafsirEditionId)?.direction || "ltr"}
                    dangerouslySetInnerHTML={{ __html: currentTafsir }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav — card-style buttons */}
      <div
        className="shrink-0 border-t border-border/50 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        style={{ backgroundColor: 'hsl(var(--reader-bg, 40 30% 96%))' }}
        dir="ltr"
      >
        <div className="flex items-center justify-between">
          {isAudioMode ? (
            <>
              <button
                onClick={skipBack}
                disabled={clientAyah <= 1}
                className="h-11 px-5 rounded-xl bg-foreground/[0.06] hover:bg-foreground/[0.1] active:bg-foreground/[0.15] flex items-center justify-center text-sm font-medium transition-colors disabled:opacity-30"
                aria-label={t("mushaf.skipBack")}
              >
                <SkipBack className="h-5 w-5" />
              </button>

              <button
                onClick={isPlaying ? pause : play}
                className="h-11 w-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 flex items-center justify-center transition-colors"
                aria-label={isPlaying ? t("audio.pause") : t("audio.play")}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
              </button>

              <button
                onClick={skipForward}
                disabled={clientAyah >= totalAyahs}
                className="h-11 px-5 rounded-xl bg-foreground/[0.06] hover:bg-foreground/[0.1] active:bg-foreground/[0.15] flex items-center justify-center text-sm font-medium transition-colors disabled:opacity-30"
                aria-label={t("mushaf.skipForward")}
              >
                <SkipForward className="h-5 w-5" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => canGoPrev && router.replace(`/quran/${surahNumber}/${clientAyah - 1}`)}
                disabled={!canGoPrev}
                className="h-11 px-5 rounded-xl bg-foreground/[0.06] hover:bg-foreground/[0.1] active:bg-foreground/[0.15] flex items-center justify-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-30"
                aria-label={t("mushaf.prevAyah")}
              >
                <ChevronLeft className="h-5 w-5" />
                {t("mushaf.prevAyah")}
              </button>

              <span className="text-sm text-muted-foreground tabular-nums">
                {t("mushaf.ayah")} {clientAyah} / {totalAyahs}
              </span>

              <button
                onClick={() => canGoNext && router.replace(`/quran/${surahNumber}/${clientAyah + 1}`)}
                disabled={!canGoNext}
                className="h-11 px-5 rounded-xl bg-foreground/[0.06] hover:bg-foreground/[0.1] active:bg-foreground/[0.15] flex items-center justify-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-30"
                aria-label={t("mushaf.nextAyah")}
              >
                {t("mushaf.nextAyah")}
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hidden audio element */}
      {isAudioMode && <audio ref={audioRef} preload="auto" />}

      <style jsx global>{`
        .mushaf-bg {
          background-color: hsl(var(--reader-bg, 40 30% 96%));
          color: hsl(var(--reader-fg, 0 0% 10%));
          padding: 1rem 0;
        }
        @media (min-width: 640px) {
          .mushaf-bg { padding: 1.5rem 0; }
        }

        .mushaf-ayah-title {
          text-align: center;
          font-size: 0.75rem;
          opacity: 0.5;
          margin-bottom: 0.75rem;
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
          font-size: clamp(1.05rem, 4.3vw, 1.55rem);
          min-height: 2.8rem;
        }
        @media (min-width: 640px) {
          .mushaf-line {
            font-size: 1.7rem;
            line-height: 3.5;
          }
        }

        /* Ayah viewer: larger font, tighter lines */
        .ayah-view .mushaf-line {
          font-size: clamp(1.3rem, 5.5vw, 1.8rem);
          line-height: 1.8;
          min-height: 1.6rem;
        }
        @media (min-width: 640px) {
          .ayah-view .mushaf-line {
            line-height: 2.0;
          }
        }

        .mushaf-line-justify { justify-content: space-between; }
        .mushaf-line-center { justify-content: center; gap: 0.2em; }
        .mushaf-word { cursor: default; transition: color 0.15s ease; }
        .mushaf-word-highlight { color: hsl(160 84% 39%); }
        :is(.dark) .mushaf-word-highlight { color: hsl(158 64% 52%); }

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
          font-size: clamp(2rem, 7vw, 2.8rem);
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
          margin-top: 1.5rem;
          padding-top: 0.75rem;
          border-top: 1px solid hsl(var(--border));
        }
        .mushaf-ayah-translation-label {
          font-size: 0.7rem;
          opacity: 0.4;
          margin-bottom: 0.5rem;
          text-align: center;
        }
        .mushaf-ayah-translation-text {
          font-size: 0.875rem;
          line-height: 1.6;
          margin-bottom: 0.5rem;
        }
        .mushaf-ayah-translation-context {
          opacity: 0.4;
        }
        .mushaf-ayah-translation-num {
          font-size: 0.75rem;
          font-weight: 600;
          opacity: 0.5;
          margin-right: 0.25rem;
        }

        /* Tafsir section */
        .mushaf-tafsir-section {
          margin-top: 1rem;
          border-top: 1px solid hsl(var(--border));
          padding-top: 0.5rem;
        }
        .mushaf-tafsir-title {
          font-size: 0.9rem;
          font-weight: 600;
          opacity: 0.5;
          text-align: center;
          margin-bottom: 0.375rem;
        }
        .mushaf-tafsir-selectors {
          display: flex;
          gap: 0.5rem;
          margin: 0.25rem 0 0.5rem;
        }
        .mushaf-tafsir-select {
          flex-shrink: 0;
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          border-radius: 6px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          color: inherit;
          cursor: pointer;
          max-width: 11rem;
        }
        .mushaf-tafsir-select-edition {
          flex: 1;
          min-width: 0;
          max-width: none;
        }
        .mushaf-tafsir-content {
          margin-top: 0.5rem;
        }
        .mushaf-tafsir-text {
          font-size: 0.8rem;
          line-height: 1.7;
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
