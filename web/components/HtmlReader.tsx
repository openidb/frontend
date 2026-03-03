"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, ChevronLeft, EllipsisVertical, FileText, User, Minus, Plus, X, Languages, Headphones } from "lucide-react";
import { PrefetchLink } from "./PrefetchLink";
import { useTranslation } from "@/lib/i18n";
import { useAppConfig } from "@/lib/config";
import { WordDefinitionPopover } from "./WordDefinitionPopover";
import { trackBookEvent } from "@/lib/analytics";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { triggerHaptic } from "@/lib/haptics";

interface BookMetadata {
  id: string;
  title: string;
  titleLatin: string;
  titleTranslated?: string | null;
  author: string;
  authorLatin: string;
  authorId: string;
  datePublished: string;
  filename: string;
}

interface PageData {
  pageNumber: number;
  volumeNumber: number;
  urlPageIndex: string | null;
  printedPageNumber: number | null;
  contentHtml: string;
  contentPlain: string;
  hasPoetry: boolean;
  hasHadith: boolean;
  hasQuran: boolean;
  pdfUrl: string | null;
}

interface TocEntry {
  title: string;
  level: number;
  page: number;
}

interface TranslationParagraph {
  index: number;
  translation: string;
}

interface HtmlReaderProps {
  bookMetadata: BookMetadata;
  initialPageNumber?: string;
  initialPageData?: PageData | null;
  initialTranslationData?: TranslationParagraph[] | null;
  totalPages: number;
  totalVolumes: number;
  maxPrintedPage: number;
  volumeStartPages?: Record<string, number>;
  volumeMaxPrintedPages?: Record<string, number>;
  volumeMinPrintedPages?: Record<string, number>;
  toc?: TocEntry[];
  translatedLanguages?: string[];
}

/**
 * Format Turath HTML content for display.
 * Turath content is mostly plain text with newlines and occasional
 * <span data-type="title"> tags for headings. Footnotes appear after
 * a "___" separator line with markers like (^١).
 */
// Arabic honorific ligatures that many fonts don't render.
// Expand to full Arabic text so they display on all devices.
const HONORIFIC_MAP: Record<string, string> = {
  // Arabic Presentation Forms-A (older, but Naskh/UthmanTN1 may lack glyphs)
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
  // Unicode 16.0 (Sept 2024) Islamic honorific ligatures
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

/** Expand honorific ligatures in any text (titles, content, etc.) */
function expandHonorifics(text: string): string {
  return text.replace(HONORIFIC_RE, (ch) => HONORIFIC_MAP[ch] ?? ch);
}

function formatContentHtml(
  html: string,
  enableWordWrap = true,
  translationParagraphs?: TranslationParagraph[],
  isTocPage = false,
): string {
  // Expand honorific ligatures into readable Arabic text
  html = expandHonorifics(html);

  // Join multi-line title spans into single lines so the line-by-line
  // processor can match the opening and closing tags together.
  html = html.replace(
    /<span\s+data-type=['"]title['"][^>]*>[\s\S]*?<\/span>/g,
    (match) => match.replace(/\n/g, ' ')
  );

  const lines = html.split(/\n/);
  const formatted: string[] = [];
  const rawToFormatted = new Map<number, number>();
  let inFootnotes = false;

  for (let rawIdx = 0; rawIdx < lines.length; rawIdx++) {
    const line = lines[rawIdx];
    const trimmed = line.trim();
    if (!trimmed) continue;
    rawToFormatted.set(rawIdx, formatted.length);

    // Section separator: * * * * *
    if (/^[\s*]+$/.test(trimmed) && trimmed.includes('*')) {
      formatted.push(
        '<p style="text-align:center;margin:1.5em 0;letter-spacing:0.4em;opacity:0.35;font-size:0.9em">* * * * *</p>'
      );
      continue;
    }

    // Detect footnote separator (line of underscores)
    if (/^_{3,}$/.test(trimmed)) {
      inFootnotes = true;
      formatted.push(
        '<div style="margin-top:2em;padding-top:1.5em;text-align:center"><span style="display:inline-block;width:60%;border-top:1px solid currentColor;opacity:0.3"></span></div><div style="opacity:0.55">'
      );
      continue;
    }

    // Strip the caret from footnote markers: (^١) → (١) — keep inline, no superscript
    const withMarkers = trimmed.replace(/\(\^([٠-٩0-9]+)\)/g, '($1)');

    if (inFootnotes) {
      // Footnote lines: bold the leading (N) marker
      const footnoteStyled = withMarkers.replace(
        /^\(([٠-٩0-9]+)\)\s*/,
        '<span style="font-weight:bold">($1)</span> '
      );
      formatted.push(
        `<p style="margin:0.5em 0;font-size:0.9em;padding-right:1.5em;text-indent:-1.5em">${footnoteStyled}</p>`
      );
    } else if (trimmed.includes("data-page")) {
      // Page links (e.g. TOC entries) → clickable items
      formatted.push(`<p style="margin:0.4em 0">${withMarkers}</p>`);
    } else if (trimmed.includes("data-type")) {
      // Title spans → styled headings; text after </span> is body, not heading
      const styled = withMarkers
        .replace(
          /^(.*?)<span\s+data-type=['"]title['"][^>]*(?:id=['"][^'"]*['"])?\s*>/gi,
          '<h3 style="font-size:1.3em;font-weight:bold;margin:1.5em 0 0.8em;padding-bottom:0.4em;border-bottom:2px solid currentColor;opacity:1;color:inherit">$1'
        )
        .replace(/<\/span>(.*)$/i, (_, after) => {
          const rest = after.trim();
          return rest
            ? `</h3>\n<p style="margin:0.4em 0">${rest}</p>`
            : '</h3>';
        });
      formatted.push(styled);
    } else {
      formatted.push(`<p style="margin:0.5em 0 0.6em">${withMarkers}</p>`);
    }
  }

  // Close footnotes div if opened
  if (inFootnotes) {
    formatted.push('</div>');
  }

  // Append or interleave translation paragraphs if provided
  if (translationParagraphs && translationParagraphs.length > 0) {
    const translationMap = new Map(translationParagraphs.map((p) => [p.index, p.translation]));
    if (isTocPage) {
      // Build set of formatted indices that are TOC entries (have data-page)
      const tocFormattedIndices = new Set<number>();
      const formattedDataPages = new Map<number, string>();
      for (let i = 0; i < formatted.length; i++) {
        const match = formatted[i].match(/data-page=['"](\d+)['"]/);
        if (match) {
          tocFormattedIndices.add(i);
          formattedDataPages.set(i, match[1]);
        }
      }

      // Include the heading immediately before the first TOC entry (e.g. "فهرس الكتاب")
      const firstTocIdx = Math.min(...tocFormattedIndices);
      if (firstTocIdx > 0 && !tocFormattedIndices.has(firstTocIdx - 1)) {
        tocFormattedIndices.add(firstTocIdx - 1);
      }

      // Helper: map a translation's raw line index to the formatted index
      const resolveFormatted = (rawIndex: number) => rawToFormatted.get(rawIndex);

      const descEntries: string[] = [];
      const tocEntries: string[] = [];
      for (let i = 0; i < formatted.length; i++) {
        if (tocFormattedIndices.has(i)) {
          tocEntries.push(formatted[i]);
        } else {
          descEntries.push(formatted[i]);
        }
      }

      // Layout: Arabic description → English description → Arabic TOC → English TOC
      const reordered: string[] = [];
      reordered.push(...descEntries);

      const descTranslations = translationParagraphs
        .filter(p => {
          const fi = resolveFormatted(p.index);
          return fi === undefined || !tocFormattedIndices.has(fi);
        })
        .sort((a, b) => a.index - b.index);
      if (descTranslations.length > 0) {
        reordered.push('<div style="margin-top:1.5em;padding-top:1em;border-top:2px solid hsl(var(--brand));opacity:0.85">');
        for (const p of descTranslations) {
          reordered.push(`<p dir="ltr" style="margin:0.3em 0;font-size:0.88em;line-height:1.7;font-family:system-ui,sans-serif">${p.translation}</p>`);
        }
        reordered.push('</div>');
      }

      reordered.push(...tocEntries);

      const tocTranslations = translationParagraphs
        .filter(p => {
          const fi = resolveFormatted(p.index);
          return fi !== undefined && tocFormattedIndices.has(fi);
        })
        .sort((a, b) => a.index - b.index);
      if (tocTranslations.length > 0) {
        reordered.push('<div style="margin-top:1.5em;padding-top:1em;border-top:2px solid hsl(var(--brand));opacity:0.85">');
        for (const p of tocTranslations) {
          const fi = resolveFormatted(p.index);
          const dataPage = fi !== undefined ? formattedDataPages.get(fi) : undefined;
          if (dataPage) {
            reordered.push(`<p style="margin:0.4em 0"><a data-page="${dataPage}" style="cursor:pointer" dir="ltr"><span style="font-size:0.88em;line-height:1.7;font-family:system-ui,sans-serif">${p.translation}</span></a></p>`);
          } else {
            reordered.push(`<p dir="ltr" style="margin:0.3em 0;font-size:0.88em;line-height:1.7;font-family:system-ui,sans-serif">${p.translation}</p>`);
          }
        }
        reordered.push('</div>');
      }

      formatted.length = 0;
      formatted.push(...reordered);
    } else {
      // Normal pages: interleave translations after each paragraph
      // Build reverse map: formatted index → raw line index
      const formattedToRaw = new Map<number, number>();
      for (const [raw, fmt] of rawToFormatted) formattedToRaw.set(fmt, raw);
      const interleaved: string[] = [];
      for (let i = 0; i < formatted.length; i++) {
        interleaved.push(formatted[i]);
        const rawIdx = formattedToRaw.get(i);
        const translation = rawIdx !== undefined ? translationMap.get(rawIdx) : undefined;
        if (translation) {
          interleaved.push(
            `<p dir="ltr" style="margin:0.3em 0 0.8em;padding:0.5em 0.8em;border-inline-start:3px solid hsl(var(--brand));opacity:0.85;font-size:0.88em;line-height:1.7;font-family:system-ui,sans-serif">${translation}</p>`
          );
        }
      }
      formatted.length = 0;
      formatted.push(...interleaved);
    }
  }

  let result = formatted.join('\n');
  if (enableWordWrap) result = wrapWords(result);

  return result;
}

/** Wrap Arabic word tokens in clickable spans (operates on text nodes only). */
function wrapWords(html: string): string {
  return html.replace(
    /(>[^<]*)/g,
    (_, textNode: string) =>
      textNode.replace(
        /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+/g,
        (word: string) => `<span class="word" data-word="${word}">${word}</span>`
      )
  );
}

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

/** Display label for a page: printed number if available, Roman numeral for front matter */
function displayPageNumber(page: PageData | null, internalPage: number): string {
  if (page?.printedPageNumber != null) return page.printedPageNumber.toString();
  return ROMAN[internalPage] ?? internalPage.toString();
}

export function HtmlReader({ bookMetadata, initialPageNumber, initialPageData, initialTranslationData, totalPages, totalVolumes, maxPrintedPage, volumeStartPages = {}, volumeMaxPrintedPages = {}, volumeMinPrintedPages = {}, toc = [], translatedLanguages }: HtmlReaderProps) {
  const router = useRouter();
  const { t, dir, locale } = useTranslation();
  const { config } = useAppConfig();
  const contentRef = useRef<HTMLDivElement>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [fontSize, setFontSize] = useState<number>(() => {
    if (typeof window === 'undefined') return 1.15;
    try { return Number(JSON.parse(localStorage.getItem("readerPrefs") || "{}").fontSize) || 1.15; } catch { return 1.15; }
  });
  const [wordTapEnabled, setWordTapEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return !!JSON.parse(localStorage.getItem("readerPrefs") || "{}").wordTapEnabled; } catch { return false; }
  });
  const [showTranslation, setShowTranslation] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return !!JSON.parse(localStorage.getItem("readerPrefs") || "{}").showTranslation; } catch { return false; }
  });
  const [translationResult, setTranslationResult] = useState<TranslationParagraph[] | null>(initialTranslationData ?? null);
  const TRANSLATION_CACHE_MAX = 50;

  // Determine translation language and availability
  const translationLang = locale === "ar" ? "en" : locale;
  const hasTranslation = translatedLanguages?.includes(translationLang) ?? false;

  // Seed translation cache with server-fetched data
  const translationCacheRef = useRef<Map<string, TranslationParagraph[]>>(
    initialTranslationData && initialPageData
      ? new Map([[`${initialPageNumber ? parseInt(initialPageNumber, 10) : 0}:${translationLang}`, initialTranslationData]])
      : new Map()
  );

  const [currentPage, setCurrentPage] = useState<number>(
    initialPageNumber ? parseInt(initialPageNumber, 10) : 0
  );
  const [pageData, setPageData] = useState<PageData | null>(initialPageData ?? null);
  const [isLoading, setIsLoading] = useState(!initialPageData);
  const [error, setError] = useState<string | null>(null);
  const [pageInputValue, setPageInputValue] = useState(
    initialPageNumber || "0"
  );
  const [volumeInputValue, setVolumeInputValue] = useState(() => {
    if (totalVolumes <= 1) return "";
    const keys = Object.keys(volumeStartPages).sort((a, b) => Number(a) - Number(b));
    if (!keys.length) return "1";
    // Find which volume the initial page belongs to
    const initPage = initialPageNumber ? parseInt(initialPageNumber, 10) : 0;
    let vol = keys[0];
    for (const k of keys) {
      if (volumeStartPages[k] <= initPage) vol = k;
      else break;
    }
    // If we landed on volume 0 (front matter/cover) and it has no printed pages,
    // default to the first volume that has printed page data
    if (vol === "0" && volumeMaxPrintedPages["0"] == null) {
      const firstReal = keys.find(k => k !== "0" && volumeMaxPrintedPages[k] != null);
      if (firstReal) vol = firstReal;
    }
    return vol;
  });
  const [selectedWord, setSelectedWord] = useState<{ word: string; x: number; y: number; wordBottom: number } | null>(null);
  const [translatedTitle, setTranslatedTitle] = useState<string | null>(bookMetadata.titleTranslated || null);
  const activeTocRef = useRef<HTMLButtonElement>(null);
  const tocScrollRef = useRef<HTMLDivElement>(null);

  // Progressive TOC rendering — avoids blocking the main thread when sidebar opens
  const TOC_BATCH = 100;
  const [tocRenderLimit, setTocRenderLimit] = useState(0);
  const tocScrolledRef = useRef(false);

  // Sorted volume keys for dropdown
  const volumeKeys = useMemo(
    () => Object.keys(volumeStartPages).sort((a, b) => Number(a) - Number(b)),
    [volumeStartPages]
  );

  // Current volume's max printed page (falls back to global maxPrintedPage)
  const currentVolumeMaxPage = useMemo(() => {
    if (totalVolumes <= 1) return maxPrintedPage;
    // Only trust pageData's volume when it matches the current page (avoids stale data after volume switch)
    const vol = (pageData && pageData.pageNumber === currentPage)
      ? pageData.volumeNumber
      : (volumeInputValue ? Number(volumeInputValue) : 0);
    const perVol = volumeMaxPrintedPages[String(vol)];
    if (perVol != null) return perVol;
    return maxPrintedPage;
  }, [pageData, currentPage, volumeInputValue, volumeMaxPrintedPages, maxPrintedPage, totalVolumes]);

  // Handle volume dropdown change
  const handleVolumeChange = useCallback((vol: string) => {
    setVolumeInputValue(vol);
    const startPage = volumeStartPages[vol];
    if (startPage != null) {
      setCurrentPage(startPage);
      // Reset page input to avoid showing stale printed page from previous volume
      setPageInputValue("1");
    }
  }, [volumeStartPages]);

  // Gate persist effect so the initial (already-correct) values don't trigger a write
  const prefsHydrated = useRef(false);
  useEffect(() => { prefsHydrated.current = true; }, []);

  // Persist reader preferences to localStorage + sync translation cookie for SSR
  useEffect(() => {
    if (!prefsHydrated.current) return;
    try { localStorage.setItem("readerPrefs", JSON.stringify({ fontSize, wordTapEnabled, showTranslation })); } catch {}
    // Sync to cookie so server can pre-fetch translation data
    document.cookie = `reader-translation=${showTranslation ? "1" : "0"};path=/;max-age=${365 * 86400};SameSite=Lax`;
  }, [fontSize, wordTapEnabled, showTranslation]);

  // Analytics: page view duration tracking
  const pageViewStartRef = useRef<number>(Date.now());
  const currentPageRef = useRef<number>(currentPage);

  // Fetch translated title when config requires it and we don't have one
  useEffect(() => {
    if (config.bookTitleDisplay !== "translation" || translatedTitle) return;
    const lang = locale === "ar" ? "en" : locale;
    fetch(`/api/books/${encodeURIComponent(bookMetadata.id)}?bookTitleLang=${lang}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.book?.titleTranslated) setTranslatedTitle(data.book.titleTranslated);
      })
      .catch(() => {});
  }, [config.bookTitleDisplay, bookMetadata.id, locale, translatedTitle]);

  // Reset parent scroll and track "open" once on mount
  useEffect(() => {
    // Scroll parent <main> to top to prevent residual scroll offset
    // from previous page affecting fixed-position reader layout
    const main = document.querySelector("main");
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);

    trackBookEvent(bookMetadata.id, "open", currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track "page_view" duration when page changes
  useEffect(() => {
    const prevPage = currentPageRef.current;
    const duration = Date.now() - pageViewStartRef.current;
    if (prevPage !== currentPage && duration > 500) {
      trackBookEvent(bookMetadata.id, "page_view", prevPage, duration);
    }
    currentPageRef.current = currentPage;
    pageViewStartRef.current = Date.now();
  }, [currentPage, bookMetadata.id]);

  // Track final page_view on unload / visibility change / unmount
  useEffect(() => {
    const sendFinalDuration = () => {
      const duration = Date.now() - pageViewStartRef.current;
      if (duration > 500) {
        trackBookEvent(bookMetadata.id, "page_view", currentPageRef.current, duration);
      }
      pageViewStartRef.current = Date.now();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        sendFinalDuration();
      }
    };

    const handleBeforeUnload = () => {
      sendFinalDuration();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      sendFinalDuration();
    };
  }, [bookMetadata.id]);

  // Page cache (LRU, capped at 30 entries), seeded with server-fetched page
  const cacheRef = useRef<Map<number, PageData>>(
    initialPageData
      ? new Map([[initialPageData.pageNumber, initialPageData]])
      : new Map()
  );
  const CACHE_MAX = 30;

  const cacheGet = useCallback((key: number): PageData | undefined => {
    const val = cacheRef.current.get(key);
    if (val !== undefined) {
      // Move to end (most recently used)
      cacheRef.current.delete(key);
      cacheRef.current.set(key, val);
    }
    return val;
  }, []);

  const cacheSet = useCallback((key: number, val: PageData) => {
    cacheRef.current.delete(key); // remove if exists (refresh position)
    cacheRef.current.set(key, val);
    // Evict oldest if over limit
    if (cacheRef.current.size > CACHE_MAX) {
      const oldest = cacheRef.current.keys().next().value;
      if (oldest !== undefined) cacheRef.current.delete(oldest);
    }
  }, []);

  // Abort controller for current page fetch (cancels stale requests)
  const abortRef = useRef<AbortController | null>(null);
  // Tracks the latest requested page to guard against race conditions
  const latestRequestedPageRef = useRef<number>(currentPage);

  const fetchPage = useCallback(async (pageNumber: number) => {
    latestRequestedPageRef.current = pageNumber;

    // Check cache
    const cached = cacheGet(pageNumber);
    if (cached) {
      setPageData(cached);
      setIsLoading(false);
      return;
    }

    // Abort any in-flight fetch
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/books/${bookMetadata.id}/pages/${pageNumber}`, {
        signal: controller.signal,
      });

      // Guard: if user already navigated away, discard this response
      if (latestRequestedPageRef.current !== pageNumber) return;

      if (!res.ok) {
        if (res.status === 404) {
          setError("Page not found");
        } else {
          setError("Failed to load page");
        }
        setPageData(null);
        return;
      }

      const data = await res.json();
      const page = data.page as PageData;
      cacheSet(pageNumber, page);

      // Final guard before setting state
      if (latestRequestedPageRef.current === pageNumber) {
        setPageData(page);
      }
    } catch (err: unknown) {
      // Ignore abort errors — they're expected
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (latestRequestedPageRef.current === pageNumber) {
        setError("Failed to load page");
        setPageData(null);
      }
    } finally {
      if (latestRequestedPageRef.current === pageNumber) {
        setIsLoading(false);
      }
    }
  }, [bookMetadata.id, cacheGet, cacheSet]);

  // Track in-flight prefetches to avoid duplicate requests
  const prefetchingRef = useRef<Set<number>>(new Set());

  // Prefetch a single page (no abort — let requests complete to populate cache)
  const prefetchPage = useCallback(async (pageNumber: number) => {
    if (pageNumber < 0 || pageNumber >= totalPages) return;
    if (cacheRef.current.has(pageNumber) || prefetchingRef.current.has(pageNumber)) return;
    prefetchingRef.current.add(pageNumber);
    try {
      const res = await fetch(`/api/books/${bookMetadata.id}/pages/${pageNumber}`);
      if (res.ok) {
        const data = await res.json();
        cacheSet(pageNumber, data.page);
      }
    } catch {
      // Silent prefetch failure
    } finally {
      prefetchingRef.current.delete(pageNumber);
    }
  }, [bookMetadata.id, totalPages, cacheSet]);

  // Track in-flight translation prefetches
  const prefetchingTranslationsRef = useRef<Set<string>>(new Set());

  // Prefetch a single translation (no abort — let it complete)
  const prefetchTranslation = useCallback(async (pageNumber: number, lang: string) => {
    if (pageNumber < 0 || pageNumber >= totalPages) return;
    const key = `${pageNumber}:${lang}`;
    if (translationCacheRef.current.has(key) || prefetchingTranslationsRef.current.has(key)) return;
    prefetchingTranslationsRef.current.add(key);
    try {
      const res = await fetch(`/api/books/${bookMetadata.id}/pages/${pageNumber}/translation?lang=${encodeURIComponent(lang)}`);
      if (res.ok) {
        const data = await res.json();
        translationCacheRef.current.delete(key);
        translationCacheRef.current.set(key, data.paragraphs);
        if (translationCacheRef.current.size > TRANSLATION_CACHE_MAX) {
          const oldest = translationCacheRef.current.keys().next().value;
          if (oldest !== undefined) translationCacheRef.current.delete(oldest);
        }
      }
    } catch {
      // Silent prefetch failure
    } finally {
      prefetchingTranslationsRef.current.delete(key);
    }
  }, [bookMetadata.id, totalPages]);

  // Fetch current page
  useEffect(() => {
    fetchPage(currentPage);
  }, [currentPage, fetchPage]);

  // Prefetch 5 ahead + 2 behind after current page loads (pages + translations)
  useEffect(() => {
    if (!isLoading && pageData) {
      for (let i = 1; i <= 5; i++) {
        prefetchPage(currentPage + i);
      }
      for (let i = 1; i <= 2; i++) {
        prefetchPage(currentPage - i);
      }
      // Prefetch translations for nearby pages when translation is active
      if (showTranslation && hasTranslation && translationLang) {
        for (let i = 1; i <= 3; i++) {
          prefetchTranslation(currentPage + i, translationLang);
        }
        prefetchTranslation(currentPage - 1, translationLang);
      }
    }
  }, [isLoading, pageData, currentPage, prefetchPage, showTranslation, hasTranslation, translationLang, prefetchTranslation]);

  // Fetch translation when toggle is on
  useEffect(() => {
    if (!showTranslation || !hasTranslation) {
      setTranslationResult(null);

      return;
    }

    const cacheKey = `${currentPage}:${translationLang}`;
    const cached = translationCacheRef.current.get(cacheKey);
    if (cached) {
      setTranslationResult(cached);

      return;
    }

    let cancelled = false;
    setTranslationResult(null);


    fetch(`/api/books/${bookMetadata.id}/pages/${currentPage}/translation?lang=${encodeURIComponent(translationLang)}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const paragraphs = data.paragraphs as TranslationParagraph[];
        // Cache with LRU eviction
        translationCacheRef.current.delete(cacheKey);
        translationCacheRef.current.set(cacheKey, paragraphs);
        if (translationCacheRef.current.size > TRANSLATION_CACHE_MAX) {
          const oldest = translationCacheRef.current.keys().next().value;
          if (oldest !== undefined) translationCacheRef.current.delete(oldest);
        }
        setTranslationResult(paragraphs);
      })
      .catch(() => {
        if (!cancelled) setTranslationResult(null);
      })
      ;

    return () => { cancelled = true; };
  }, [showTranslation, hasTranslation, currentPage, translationLang, bookMetadata.id]);

  // Update URL when page changes
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("pn", currentPage.toString());
    window.history.replaceState({}, "", url.toString());
  }, [currentPage]);

  // Update displayed page/volume values only when pageData matches currentPage
  useEffect(() => {
    if (!pageData || pageData.pageNumber !== currentPage) return;
    setPageInputValue(displayPageNumber(pageData, currentPage));
    if (totalVolumes > 1) {
      setVolumeInputValue(pageData.volumeNumber > 0 ? String(pageData.volumeNumber) : volumeKeys[0] || "1");
    }
  }, [pageData, currentPage, totalVolumes, volumeKeys]);

  // Scroll to top on page change
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [pageData]);

  // Close word popover on page change
  useEffect(() => {
    setSelectedWord(null);
  }, [currentPage]);

  // Progressive TOC rendering: when sidebar opens, render chapters in batches
  // so the panel appears instantly and entries fill in without blocking
  useEffect(() => {
    if (!showSidebar) {
      setTocRenderLimit(0);
      tocScrolledRef.current = false;
      return;
    }
    if (toc.length === 0) return;

    let raf: number;
    let limit = 0;
    const renderBatch = () => {
      limit = Math.min(limit + TOC_BATCH, toc.length);
      setTocRenderLimit(limit);
      if (limit < toc.length) {
        raf = requestAnimationFrame(renderBatch);
      }
    };
    // Defer first batch to after the sidebar's opening animation paint
    raf = requestAnimationFrame(renderBatch);
    return () => cancelAnimationFrame(raf);
  }, [showSidebar, toc.length]);

  // Auto-scroll TOC to active chapter once it's rendered
  useEffect(() => {
    if (showSidebar && !tocScrolledRef.current && activeTocRef.current) {
      tocScrolledRef.current = true;
      requestAnimationFrame(() => {
        activeTocRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
      });
    }
  }, [showSidebar, tocRenderLimit]);

  // RAF-debounced navigation: collapses rapid calls into one state update per frame
  const rafRef = useRef<number>(0);
  const pendingPageRef = useRef<number | null>(null);

  const commitPage = useCallback((targetPage: number) => {
    pendingPageRef.current = targetPage;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        if (pendingPageRef.current !== null) {
          setCurrentPage(pendingPageRef.current);
          pendingPageRef.current = null;
        }
      });
    }
  }, []);

  // Clean up RAF on unmount
  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const goToPrevPage = useCallback(() => {
    const cur = pendingPageRef.current ?? currentPageRef.current;
    const next = Math.max(0, cur - 1);
    commitPage(next);
  }, [commitPage]);

  const goToNextPage = useCallback(() => {
    const cur = pendingPageRef.current ?? currentPageRef.current;
    const next = Math.min(totalPages - 1, cur + 1);
    commitPage(next);
  }, [totalPages, commitPage]);

  // Keyboard navigation (fixed dependency array)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (dir === "rtl") {
          goToNextPage();
        } else {
          goToPrevPage();
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (dir === "rtl") {
          goToPrevPage();
        } else {
          goToNextPage();
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [goToNextPage, goToPrevPage, dir]);

  const goBack = () => {
    if (config.hapticsEnabled) triggerHaptic("light");
    // If we have browser history, go back; otherwise navigate to home
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  // Handle clicks on [data-page] links and word taps in content
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    // Handle [data-page] navigation links (e.g. TOC entries on overview page)
    const pageTarget = (e.target as HTMLElement).closest("[data-page]") as HTMLElement | null;
    if (pageTarget) {
      e.preventDefault();
      const printedPage = parseInt(pageTarget.dataset.page || "", 10);
      if (!isNaN(printedPage)) {
        // data-page contains a printed page number — convert to internal page index.
        // Find which volume this printed page belongs to by checking each volume's
        // printed page range (minPrinted..maxPrinted).
        const sortedVols = Object.keys(volumeStartPages).sort((a, b) => Number(a) - Number(b));
        let targetVol = sortedVols[0] || "1";
        for (const vol of sortedVols) {
          const minP = volumeMinPrintedPages[vol] ?? 0;
          const maxP = volumeMaxPrintedPages[vol] ?? Infinity;
          if (printedPage >= minP && printedPage <= maxP) {
            targetVol = vol;
            break;
          }
        }

        const volStart = volumeStartPages[targetVol] ?? 0;
        const minPrinted = volumeMinPrintedPages[targetVol] ?? 0;
        const internalPage = volStart + (printedPage - minPrinted);

        // Clamp to valid range
        const clamped = Math.max(0, Math.min(totalPages - 1, internalPage));
        setCurrentPage(clamped);
      }
      return;
    }

    // Handle word taps
    const wordTarget = (e.target as HTMLElement).closest(".word") as HTMLElement | null;
    if (wordTarget?.dataset.word) {
      if (config.hapticsEnabled) triggerHaptic("light");
      const rect = wordTarget.getBoundingClientRect();
      setSelectedWord({
        word: wordTarget.dataset.word,
        x: rect.left + rect.width / 2,
        y: rect.top,
        wordBottom: rect.bottom,
      });
      trackBookEvent(bookMetadata.id, "word_lookup", currentPage, undefined, wordTarget.dataset.word);
      return;
    }

    // Click on empty area → close popover
    setSelectedWord(null);
  }, [totalPages, bookMetadata.id, currentPage, volumeStartPages, volumeMinPrintedPages, volumeMaxPrintedPages]);

  const handlePageInputSubmit = (e: React.FormEvent | React.FocusEvent) => {
    e.preventDefault();
    const num = parseInt(pageInputValue, 10);
    if (isNaN(num)) {
      setPageInputValue(displayPageNumber(pageData, currentPage));
      return;
    }

    // Use the selected volume (dropdown), not pageData which may be stale
    const vol = volumeInputValue || (pageData?.volumeNumber != null ? String(pageData.volumeNumber) : "");
    const volStart = vol ? (volumeStartPages[vol] ?? 0) : 0;
    const minPrinted = vol ? (volumeMinPrintedPages[vol] ?? 0) : 0;

    // Compute the next volume's start page to determine this volume's end
    const sortedKeys = Object.keys(volumeStartPages).sort((a, b) => Number(a) - Number(b));
    const volIdx = sortedKeys.indexOf(vol);
    const volEnd = volIdx >= 0 && volIdx < sortedKeys.length - 1
      ? volumeStartPages[sortedKeys[volIdx + 1]] - 1
      : totalPages - 1;

    // Internal page = volume start + (printed page - first printed page in this volume)
    const estimated = volStart + (num - minPrinted);
    if (estimated >= volStart && estimated <= volEnd) {
      setCurrentPage(estimated);
    } else {
      // Clamp to volume bounds
      const clamped = Math.max(volStart, Math.min(volEnd, estimated));
      setCurrentPage(clamped);
    }
  };



  const handleOpenPdf = useCallback(() => {
    let url = `/api/books/${bookMetadata.id}/pages/${currentPage}/pdf`;
    const printedPage = pageData?.printedPageNumber;
    if (printedPage != null && printedPage >= 1) {
      url += `#page=${printedPage}`;
    }
    window.open(url, "_blank", "noopener");
    trackBookEvent(bookMetadata.id, "pdf_open", currentPage);
  }, [bookMetadata.id, currentPage, pageData?.printedPageNumber]);

  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background touch-manipulation">
      {/* Word hover styles (injected because content uses dangerouslySetInnerHTML) */}
      {wordTapEnabled && <style>{`.word { cursor: pointer; border-radius: 2px; } .word:hover { background-color: rgba(128, 128, 128, 0.15); }`}</style>}
      {/* Header */}
      <div
        className="flex items-center gap-2 md:gap-3 border-b border-border/50 px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 shrink-0"
        style={{ backgroundColor: 'hsl(var(--background))' }}
      >
        {/* Back button — bigger on mobile */}
        <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0 h-10 w-10 sm:h-9 sm:w-9">
          <ArrowLeft className="h-6 w-6 sm:h-5 sm:w-5 rtl:scale-x-[-1]" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-base">
            {expandHonorifics(bookMetadata.title)}
          </h1>
          {config.bookTitleDisplay !== "none" && (
            <p className="truncate text-sm text-muted-foreground hidden sm:block">
              {config.bookTitleDisplay === "translation"
                ? (translatedTitle || bookMetadata.titleLatin)
                : bookMetadata.titleLatin}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          {/* Translation loading indicator removed for smooth transitions */}
          {/* Desktop page controls — hidden on mobile (moved to bottom bar) */}
          <div className="hidden sm:flex items-center gap-1 rounded-lg bg-foreground/[0.04] px-1.5 py-0.5" dir="ltr">
            <motion.div whileHover={prefersReducedMotion ? undefined : { scale: 1.06 }} whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
              <Button
                variant="ghost"
                size="icon"
                onClick={goToNextPage}
                disabled={currentPage >= totalPages - 1}
                title={t("reader.nextPage")}
                className="h-8 w-8"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </motion.div>
            <div className="flex items-center gap-1">
              {totalVolumes > 1 && volumeKeys.length > 0 && (
                <div className="flex items-center gap-0.5">
                  <span className="text-sm text-muted-foreground">
                    {t("reader.volume")}
                  </span>
                  <select
                    value={volumeInputValue}
                    onChange={(e) => handleVolumeChange(e.target.value)}
                    className="text-sm text-center bg-transparent border-b border-border focus:border-primary focus:outline-none tabular-nums cursor-pointer appearance-none px-1"
                  >
                    {volumeKeys.map((vol) => (
                      <option key={vol} value={vol}>{vol}</option>
                    ))}
                  </select>
                  <span className="text-sm text-muted-foreground mx-0.5">·</span>
                </div>
              )}
              <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">
                  {t("reader.page")}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={pageInputValue}
                  onChange={(e) => setPageInputValue(e.target.value)}
                  onBlur={handlePageInputSubmit}
                  className="w-12 text-sm text-center bg-transparent border-b border-border focus:border-primary focus:outline-none tabular-nums"
                />
                <span className="text-xs text-muted-foreground hidden md:inline">
                  / {currentVolumeMaxPage}
                </span>
              </form>
            </div>
            <motion.div whileHover={prefersReducedMotion ? undefined : { scale: 1.06 }} whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
              <Button
                variant="ghost"
                size="icon"
                onClick={goToPrevPage}
                disabled={currentPage <= 0}
                title={t("reader.prevPage")}
                className="h-8 w-8"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </motion.div>
          </div>

          {/* Menu button — bigger on mobile */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { if (config.hapticsEnabled) triggerHaptic("light"); setShowSidebar(!showSidebar); }}
            title={t("reader.chapters")}
            className="h-10 w-10 sm:h-9 sm:w-9 md:h-10 md:w-10"
          >
            <EllipsisVertical className="h-6 w-6 sm:h-5 sm:w-5" />
          </Button>
        </div>
      </div>

      {/* Reading progress */}
      <div className="h-0.5 bg-muted shrink-0">
        <div
          className="h-full bg-brand transition-all duration-300 ease-out"
          style={{ width: `${((currentPage + 1) / totalPages) * 100}%` }}
        />
      </div>

      {/* Sidebar overlay — desktop only (mobile uses full-screen) */}
      {showSidebar && (
        <div
          className="hidden sm:block fixed inset-0 z-20"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Options panel — full-screen on mobile, dropdown on desktop */}
      {/* Wrapper ensures pointer-events are disabled immediately when sidebar closes,
          preventing the exit animation from blocking clicks on header buttons */}
      <div style={{ pointerEvents: showSidebar ? undefined : "none" }}>
      <AnimatePresence>
      {showSidebar && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        dir={dir}
        className={`fixed inset-0 sm:absolute sm:inset-auto sm:top-20 ${dir === "rtl" ? "sm:left-4" : "sm:right-4"} sm:w-80 sm:max-h-[calc(100vh-6rem)] sm:rounded-lg sm:border sm:shadow-xl bg-[hsl(var(--background))] z-30 flex flex-col touch-manipulation`}
      >
        {/* Mobile close header — X positioned to match the options menu button */}
        <div className="sm:hidden flex items-center border-b px-2 py-2">
          <div className="flex-1 ps-2">
            <h2 className="font-semibold text-base">{t("reader.options")}</h2>
          </div>
          <button
            onClick={() => setShowSidebar(false)}
            className="h-10 w-10 rounded-full hover:bg-muted flex items-center justify-center transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Links section */}
        <div className="p-3 sm:p-3 space-y-1 touch-manipulation">
          <PrefetchLink
            href={`/authors/${bookMetadata.authorId}`}
            className="w-full px-4 py-3 rounded-md hover:bg-muted text-sm transition-colors flex items-center gap-2"
            onClick={() => setShowSidebar(false)}
          >
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{t("reader.author")}: {expandHonorifics(bookMetadata.author)}</span>
          </PrefetchLink>
          {pageData?.pdfUrl ? (
            <button
              onClick={() => {
                handleOpenPdf();
                setShowSidebar(false);
              }}
              className="w-full px-4 py-3 rounded-md hover:bg-muted text-sm transition-colors flex items-center gap-2"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{t("reader.openPdf")}</span>
            </button>
          ) : (
            <div className="w-full px-4 py-3 text-sm flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4 shrink-0" />
              <span>{t("reader.pdfNotAvailable")}</span>
            </div>
          )}

          {/* Font size */}
          <div className="w-full px-4 py-3 text-sm flex items-center justify-between">
            <span>{t("reader.fontSize")}</span>
            <div className="flex items-center gap-2" dir="ltr">
              <button
                onClick={() => { if (config.hapticsEnabled) triggerHaptic("light"); setFontSize((s) => Math.max(0.8, +(s - 0.1).toFixed(1))); }}
                className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-muted transition-colors"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-muted-foreground">{Math.round(fontSize * 100)}%</span>
              <button
                onClick={() => { if (config.hapticsEnabled) triggerHaptic("light"); setFontSize((s) => Math.min(2.0, +(s + 0.1).toFixed(1))); }}
                className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-muted transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Audio reader link */}
          <PrefetchLink
            href={`/audiobook/${bookMetadata.id}?pn=${currentPage}`}
            replace
            className="w-full px-4 py-3 rounded-md hover:bg-muted text-sm transition-colors flex items-center gap-2"
            onClick={() => setShowSidebar(false)}
          >
            <Headphones className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{t("audio.listenToBook")}</span>
          </PrefetchLink>

          {/* Word definitions toggle */}
          <button
            onClick={() => {
              if (config.hapticsEnabled) triggerHaptic("light");
              setWordTapEnabled((v) => !v);
              setSelectedWord(null);
            }}
            className="w-full px-4 py-3 text-sm flex items-center justify-between hover:bg-muted rounded-md transition-colors"
          >
            <span>{t("reader.wordDefinitions")}</span>
            <div
              className={`w-11 h-6 rounded-full transition-colors relative ${wordTapEnabled ? "bg-primary" : "bg-muted-foreground/20"}`}
            >
              <div
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white dark:bg-gray-900 shadow-sm transition-all ${wordTapEnabled ? "right-0.5" : "right-[calc(100%-1.375rem)]"}`}
              />
            </div>
          </button>

          {/* Translation toggle */}
          {hasTranslation ? (
            <button
              onClick={() => { if (config.hapticsEnabled) triggerHaptic("light"); setShowTranslation((v) => !v); }}
              className="w-full px-4 py-3 text-sm flex items-center justify-between hover:bg-muted rounded-md transition-colors"
            >
              <span className="flex items-center gap-2">
                <Languages className="h-4 w-4 shrink-0 text-muted-foreground" />
                {t("reader.showTranslation")}
              </span>
              <div
                className={`w-11 h-6 rounded-full transition-colors relative ${showTranslation ? "bg-primary" : "bg-muted-foreground/20"}`}
              >
                <div
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white dark:bg-gray-900 shadow-sm transition-all ${showTranslation ? "right-0.5" : "right-[calc(100%-1.375rem)]"}`}
                />
              </div>
            </button>
          ) : (
            <div className="w-full px-4 py-3 text-sm flex items-center gap-2 text-muted-foreground">
              <Languages className="h-4 w-4 shrink-0" />
              <span>{t("reader.translationNotAvailable")}</span>
            </div>
          )}

        </div>

        {/* Table of Contents section */}
        {toc.length > 0 && (
          <>
            <div className="px-3 pb-1">
              <div className="border-t" />
              <h2 className="font-semibold text-sm mt-2">{t("reader.chapters")}</h2>
            </div>

            <div ref={tocScrollRef} className="flex-1 overflow-auto p-3 pt-0 pb-[env(safe-area-inset-bottom)] touch-manipulation">
              <div className="space-y-1">
                {toc.slice(0, tocRenderLimit).map((entry, index) => {
                  const depth = entry.level;
                  const bullets = ["●", "○", "▪", "◦", "▸"];
                  const bullet = depth > 0 ? bullets[Math.min(depth - 1, bullets.length - 1)] : "";
                  const isActive = entry.page <= currentPage &&
                    (index === toc.length - 1 || toc[index + 1].page > currentPage);

                  return (
                    <button
                      key={index}
                      ref={isActive ? activeTocRef : undefined}
                      onClick={() => {
                        setCurrentPage(entry.page);
                        setShowSidebar(false);
                      }}
                      className={`w-full px-4 py-3 rounded-md hover:bg-muted text-sm transition-colors flex items-center gap-2 ${isActive ? "bg-muted font-medium" : ""}`}
                      style={{
                        paddingInlineStart: `${depth * 16 + 12}px`,
                        contentVisibility: "auto",
                        containIntrinsicSize: "auto 44px",
                      }}
                    >
                      {bullet && <span className="text-muted-foreground text-xs">{bullet}</span>}
                      <span>{entry.title}</span>
                    </button>
                  );
                })}
                {tocRenderLimit < toc.length && (
                  <div className="flex justify-center py-3">
                    <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground/80 rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </motion.div>
      )}
      </AnimatePresence>
      </div>

      {/* Content area */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto"
        dir="rtl"
        onClick={handleContentClick}
        style={{ backgroundColor: 'hsl(var(--background))' }}
      >
        {isLoading && !pageData && !error && (
          <div
            className="max-w-3xl mx-auto px-5 md:px-12 py-6 md:py-10 space-y-4"
            dir="rtl"
          >
            {[85, 92, 78, 95, 70, 88, 74, 97, 82, 90, 76, 93].map((w, i) => (
              <div
                key={i}
                className="h-4 bg-muted rounded animate-shimmer"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
        )}

        {error && !pageData && (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">{error}</p>
          </div>
        )}

        {pageData && (
          <div
            className="max-w-3xl mx-auto px-5 md:px-12 py-6 md:py-10 pb-28 sm:pb-10"
            style={{
              fontFamily: 'var(--font-noto-naskh), sans-serif',
              lineHeight: 2.0,
              fontSize: `${fontSize}rem`,
              color: 'hsl(var(--reader-fg))',
            }}
          >
            {showTranslation && translationResult && (
              <div
                dir={dir}
                className="mb-4 px-4 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300 text-sm leading-relaxed"
                style={{ fontFamily: 'system-ui, sans-serif', fontSize: '0.85rem', lineHeight: 1.5 }}
              >
                <span className="font-semibold">[{t("reader.showTranslation")}]</span>{" "}
                {t("reader.aiTranslationDisclaimer")}
              </div>
            )}
            <div
              dangerouslySetInnerHTML={{
                __html: formatContentHtml(
                  pageData.contentHtml,
                  wordTapEnabled,
                  showTranslation && translationResult ? translationResult : undefined,
                  pageData.pageNumber === 0,
                ),
              }}
            />
          </div>
        )}
      </div>

      {/* Mobile bottom page navigation */}
      <div
        className="sm:hidden shrink-0 border-t border-border/50 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] touch-manipulation"
        style={{ backgroundColor: 'hsl(var(--background))' }}
        dir="ltr"
      >
        <div className="flex items-center justify-between">
          <button
            onClick={() => { if (config.hapticsEnabled) triggerHaptic("light"); goToNextPage(); }}
            disabled={currentPage >= totalPages - 1}
            className="h-11 px-5 rounded-xl bg-foreground/[0.06] hover:bg-foreground/[0.1] active:bg-foreground/[0.15] flex items-center justify-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
            {t("reader.next")}
          </button>

          <div className="flex flex-col items-center gap-0.5">
            {totalVolumes > 1 && volumeKeys.length > 0 && (
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-muted-foreground/70">{t("reader.volume")}</span>
                <select
                  value={volumeInputValue}
                  onChange={(e) => handleVolumeChange(e.target.value)}
                  className="text-[11px] text-center bg-transparent border-b border-border focus:border-primary focus:outline-none tabular-nums cursor-pointer appearance-none px-0.5"
                >
                  {volumeKeys.map((vol) => (
                    <option key={vol} value={vol}>{vol}</option>
                  ))}
                </select>
                <span className="text-muted-foreground/70">/ {totalVolumes}</span>
              </div>
            )}
            <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">{t("reader.page")}</span>
              <input
                type="text"
                inputMode="numeric"
                value={pageInputValue}
                onChange={(e) => setPageInputValue(e.target.value)}
                onBlur={handlePageInputSubmit}
                className="w-10 text-sm text-center bg-transparent border-b border-border focus:border-primary focus:outline-none tabular-nums"
              />
              <span className="text-muted-foreground text-xs">/ {currentVolumeMaxPage}</span>
            </form>
          </div>

          <button
            onClick={() => { if (config.hapticsEnabled) triggerHaptic("light"); goToPrevPage(); }}
            disabled={currentPage <= 0}
            className="h-11 px-5 rounded-xl bg-foreground/[0.06] hover:bg-foreground/[0.1] active:bg-foreground/[0.15] flex items-center justify-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-30"
          >
            {t("reader.prev")}
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {selectedWord && (
        <WordDefinitionPopover
          word={selectedWord.word}
          position={{ x: selectedWord.x, y: selectedWord.y, wordBottom: selectedWord.wordBottom }}
          onClose={() => setSelectedWord(null)}
        />
      )}
    </div>
  );
}
