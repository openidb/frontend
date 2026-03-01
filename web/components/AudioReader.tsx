"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  EllipsisVertical,
  X,
  Minus,
  Plus,
  BookOpen,
} from "lucide-react";
import { PrefetchLink } from "./PrefetchLink";
import { useTranslation } from "@/lib/i18n";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ───────────────────────────────────────────────────────────

interface AudioBookMetadata {
  id: string;
  title: string;
  titleLatin: string;
  titleTranslated?: string | null;
  author: string;
  authorId: string;
}

interface PageData {
  pageNumber: number;
  contentPlain: string;
  contentHtml: string;
}

interface TranslationParagraph {
  index: number;
  translation: string;
}

interface ReadableParagraph {
  pageNumber: number;
  paragraphIndex: number;
  arabicText: string;
  translationText?: string;
}

type ReadingMode = "arabic" | "translation" | "both";

interface AudioReaderProps {
  bookMetadata: AudioBookMetadata;
  initialPageNumber?: string;
  totalPages: number;
  translatedLanguages?: string[];
}

// ─── Honorific expansion ─────────────────────────────────────────────

const HONORIFIC_MAP: Record<string, string> = {
  "\uFDFA": "صلى الله عليه وسلم",
  "\uFDFB": "جل جلاله",
  "\uFDF0": "صلعم",
  "\uFDF1": "قلے",
  "\uFDF2": "الله",
  "\uFDF3": "أكبر",
  "\uFDF4": "محمد",
  "\uFDF5": "صلعم",
  "\uFDF6": "رسول",
  "\uFDF7": "عليه",
  "\uFDF8": "وسلم",
  "\uFDF9": "صلى",
  "\uFD40": "رحمه الله",
  "\uFD41": "رحمها الله",
  "\uFD42": "رحمهما الله",
  "\uFD43": "رحمهم الله",
  "\uFD44": "حفظه الله",
  "\uFD45": "حفظها الله",
  "\uFD46": "حفظهما الله",
  "\uFD47": "رضي الله عنه",
  "\uFD48": "رضي الله عنها",
  "\uFD49": "رضي الله عنهما",
  "\uFD4A": "رضي الله عنهم",
  "\uFD4B": "غفر الله له",
  "\uFD4C": "غفر الله لها",
  "\uFD4D": "عليه السلام",
  "\uFD4E": "عليها السلام",
};
const HONORIFIC_RE = new RegExp(`[${Object.keys(HONORIFIC_MAP).join("")}]`, "g");

function expandHonorifics(text: string): string {
  return text.replace(HONORIFIC_RE, (ch) => HONORIFIC_MAP[ch] ?? ch);
}

// ─── Preferences persistence ─────────────────────────────────────────

interface AudioPrefs {
  readingMode: ReadingMode;
  translationLang: string;
  playbackSpeed: number;
}

const DEFAULT_PREFS: AudioPrefs = {
  readingMode: "arabic",
  translationLang: "en",
  playbackSpeed: 1.0,
};

function loadPrefs(): AudioPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem("audioReaderPrefs");
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_PREFS;
}

function savePrefs(prefs: AudioPrefs) {
  try {
    localStorage.setItem("audioReaderPrefs", JSON.stringify(prefs));
  } catch { /* ignore */ }
}

// ─── Component ───────────────────────────────────────────────────────

const PAGE_WINDOW = 5;

export function AudioReader({
  bookMetadata,
  initialPageNumber,
  totalPages,
  translatedLanguages,
}: AudioReaderProps) {
  const router = useRouter();
  const { t, dir, locale } = useTranslation();

  // ─── Preferences state ─────────────────────────────────────────────
  const [prefs, setPrefs] = useState<AudioPrefs>(DEFAULT_PREFS);
  useEffect(() => { setPrefs(loadPrefs()); }, []);
  const updatePrefs = useCallback((partial: Partial<AudioPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...partial };
      savePrefs(next);
      return next;
    });
  }, []);

  const { readingMode, translationLang, playbackSpeed } = prefs;

  // ─── Page loading state ────────────────────────────────────────────
  const startPage = initialPageNumber ? parseInt(initialPageNumber, 10) : 0;
  const [centerPage, setCenterPage] = useState(Math.max(0, Math.min(startPage, totalPages - 1)));
  const [loadedPages, setLoadedPages] = useState<Map<number, PageData>>(new Map());
  const [loadedTranslations, setLoadedTranslations] = useState<Map<number, TranslationParagraph[]>>(new Map());
  const fetchingPages = useRef<Set<number>>(new Set());
  const fetchingTranslations = useRef<Set<number>>(new Set());

  // ─── Playback state ────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentParagraphIdx, setCurrentParagraphIdx] = useState(0);
  const [highlightedWordRange, setHighlightedWordRange] = useState<{
    paragraphIdx: number;
    start: number;
    end: number;
  } | null>(null);
  const [noArabicVoice, setNoArabicVoice] = useState(false);

  // ─── UI state ──────────────────────────────────────────────────────
  const [showOptions, setShowOptions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const paragraphRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // ─── Translation language ──────────────────────────────────────────
  const effectiveLang = useMemo(() => {
    if (translatedLanguages?.includes(translationLang)) return translationLang;
    const fallback = locale === "ar" ? "en" : locale;
    if (translatedLanguages?.includes(fallback)) return fallback;
    if (translatedLanguages?.includes("en")) return "en";
    return translatedLanguages?.[0] || "en";
  }, [translationLang, translatedLanguages, locale]);

  const hasTranslation = translatedLanguages && translatedLanguages.length > 0;
  const needsTranslation = readingMode !== "arabic" && hasTranslation;

  // ─── Fetch pages in window ─────────────────────────────────────────
  useEffect(() => {
    const low = Math.max(0, centerPage - PAGE_WINDOW);
    const high = Math.min(totalPages - 1, centerPage + PAGE_WINDOW);

    for (let p = low; p <= high; p++) {
      if (loadedPages.has(p) || fetchingPages.current.has(p)) continue;
      fetchingPages.current.add(p);
      fetch(`/api/books/${bookMetadata.id}/pages/${p}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.page) {
            setLoadedPages((prev) => {
              const next = new Map(prev);
              next.set(p, data.page);
              // Evict outside window
              for (const key of next.keys()) {
                if (key < low - 2 || key > high + 2) next.delete(key);
              }
              return next;
            });
          }
        })
        .catch(() => { /* silent */ })
        .finally(() => fetchingPages.current.delete(p));
    }
  }, [centerPage, totalPages, bookMetadata.id, loadedPages]);

  // ─── Fetch translations in window ──────────────────────────────────
  useEffect(() => {
    if (!needsTranslation) return;
    const low = Math.max(0, centerPage - PAGE_WINDOW);
    const high = Math.min(totalPages - 1, centerPage + PAGE_WINDOW);

    for (let p = low; p <= high; p++) {
      if (loadedTranslations.has(p) || fetchingTranslations.current.has(p)) continue;
      fetchingTranslations.current.add(p);
      fetch(`/api/books/${bookMetadata.id}/pages/${p}/translation?lang=${encodeURIComponent(effectiveLang)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.paragraphs) {
            setLoadedTranslations((prev) => {
              const next = new Map(prev);
              next.set(p, data.paragraphs);
              for (const key of next.keys()) {
                if (key < low - 2 || key > high + 2) next.delete(key);
              }
              return next;
            });
          }
        })
        .catch(() => { /* silent */ })
        .finally(() => fetchingTranslations.current.delete(p));
    }
  }, [centerPage, totalPages, bookMetadata.id, needsTranslation, effectiveLang, loadedTranslations]);

  // ─── Build flat paragraph list ─────────────────────────────────────
  const allParagraphs = useMemo(() => {
    const result: ReadableParagraph[] = [];
    const sortedPages = [...loadedPages.entries()].sort(([a], [b]) => a - b);

    for (const [pageNum, page] of sortedPages) {
      const lines = expandHonorifics(page.contentPlain)
        .split("\n")
        .filter((l) => l.trim().length > 0);
      const translations = loadedTranslations.get(pageNum);
      const transMap = translations
        ? new Map(translations.map((t) => [t.index, t.translation]))
        : null;

      for (let i = 0; i < lines.length; i++) {
        result.push({
          pageNumber: pageNum,
          paragraphIndex: i,
          arabicText: lines[i].trim(),
          translationText: transMap?.get(i),
        });
      }
    }
    return result;
  }, [loadedPages, loadedTranslations]);

  // ─── Check Arabic voice availability ───────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const check = () => {
      const voices = speechSynthesis.getVoices();
      const hasArabic = voices.some((v) => v.lang.startsWith("ar"));
      setNoArabicVoice(!hasArabic);
    };
    check();
    speechSynthesis.addEventListener("voiceschanged", check);
    return () => speechSynthesis.removeEventListener("voiceschanged", check);
  }, []);

  // ─── Speech synthesis ──────────────────────────────────────────────
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isPlayingRef = useRef(false);

  const stopSpeaking = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    setHighlightedWordRange(null);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      speechSynthesis.cancel();
    }
    utteranceRef.current = null;
  }, []);

  const speakText = useCallback(
    (text: string, lang: string, onEnd: () => void) => {
      if (!window.speechSynthesis) return;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = playbackSpeed;

      // Try to pick a matching voice
      const voices = speechSynthesis.getVoices();
      const match = voices.find((v) => v.lang.startsWith(lang.split("-")[0]));
      if (match) utterance.voice = match;

      utteranceRef.current = utterance;

      utterance.onend = () => {
        if (isPlayingRef.current) onEnd();
      };
      utterance.onerror = (e) => {
        if (e.error !== "canceled" && isPlayingRef.current) onEnd();
      };

      speechSynthesis.speak(utterance);
    },
    [playbackSpeed],
  );

  const speakParagraph = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= allParagraphs.length) {
        stopSpeaking();
        return;
      }

      const para = allParagraphs[idx];
      setCurrentParagraphIdx(idx);
      setHighlightedWordRange(null);

      // Shift center page if needed
      if (Math.abs(para.pageNumber - centerPage) >= PAGE_WINDOW - 2) {
        setCenterPage(para.pageNumber);
      }

      // Update URL
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("pn", String(para.pageNumber));
        window.history.replaceState(null, "", url.toString());
      }

      const speakArabic = readingMode === "arabic" || readingMode === "both";
      const speakTranslation =
        (readingMode === "translation" || readingMode === "both") &&
        para.translationText;

      if (speakArabic && para.arabicText) {
        speakText(para.arabicText, "ar", () => {
          if (speakTranslation) {
            speakText(para.translationText!, effectiveLang, () => {
              speakParagraph(idx + 1);
            });
          } else {
            speakParagraph(idx + 1);
          }
        });
      } else if (speakTranslation) {
        speakText(para.translationText!, effectiveLang, () => {
          speakParagraph(idx + 1);
        });
      } else {
        // Nothing to speak, advance
        speakParagraph(idx + 1);
      }
    },
    [allParagraphs, readingMode, centerPage, effectiveLang, speakText, stopSpeaking],
  );

  // Word boundary tracking
  useEffect(() => {
    const utterance = utteranceRef.current;
    if (!utterance) return;

    const handler = (e: SpeechSynthesisEvent) => {
      if (e.name === "word") {
        setHighlightedWordRange({
          paragraphIdx: currentParagraphIdx,
          start: e.charIndex,
          end: e.charIndex + (e.charLength || 0),
        });
      }
    };

    utterance.addEventListener("boundary", handler);
    return () => utterance.removeEventListener("boundary", handler);
  }, [utteranceRef.current, currentParagraphIdx]);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      stopSpeaking();
    } else {
      isPlayingRef.current = true;
      setIsPlaying(true);
      speakParagraph(currentParagraphIdx);
    }
  }, [isPlaying, stopSpeaking, speakParagraph, currentParagraphIdx]);

  const skipNext = useCallback(() => {
    speechSynthesis?.cancel();
    const next = Math.min(currentParagraphIdx + 1, allParagraphs.length - 1);
    setCurrentParagraphIdx(next);
    if (isPlaying) {
      speakParagraph(next);
    }
  }, [currentParagraphIdx, allParagraphs.length, isPlaying, speakParagraph]);

  const skipPrev = useCallback(() => {
    speechSynthesis?.cancel();
    const prev = Math.max(currentParagraphIdx - 1, 0);
    setCurrentParagraphIdx(prev);
    if (isPlaying) {
      speakParagraph(prev);
    }
  }, [currentParagraphIdx, isPlaying, speakParagraph]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        speechSynthesis.cancel();
      }
    };
  }, []);

  // Stop playback when speed changes
  useEffect(() => {
    if (isPlaying) {
      speechSynthesis?.cancel();
      speakParagraph(currentParagraphIdx);
    }
  }, [playbackSpeed]);

  // ─── Auto-scroll to active paragraph ───────────────────────────────
  useEffect(() => {
    const el = paragraphRefs.current.get(currentParagraphIdx);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentParagraphIdx]);

  // ─── Click to jump ─────────────────────────────────────────────────
  const jumpToParagraph = useCallback(
    (idx: number) => {
      speechSynthesis?.cancel();
      setCurrentParagraphIdx(idx);
      if (isPlaying) {
        speakParagraph(idx);
      }
    },
    [isPlaying, speakParagraph],
  );

  // ─── Word highlighting renderer ────────────────────────────────────
  const renderHighlightedText = useCallback(
    (text: string, paraIdx: number, isArabic: boolean) => {
      const isActive = highlightedWordRange?.paragraphIdx === paraIdx;
      if (!isActive) {
        return <span>{text}</span>;
      }

      const words = text.split(/(\s+)/);
      let charPos = 0;
      return (
        <>
          {words.map((segment, i) => {
            const segStart = charPos;
            const segEnd = charPos + segment.length;
            charPos = segEnd;

            const isHighlighted =
              highlightedWordRange &&
              segStart < highlightedWordRange.end &&
              segEnd > highlightedWordRange.start &&
              segment.trim().length > 0;

            return (
              <span
                key={i}
                className={isHighlighted ? "text-primary transition-colors" : ""}
              >
                {segment}
              </span>
            );
          })}
        </>
      );
    },
    [highlightedWordRange],
  );

  // ─── Progress display ──────────────────────────────────────────────
  const currentPageNum = allParagraphs[currentParagraphIdx]?.pageNumber ?? centerPage;
  const progress = totalPages > 0 ? ((currentPageNum + 1) / totalPages) * 100 : 0;

  const displayTitle = expandHonorifics(bookMetadata.title);

  return (
    <div className="flex flex-col h-[100dvh] bg-[hsl(var(--background))]" dir={dir}>
      {/* ─── Top bar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="h-9 w-9 shrink-0"
          aria-label={t("common.close")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="flex-1 min-w-0 text-center">
          <p
            className="text-sm font-medium truncate"
            dir="rtl"
            title={displayTitle}
          >
            {displayTitle}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("audio.page")} {currentPageNum + 1} {t("reader.of")} {totalPages}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowOptions(!showOptions)}
          className="h-9 w-9 shrink-0"
          aria-label={t("audio.options")}
        >
          <EllipsisVertical className="h-5 w-5" />
        </Button>
      </div>

      {/* Reading progress bar */}
      <div className="h-0.5 bg-muted shrink-0">
        <div
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* ─── Options panel ────────────────────────────────────────── */}
      {showOptions && (
        <div
          className="hidden sm:block fixed inset-0 z-20"
          onClick={() => setShowOptions(false)}
        />
      )}
      <AnimatePresence>
        {showOptions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            dir={dir}
            className={`fixed inset-0 sm:absolute sm:inset-auto sm:top-14 ${dir === "rtl" ? "sm:left-4" : "sm:right-4"} sm:w-80 sm:rounded-lg sm:border sm:shadow-xl bg-[hsl(var(--background))] z-30 flex flex-col`}
          >
            {/* Mobile close header */}
            <div className="sm:hidden flex items-center border-b px-2 py-2">
              <div className="flex-1 ps-2">
                <h2 className="font-semibold text-base">{t("audio.options")}</h2>
              </div>
              <button
                onClick={() => setShowOptions(false)}
                className="h-10 w-10 rounded-full hover:bg-muted flex items-center justify-center transition-colors shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 space-y-4 overflow-auto">
              {/* Reading mode */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("audio.readingMode")}</label>
                <div className="flex rounded-lg border overflow-hidden" dir="ltr">
                  {(["arabic", "translation", "both"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => updatePrefs({ readingMode: mode })}
                      className={`flex-1 px-3 py-2 text-sm transition-colors ${
                        readingMode === mode
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      {t(`audio.mode${mode.charAt(0).toUpperCase() + mode.slice(1)}` as "audio.modeArabic" | "audio.modeTranslation" | "audio.modeBoth")}
                    </button>
                  ))}
                </div>
              </div>

              {/* No Arabic voice warning */}
              {noArabicVoice && readingMode !== "translation" && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t("audio.noArabicVoice")}
                </p>
              )}

              {/* Translation language */}
              {readingMode !== "arabic" && hasTranslation && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("audio.translationLanguage")}</label>
                  <select
                    value={effectiveLang}
                    onChange={(e) => {
                      updatePrefs({ translationLang: e.target.value });
                      // Clear translation cache
                      setLoadedTranslations(new Map());
                    }}
                    className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  >
                    {translatedLanguages?.map((lang) => (
                      <option key={lang} value={lang}>
                        {t(`language.${lang}` as `language.${string}`) || lang}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Playback speed */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("audio.playbackSpeed")}</label>
                <div className="flex items-center gap-3" dir="ltr">
                  <button
                    onClick={() =>
                      updatePrefs({
                        playbackSpeed: Math.max(0.5, +(playbackSpeed - 0.25).toFixed(2)),
                      })
                    }
                    className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-muted transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-12 text-center text-sm font-medium">
                    {playbackSpeed.toFixed(2)}x
                  </span>
                  <button
                    onClick={() =>
                      updatePrefs({
                        playbackSpeed: Math.min(2.0, +(playbackSpeed + 0.25).toFixed(2)),
                      })
                    }
                    className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-muted transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Back to reader link */}
              <div className="border-t pt-3">
                <PrefetchLink
                  href={`/reader/${bookMetadata.id}?pn=${currentPageNum}`}
                  className="w-full px-4 py-3 rounded-md hover:bg-muted text-sm transition-colors flex items-center gap-2"
                  onClick={() => setShowOptions(false)}
                >
                  <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{t("audio.backToReader")}</span>
                </PrefetchLink>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Scroll content area ──────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{
          maskImage:
            "linear-gradient(transparent 0%, black 4%, black 96%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(transparent 0%, black 4%, black 96%, transparent 100%)",
        }}
      >
        <div className="max-w-xl mx-auto px-4 py-6 space-y-2 text-center">
          {allParagraphs.length === 0 && (
            <div className="text-center text-muted-foreground py-12">
              {t("common.loading")}
            </div>
          )}

          {allParagraphs.map((para, idx) => {
            const prevPara = idx > 0 ? allParagraphs[idx - 1] : null;
            const showPageBreak = prevPara && prevPara.pageNumber !== para.pageNumber;
            const isActive = idx === currentParagraphIdx;

            return (
              <div key={`${para.pageNumber}-${para.paragraphIndex}`}>
                {/* Page break */}
                {showPageBreak && (
                  <div className="flex items-center gap-3 my-4 opacity-40">
                    <div className="flex-1 border-t" />
                    <span className="text-xs whitespace-nowrap">
                      {t("audio.page")} {para.pageNumber + 1}
                    </span>
                    <div className="flex-1 border-t" />
                  </div>
                )}

                {/* Paragraph */}
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                <div
                  ref={(el) => {
                    if (el) paragraphRefs.current.set(idx, el);
                    else paragraphRefs.current.delete(idx);
                  }}
                  onClick={() => jumpToParagraph(idx)}
                  className="py-2 cursor-pointer"
                >
                  {/* Arabic text */}
                  {(readingMode === "arabic" || readingMode === "both") && (
                    <p
                      className="text-lg leading-relaxed font-['Amiri',_'Noto_Naskh_Arabic',_serif]"
                      dir="rtl"
                      lang="ar"
                    >
                      {renderHighlightedText(para.arabicText, idx, true)}
                    </p>
                  )}

                  {/* Translation text */}
                  {(readingMode === "translation" || readingMode === "both") &&
                    para.translationText && (
                      <p
                        className={`text-base leading-relaxed text-muted-foreground ${
                          readingMode === "both" ? "mt-1 text-sm" : ""
                        }`}
                        dir="ltr"
                      >
                        {renderHighlightedText(para.translationText, idx, false)}
                      </p>
                    )}

                  {/* Translation loading indicator */}
                  {readingMode !== "arabic" &&
                    !para.translationText &&
                    hasTranslation && (
                      <p className="text-sm text-muted-foreground/50 italic" dir="ltr">
                        {t("reader.translating")}
                      </p>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Bottom controls ──────────────────────────────────────── */}
      <div className="border-t shrink-0 bg-[hsl(var(--background))] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-center gap-4 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={skipPrev}
            disabled={currentParagraphIdx === 0}
            className="h-10 w-10"
            aria-label={t("audio.prevParagraph")}
          >
            <SkipBack className="h-5 w-5" />
          </Button>

          <Button
            variant="default"
            size="icon"
            onClick={togglePlayback}
            className="h-12 w-12 rounded-full"
            aria-label={isPlaying ? t("audio.pause") : t("audio.play")}
          >
            {isPlaying ? (
              <Pause className="h-6 w-6" />
            ) : (
              <Play className="h-6 w-6 ms-0.5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={skipNext}
            disabled={currentParagraphIdx >= allParagraphs.length - 1}
            className="h-10 w-10"
            aria-label={t("audio.nextParagraph")}
          >
            <SkipForward className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
