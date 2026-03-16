"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Headphones, Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useQuranAudio } from "@/lib/use-quran-audio";

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

// Strip Quranic annotation marks that render as odd symbols with text fonts.
// Keeps core diacritics (tashkeel), superscript alef, maddah, alef wasla.
const QURAN_ANNOTATION_RE = /[\u06D6-\u06DC\u06DE\u06DF\u06E0-\u06E4\u06E5\u06E6\u06E7-\u06ED]/g;
function cleanUthmani(text: string): string {
  return text.replace(QURAN_ANNOTATION_RE, "").replace(/\s+/g, " ").trim();
}

// Module-level caches (persist across React re-renders and navigations)
const translationCache = new Map<string, string>(); // "surah:ayah:edition" → text
const tafsirCache = new Map<string, string>(); // "surah:ayah:edition" → html
const tafsirFetching = new Set<string>(); // dedup in-flight tafsir fetches
const ayahTextCache = new Map<string, string>(); // "surah:ayah" → textUthmani

export function QuranAyahViewer({
  ayahs,
  targetAyah,
  surahNumber,
  surahNameEnglish,
  surahNameArabic,
  totalAyahs,
  initialAudioMode = false,
}: Props) {
  const { t, locale } = useTranslation();
  const router = useRouter();

  // --- Client-side state for instant ayah transitions in audio mode ---
  const [clientAyah, setClientAyah] = useState(targetAyah);
  const [ayahTick, setAyahTick] = useState(0);

  // Seed ayah text cache from server props
  for (const a of ayahs) {
    ayahTextCache.set(`${surahNumber}:${a.ayahNumber}`, a.textUthmani);
  }

  // Sync from server props when they change (real navigation / initial load)
  useEffect(() => { setClientAyah(targetAyah); }, [targetAyah]);

  // Client-side navigation: update state + URL without server round-trip
  const handleAudioNavigate = useCallback((ayah: number) => {
    history.replaceState(null, '', `/quran/${surahNumber}/${ayah}?audio=1`);
    setClientAyah(ayah);
  }, [surahNumber]);

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
  } = useQuranAudio(surahNumber, clientAyah, totalAyahs, router, initialAudioMode, handleAudioNavigate, surahNameEnglish, surahNameArabic);

  const [tafsirEditions, setTafsirEditions] = useState<TafsirEdition[]>([]);
  const [tafsirLang, setTafsirLang] = useState<string>("");
  const [tafsirEditionId, setTafsirEditionId] = useState<string>("");
  const [tafsirTick, setTafsirTick] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const canGoPrev = clientAyah > 1;
  const canGoNext = clientAyah < totalAyahs;

  // Compute display range: 1 before, target, 2 after
  const displayAyahNumbers = useMemo(() => {
    const nums: number[] = [];
    for (let i = Math.max(1, clientAyah - 1); i <= Math.min(totalAyahs, clientAyah + 2); i++) {
      nums.push(i);
    }
    return nums;
  }, [clientAyah, totalAyahs]);

  // Read ayah texts from cache (synchronous — zero flicker)
  const displayAyahs = displayAyahNumbers.map(n => ({
    number: n,
    text: ayahTextCache.get(`${surahNumber}:${n}`) || "",
  }));

  // Fetch missing ayah texts
  useEffect(() => {
    const missing = displayAyahNumbers.filter(n => !ayahTextCache.has(`${surahNumber}:${n}`));
    if (missing.length === 0) return;
    const min = Math.min(...missing);
    const max = Math.max(...missing);
    let cancelled = false;
    fetch(`/api/quran/ayahs?surah=${surahNumber}&offset=${min - 1}&limit=${max - min + 1}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.ayahs) for (const a of d.ayahs) ayahTextCache.set(`${surahNumber}:${a.ayahNumber}`, a.textUthmani);
        if (!cancelled) setAyahTick(t => t + 1);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [surahNumber, displayAyahNumbers]);

  // In audio mode, pre-warm upcoming ayah texts
  useEffect(() => {
    if (!isAudioMode) return;
    const toFetch: number[] = [];
    for (let i = 1; i <= 20; i++) {
      const a = clientAyah + i;
      if (a <= totalAyahs && !ayahTextCache.has(`${surahNumber}:${a}`)) toFetch.push(a);
    }
    if (toFetch.length === 0) return;
    const min = Math.min(...toFetch);
    const max = Math.max(...toFetch);
    fetch(`/api/quran/ayahs?surah=${surahNumber}&offset=${min - 1}&limit=${max - min + 1}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.ayahs) for (const a of d.ayahs) ayahTextCache.set(`${surahNumber}:${a.ayahNumber}`, a.textUthmani);
      })
      .catch(() => {});
  }, [isAudioMode, surahNumber, clientAyah, totalAyahs]);

  // Prefetch adjacent ayah routes for non-audio navigation
  useEffect(() => {
    if (isAudioMode) return;
    if (canGoPrev) router.prefetch(`/quran/${surahNumber}/${clientAyah - 1}`);
    if (canGoNext) router.prefetch(`/quran/${surahNumber}/${clientAyah + 1}`);
  }, [surahNumber, clientAyah, canGoPrev, canGoNext, router, isAudioMode]);

  // Translations: read synchronously from module-level cache (zero flicker)
  const ayahNumbers = displayAyahNumbers;
  const translationEdition = PREFERRED_EDITIONS[locale] || PREFERRED_EDITIONS.en;
  const [translationTick, setTranslationTick] = useState(0);

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
        const hasLang = (l: string) => editions.some((e: TafsirEdition) => e.language === l) && getLanguageName(l);
        const defaultLang = hasLang(locale) ? locale
          : hasLang("ar") ? "ar" : editions.find((e: TafsirEdition) => getLanguageName(e.language))?.language || "";
        setTafsirLang(defaultLang);
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
    ? (tafsirCache.get(`${surahNumber}:${clientAyah}:${tafsirEditionId}`)
       ?? tafsirCache.get(`${surahNumber}:${clientAyah - 1}:${tafsirEditionId}`)
       ?? null)
    : null;

  // Helper: fetch a single tafsir into cache (deduped)
  const fetchTafsir = useCallback((surah: number, ayah: number, editionId: string, onDone?: () => void) => {
    const key = `${surah}:${ayah}:${editionId}`;
    if (tafsirCache.has(key) || tafsirFetching.has(key)) return;
    tafsirFetching.add(key);
    fetch(`/api/quran/tafsir/${surah}/${ayah}?editionId=${editionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.tafsirs?.[0]?.text) {
          const text = d.tafsirs[0].text;
          tafsirCache.set(key, text);
          const prevKey = `${surah}:${ayah - 1}:${editionId}`;
          const nextKey = `${surah}:${ayah + 1}:${editionId}`;
          if (tafsirCache.get(prevKey) === text && !tafsirCache.has(nextKey)) {
            tafsirCache.set(nextKey, text);
          }
          if (tafsirCache.get(nextKey) === text && !tafsirCache.has(prevKey)) {
            tafsirCache.set(prevKey, text);
          }
        }
        onDone?.();
      })
      .catch(() => {})
      .finally(() => tafsirFetching.delete(key));
  }, []);

  // Fetch current ayah tafsir + bump tick when it arrives
  useEffect(() => {
    if (!tafsirEditionId) return;
    const key = `${surahNumber}:${clientAyah}:${tafsirEditionId}`;
    if (tafsirCache.has(key)) return;
    let cancelled = false;
    fetchTafsir(surahNumber, clientAyah, tafsirEditionId, () => {
      if (!cancelled) setTafsirTick((t) => t + 1);
    });
    return () => { cancelled = true; };
  }, [surahNumber, clientAyah, tafsirEditionId, fetchTafsir]);

  // Pre-warm tafsir: +20 ayahs ahead in audio mode
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

  // Subtle fade on ayah change
  const prevAyahRef = useRef(clientAyah);
  useEffect(() => {
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

  // Suppress unused tick warnings
  void translationTick;
  void tafsirTick;
  void ayahTick;

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
          onClick={() => router.push(`/mushaf/pdf?page=${ayahs[0]?.pageNumber ?? 1}`)}
          className="px-3 py-1.5 rounded-lg text-xs bg-foreground/[0.06] hover:bg-foreground/[0.1] transition-colors text-muted-foreground font-medium"
        >
          {t("mushaf.viewFullSurah")}
        </button>
      </div>

      {/* Content */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto flex justify-center ayah-bg"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={contentRef}
          className="ayah-content-frame"
        >
          {/* Bismillah — shown before ayah 1 for all surahs except 1 (Al-Fatiha, where it's ayah 1) and 9 (At-Tawbah) */}
          {surahNumber !== 1 && surahNumber !== 9 && displayAyahNumbers[0] === 1 && (
            <div className="arabic-ayah arabic-ayah-context">
              <p className="arabic-bismillah" dir="rtl">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</p>
            </div>
          )}

          {/* Arabic ayahs — ayah by ayah with word-level highlighting */}
          {displayAyahs.map(({ number, text }) => {
            const isCurrentAyah = number === clientAyah;
            const words = cleanUthmani(text).split(/\s+/).filter(Boolean);
            return (
              <div
                key={number}
                className={`arabic-ayah${isCurrentAyah ? " arabic-ayah-current" : " arabic-ayah-context"}`}
              >
                <p className="arabic-ayah-text" dir="rtl">
                  {words.map((word, i) => {
                    const pos = i + 1;
                    const highlighted = isCurrentAyah && isAudioMode && highlightedPosition === pos;
                    return (
                      <span key={i} className={highlighted ? "arabic-word-highlight" : undefined}>
                        {word}{" "}
                      </span>
                    );
                  })}
                  <span className="arabic-ayah-end-marker">
                    {number.toLocaleString("ar-EG")}
                  </span>
                </p>
              </div>
            );
          })}

          {/* Translations */}
          {Object.keys(translations).length > 0 && (
            <div dir="ltr" className="ayah-translation-section">
              <p className="ayah-translation-label">[{translatorName}]</p>
              {ayahNumbers.map((num) =>
                translations[num] ? (
                  <p key={num} className={`ayah-translation-text${num === clientAyah ? "" : " ayah-translation-context"}`}>
                    <span className="ayah-translation-num">{surahNumber}:{num}</span>{" "}
                    {translations[num]}
                  </p>
                ) : null
              )}
            </div>
          )}

          {/* Tafsir section */}
          {tafsirEditions.length > 0 && (
            <div dir="ltr" className="ayah-tafsir-section">
              <p className="ayah-tafsir-title">{t("mushaf.tafsir")}</p>
              <div className="ayah-tafsir-selectors">
                <select
                  value={tafsirLang}
                  onChange={(e) => setTafsirLang(e.target.value)}
                  className="ayah-tafsir-select"
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
                  className="ayah-tafsir-select ayah-tafsir-select-edition"
                >
                  {(tafsirLangs[tafsirLang] || []).map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>

              {currentTafsir && (
                <div className="ayah-tafsir-content">
                  <div
                    className="ayah-tafsir-text"
                    dir={tafsirEditions.find((e) => e.id === tafsirEditionId)?.direction || "ltr"}
                    dangerouslySetInnerHTML={{ __html: currentTafsir }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav */}
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
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} preload="none" playsInline webkit-playsinline="" />

      <style jsx global>{`
        .ayah-bg {
          background-color: hsl(var(--reader-bg, 40 30% 96%));
          color: hsl(var(--reader-fg, 0 0% 10%));
          padding: 1rem 0;
        }
        @media (min-width: 640px) {
          .ayah-bg { padding: 1.5rem 0; }
        }

        .ayah-content-frame {
          width: 100%;
          max-width: 640px;
          margin: 0 auto;
          padding: 0.5rem 1rem;
          display: flex;
          flex-direction: column;
        }
        @media (min-width: 640px) {
          .ayah-content-frame {
            padding: 1.5rem 2rem;
            background: hsl(var(--reader-bg, 40 30% 96%));
          }
        }

        /* Arabic ayahs — ayah by ayah display */
        .arabic-ayah {
          padding: 0.15rem 0;
        }
        .arabic-ayah-context {
          opacity: 0.3;
        }
        .arabic-ayah-current {
          opacity: 1;
        }
        .arabic-ayah-text {
          font-family: "UthmanicHafs", "Noto Naskh Arabic", "Amiri", serif;
          font-size: clamp(1.1rem, 4vw, 1.4rem);
          line-height: 2;
          text-align: right;
          margin: 0;
        }
        .arabic-bismillah {
          font-family: "UthmanicHafs", "Noto Naskh Arabic", "Amiri", serif;
          font-size: clamp(1.1rem, 4vw, 1.4rem);
          line-height: 2;
          text-align: right;
          margin: 0;
          opacity: 0.6;
        }
        .arabic-ayah-end-marker {
          opacity: 0.4;
          white-space: nowrap;
        }
        .arabic-word-highlight {
          color: hsl(160 84% 39%);
          transition: color 0.1s ease;
        }
        :is(.dark) .arabic-word-highlight {
          color: hsl(158 64% 52%);
        }

        /* Translation block */
        .ayah-translation-section {
          margin-top: 1.5rem;
          padding-top: 0.75rem;
          border-top: 1px solid hsl(var(--border));
        }
        .ayah-translation-label {
          font-size: 0.7rem;
          opacity: 0.4;
          margin-bottom: 0.5rem;
          text-align: center;
        }
        .ayah-translation-text {
          font-size: 0.875rem;
          line-height: 1.6;
          margin-bottom: 0.5rem;
        }
        .ayah-translation-context {
          opacity: 0.4;
        }
        .ayah-translation-num {
          font-size: 0.75rem;
          font-weight: 600;
          opacity: 0.5;
          margin-right: 0.25rem;
        }

        /* Tafsir section */
        .ayah-tafsir-section {
          margin-top: 1rem;
          border-top: 1px solid hsl(var(--border));
          padding-top: 0.5rem;
        }
        .ayah-tafsir-title {
          font-size: 0.9rem;
          font-weight: 600;
          opacity: 0.5;
          text-align: center;
          margin-bottom: 0.375rem;
        }
        .ayah-tafsir-selectors {
          display: flex;
          gap: 0.5rem;
          margin: 0.25rem 0 0.5rem;
        }
        .ayah-tafsir-select {
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
        .ayah-tafsir-select-edition {
          flex: 1;
          min-width: 0;
          max-width: none;
        }
        .ayah-tafsir-content {
          margin-top: 0.5rem;
        }
        .ayah-tafsir-text {
          font-size: 0.8rem;
          line-height: 1.7;
        }

        /* Font face */
        @font-face {
          font-family: "UthmanicHafs";
          src: url("/fonts/mushaf/UthmanicHafs_V22.woff2") format("woff2");
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }
      `}</style>
    </div>
  );
}
