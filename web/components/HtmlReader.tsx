"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, ChevronLeft, Loader2, EllipsisVertical, FileText, User, Minus, Plus, X, Languages } from "lucide-react";
import { PrefetchLink } from "./PrefetchLink";
import { useTranslation } from "@/lib/i18n";
import { useAppConfig } from "@/lib/config";
import { WordDefinitionPopover } from "./WordDefinitionPopover";
import { trackBookEvent } from "@/lib/analytics";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "@/lib/use-reduced-motion";

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
  totalPages: number;
  totalVolumes: number;
  maxPrintedPage: number;
  volumeStartPages?: Record<string, number>;
  volumeMaxPrintedPages?: Record<string, number>;
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
  let inFootnotes = false;

  for (const line of lines) {

    const trimmed = line.trim();
    if (!trimmed) continue;

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
        '<div style="margin-top:2em;padding-top:1.5em;text-align:center"><span style="display:inline-block;width:3em;border-top:1px solid currentColor;opacity:0.4"></span></div><div style="opacity:0.85">'
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

  // Interleave translation paragraphs if provided
  if (translationParagraphs && translationParagraphs.length > 0) {
    const translationMap = new Map(translationParagraphs.map((p) => [p.index, p.translation]));
    const interleaved: string[] = [];
    for (let i = 0; i < formatted.length; i++) {
      interleaved.push(formatted[i]);
      const translation = translationMap.get(i);
      if (translation) {
        interleaved.push(
          `<p dir="ltr" style="margin:0.3em 0 0.8em;padding:0.5em 0.8em;border-inline-start:3px solid hsl(var(--brand));opacity:0.85;font-size:0.88em;line-height:1.7;font-family:system-ui,sans-serif">${translation}</p>`
        );
      }
    }
    formatted.length = 0;
    formatted.push(...interleaved);
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

export function HtmlReader({ bookMetadata, initialPageNumber, totalPages, totalVolumes, maxPrintedPage, volumeStartPages = {}, volumeMaxPrintedPages = {}, toc = [], translatedLanguages }: HtmlReaderProps) {
  const router = useRouter();
  const { t, dir, locale } = useTranslation();
  const { config } = useAppConfig();
  const contentRef = useRef<HTMLDivElement>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [fontSize, setFontSize] = useState(1.15);
  const [wordTapEnabled, setWordTapEnabled] = useState(true);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translationResult, setTranslationResult] = useState<TranslationParagraph[] | null>(null);
  const [isTranslationLoading, setIsTranslationLoading] = useState(false);
  const translationCacheRef = useRef<Map<string, TranslationParagraph[]>>(new Map());
  const TRANSLATION_CACHE_MAX = 50;

  // Determine translation language and availability
  const translationLang = locale === "ar" ? "en" : locale;
  const hasTranslation = translatedLanguages?.includes(translationLang) ?? false;

  const [currentPage, setCurrentPage] = useState<number>(
    initialPageNumber ? parseInt(initialPageNumber, 10) : 0
  );
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageInputValue, setPageInputValue] = useState(
    initialPageNumber || "0"
  );
  const [volumeInputValue, setVolumeInputValue] = useState("");
  const [selectedWord, setSelectedWord] = useState<{ word: string; x: number; y: number; wordBottom: number } | null>(null);
  const [translatedTitle, setTranslatedTitle] = useState<string | null>(bookMetadata.titleTranslated || null);

  // Sorted volume keys for dropdown
  const volumeKeys = useMemo(
    () => Object.keys(volumeStartPages).sort((a, b) => Number(a) - Number(b)),
    [volumeStartPages]
  );

  // Current volume's max printed page (falls back to global maxPrintedPage)
  const currentVolumeMaxPage = useMemo(() => {
    if (totalVolumes <= 1) return maxPrintedPage;
    const vol = pageData?.volumeNumber;
    if (vol != null && vol > 0) {
      const perVol = volumeMaxPrintedPages[String(vol)];
      if (perVol != null) return perVol;
    }
    return maxPrintedPage;
  }, [pageData?.volumeNumber, volumeMaxPrintedPages, maxPrintedPage, totalVolumes]);

  // Handle volume dropdown change
  const handleVolumeChange = useCallback((vol: string) => {
    const startPage = volumeStartPages[vol];
    if (startPage != null) {
      setCurrentPage(startPage);
    }
  }, [volumeStartPages]);

  // Hydrate reader preferences from localStorage after mount
  const prefsHydrated = useRef(false);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem("readerPrefs") || "{}");
      if (v.fontSize != null) setFontSize(v.fontSize);
      if (v.wordTapEnabled != null) setWordTapEnabled(v.wordTapEnabled);
      if (v.showTranslation != null) setShowTranslation(v.showTranslation);
    } catch {}
    prefsHydrated.current = true;
  }, []);

  // Persist reader preferences to localStorage on change
  useEffect(() => {
    if (!prefsHydrated.current) return;
    try { localStorage.setItem("readerPrefs", JSON.stringify({ fontSize, wordTapEnabled, showTranslation })); } catch {}
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

  // Track "open" once on mount
  useEffect(() => {
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

  // Page cache (LRU, capped at 30 entries)
  const cacheRef = useRef<Map<number, PageData>>(new Map());
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

  // Prefetch a single page (with abort signal support)
  const prefetchPage = useCallback(async (pageNumber: number, signal?: AbortSignal) => {
    if (pageNumber < 0 || pageNumber >= totalPages || cacheRef.current.has(pageNumber)) return;
    try {
      const res = await fetch(`/api/books/${bookMetadata.id}/pages/${pageNumber}`, { signal });
      if (res.ok) {
        const data = await res.json();
        cacheSet(pageNumber, data.page);
      }
    } catch {
      // Silent prefetch failure (including AbortError)
    }
  }, [bookMetadata.id, totalPages, cacheSet]);

  // Abort controller for prefetch batch — cancelled on every navigation
  const prefetchAbortRef = useRef<AbortController | null>(null);

  // Fetch current page
  useEffect(() => {
    fetchPage(currentPage);
  }, [currentPage, fetchPage]);

  // Prefetch 5 ahead + 2 behind after current page loads
  useEffect(() => {
    if (!isLoading && pageData) {
      // Cancel previous prefetch batch
      prefetchAbortRef.current?.abort();
      const controller = new AbortController();
      prefetchAbortRef.current = controller;

      for (let i = 1; i <= 5; i++) {
        prefetchPage(currentPage + i, controller.signal);
      }
      for (let i = 1; i <= 2; i++) {
        prefetchPage(currentPage - i, controller.signal);
      }
    }
  }, [isLoading, pageData, currentPage, prefetchPage]);

  // Fetch translation when toggle is on
  useEffect(() => {
    if (!showTranslation || !hasTranslation) {
      setTranslationResult(null);
      setIsTranslationLoading(false);
      return;
    }

    const cacheKey = `${currentPage}:${translationLang}`;
    const cached = translationCacheRef.current.get(cacheKey);
    if (cached) {
      setTranslationResult(cached);
      setIsTranslationLoading(false);
      return;
    }

    let cancelled = false;
    setTranslationResult(null);
    setIsTranslationLoading(true);

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
      .finally(() => {
        if (!cancelled) setIsTranslationLoading(false);
      });

    return () => { cancelled = true; };
  }, [showTranslation, hasTranslation, currentPage, translationLang, bookMetadata.id]);

  // Update URL when page changes
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("pn", currentPage.toString());
    window.history.replaceState({}, "", url.toString());
    setPageInputValue(displayPageNumber(pageData, currentPage));
    if (pageData && totalVolumes > 1) {
      setVolumeInputValue(pageData.volumeNumber > 0 ? String(pageData.volumeNumber) : volumeKeys[0] || "1");
    }
  }, [currentPage, pageData, totalVolumes]);

  // Scroll to top on page change
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [pageData]);

  // Close word popover on page change
  useEffect(() => {
    setSelectedWord(null);
  }, [currentPage]);

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
      const page = parseInt(pageTarget.dataset.page || "", 10);
      if (!isNaN(page) && page >= 0 && page < totalPages) {
        setCurrentPage(page);
      }
      return;
    }

    // Handle word taps
    const wordTarget = (e.target as HTMLElement).closest(".word") as HTMLElement | null;
    if (wordTarget?.dataset.word) {
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
  }, [totalPages, bookMetadata.id, currentPage]);

  const handlePageInputSubmit = (e: React.FormEvent | React.FocusEvent) => {
    e.preventDefault();
    const num = parseInt(pageInputValue, 10);
    if (!isNaN(num) && num >= 0 && num < totalPages) {
      setCurrentPage(num);
    } else {
      setPageInputValue(displayPageNumber(pageData, currentPage));
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
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Word hover styles (injected because content uses dangerouslySetInnerHTML) */}
      {wordTapEnabled && <style>{`.word { cursor: pointer; border-radius: 2px; } .word:hover { background-color: rgba(128, 128, 128, 0.15); }`}</style>}
      {/* Header */}
      <div
        className="flex items-center gap-2 md:gap-3 border-b border-border/50 px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 shrink-0"
        style={{ backgroundColor: 'hsl(var(--reader-bg))' }}
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
          {/* Translation loading indicator */}
          {isTranslationLoading && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="hidden sm:inline">{t("reader.translating")}</span>
            </div>
          )}
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
          <motion.div whileHover={prefersReducedMotion ? undefined : { scale: 1.06 }} whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSidebar(!showSidebar)}
              title={t("reader.chapters")}
              className="h-10 w-10 sm:h-9 sm:w-9 md:h-10 md:w-10"
            >
              <EllipsisVertical className="h-6 w-6 sm:h-5 sm:w-5" />
            </Button>
          </motion.div>
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
      <AnimatePresence>
      {showSidebar && (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 300, damping: 28, mass: 0.8 }}
        dir={dir}
        className={`fixed inset-0 sm:absolute sm:inset-auto sm:top-20 ${dir === "rtl" ? "sm:left-4" : "sm:right-4"} sm:w-80 sm:max-h-[calc(100vh-6rem)] sm:rounded-lg sm:border sm:shadow-xl bg-[hsl(var(--reader-bg))] z-30 flex flex-col`}
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
        <div className="p-3 sm:p-3 space-y-1">
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
                onClick={() => setFontSize((s) => Math.max(0.8, +(s - 0.1).toFixed(1)))}
                className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-muted transition-colors"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-muted-foreground">{Math.round(fontSize * 100)}%</span>
              <button
                onClick={() => setFontSize((s) => Math.min(2.0, +(s + 0.1).toFixed(1)))}
                className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-muted transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Word definitions toggle */}
          <button
            onClick={() => {
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
              onClick={() => setShowTranslation((v) => !v)}
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

            <div className="flex-1 overflow-auto p-3 pt-0 pb-[env(safe-area-inset-bottom)]">
              <div className="space-y-1">
                {toc.map((entry, index) => {
                  const depth = entry.level;
                  const bullets = ["●", "○", "▪", "◦", "▸"];
                  const bullet = depth > 0 ? bullets[Math.min(depth - 1, bullets.length - 1)] : "";
                  const isActive = entry.page <= currentPage &&
                    (index === toc.length - 1 || toc[index + 1].page > currentPage);

                  return (
                    <button
                      key={index}
                      onClick={() => {
                        setCurrentPage(entry.page);
                        setShowSidebar(false);
                      }}
                      className={`w-full px-4 py-3 rounded-md hover:bg-muted text-sm transition-colors flex items-center gap-2 ${isActive ? "bg-muted font-medium" : ""}`}
                      style={{ paddingInlineStart: `${depth * 16 + 12}px` }}
                    >
                      {bullet && <span className="text-muted-foreground text-xs">{bullet}</span>}
                      <span>{entry.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </motion.div>
      )}
      </AnimatePresence>

      {/* Content area */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto"
        dir="rtl"
        onClick={handleContentClick}
        style={{ backgroundColor: 'hsl(var(--reader-bg))' }}
      >
        <AnimatePresence>
          {isLoading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-center h-full"
            >
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </motion.div>
          )}

          {error && !isLoading && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-center h-full"
            >
              <p className="text-muted-foreground">{error}</p>
            </motion.div>
          )}

          {pageData && !isLoading && (
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
                  ),
                }}
              />
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile bottom page navigation */}
      <div
        className="sm:hidden shrink-0 border-t border-border/50 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        style={{ backgroundColor: 'hsl(var(--reader-bg))' }}
        dir="ltr"
      >
        <div className="flex items-center justify-between">
          <button
            onClick={goToNextPage}
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
            onClick={goToPrevPage}
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
