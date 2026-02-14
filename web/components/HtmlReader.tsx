"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, ChevronLeft, Loader2, EllipsisVertical, FileText, User, Minus, Plus, Languages } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useAppConfig } from "@/lib/config";
import { WordDefinitionPopover } from "./WordDefinitionPopover";
import { trackBookEvent } from "@/lib/analytics";

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

interface HtmlReaderProps {
  bookMetadata: BookMetadata;
  initialPageNumber?: string;
  totalPages: number;
  maxPrintedPage: number;
  toc?: TocEntry[];
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
  translations?: { index: number; translation: string }[],
  translationStyle?: string,
): string {
  // Build translation lookup by line index
  const tlMap = translations ? new Map(translations.map(t => [t.index, t.translation])) : undefined;

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
  let lineIndex = 0;

  for (const line of lines) {
    const currentLineIndex = lineIndex;
    lineIndex++;

    const trimmed = line.trim();
    if (!trimmed) continue;

    // Section separator: * * * * *
    if (/^[\s*]+$/.test(trimmed) && trimmed.includes('*')) {
      formatted.push(
        '<p style="text-align:center;margin:1.2em 0;letter-spacing:0.5em;opacity:0.5">* * * * *</p>'
      );
      continue;
    }

    // Detect footnote separator (line of underscores)
    if (/^_{3,}$/.test(trimmed)) {
      inFootnotes = true;
      formatted.push(
        '<div style="margin-top:2em;padding-top:1.5em;border-top:1px solid currentColor;opacity:0.65">'
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
          '<h3 style="font-size:1.3em;font-weight:bold;margin:1.2em 0 0.6em;color:inherit">$1'
        )
        .replace(/<\/span>(.*)$/i, (_, after) => {
          const rest = after.trim();
          return rest
            ? `</h3>\n<p style="margin:0.4em 0">${rest}</p>`
            : '</h3>';
        });
      formatted.push(styled);
    } else {
      formatted.push(`<p style="margin:0.4em 0">${withMarkers}</p>`);
    }

    // Insert translation placeholder after the corresponding line
    if (tlMap?.has(currentLineIndex)) {
      formatted.push(`%%TL_${currentLineIndex}%%`);
    }
  }

  // Close footnotes div if opened
  if (inFootnotes) {
    formatted.push('</div>');
  }

  let result = formatted.join('\n');
  if (enableWordWrap) result = wrapWords(result);

  // Replace translation placeholders with actual HTML (after wrapWords to avoid wrapping translation text)
  if (tlMap && translationStyle) {
    result = result.replace(/%%TL_(\d+)%%/g, (_, idx) => {
      const text = tlMap.get(parseInt(idx));
      return text
        ? `<p dir="auto" style="${translationStyle}">${text}</p>`
        : '';
    });
  }

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

export function HtmlReader({ bookMetadata, initialPageNumber, totalPages, maxPrintedPage, toc = [] }: HtmlReaderProps) {
  const router = useRouter();
  const { t, dir, locale } = useTranslation();
  const { resolvedTheme } = useTheme();
  const { config } = useAppConfig();
  const contentRef = useRef<HTMLDivElement>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [fontSize, setFontSize] = useState(1.1);
  const [wordTapEnabled, setWordTapEnabled] = useState(true);

  const [currentPage, setCurrentPage] = useState<number>(
    initialPageNumber ? parseInt(initialPageNumber, 10) : 0
  );
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageInputValue, setPageInputValue] = useState(
    initialPageNumber || "0"
  );
  const [selectedWord, setSelectedWord] = useState<{ word: string; x: number; y: number; wordBottom: number } | null>(null);
  const [translation, setTranslation] = useState<{ index: number; translation: string }[] | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const translationCacheRef = useRef<Map<number, { index: number; translation: string }[]>>(new Map());

  // Analytics: page view duration tracking
  const pageViewStartRef = useRef<number>(Date.now());
  const currentPageRef = useRef<number>(currentPage);

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

  // Page cache
  const cacheRef = useRef<Map<number, PageData>>(new Map());

  const fetchPage = useCallback(async (pageNumber: number) => {
    // Check cache
    const cached = cacheRef.current.get(pageNumber);
    if (cached) {
      setPageData(cached);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/books/${bookMetadata.id}/pages/${pageNumber}`);
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
      cacheRef.current.set(pageNumber, page);
      setPageData(page);
    } catch {
      setError("Failed to load page");
      setPageData(null);
    } finally {
      setIsLoading(false);
    }
  }, [bookMetadata.id]);

  // Prefetch adjacent pages
  const prefetchPage = useCallback(async (pageNumber: number) => {
    if (pageNumber < 0 || pageNumber >= totalPages || cacheRef.current.has(pageNumber)) return;
    try {
      const res = await fetch(`/api/books/${bookMetadata.id}/pages/${pageNumber}`);
      if (res.ok) {
        const data = await res.json();
        cacheRef.current.set(pageNumber, data.page);
      }
    } catch {
      // Silent prefetch failure
    }
  }, [bookMetadata.id, totalPages]);

  // Fetch current page
  useEffect(() => {
    fetchPage(currentPage);
  }, [currentPage, fetchPage]);

  // Prefetch next/prev after loading current
  useEffect(() => {
    if (!isLoading && pageData) {
      prefetchPage(currentPage + 1);
      prefetchPage(currentPage - 1);
    }
  }, [isLoading, pageData, currentPage, prefetchPage]);

  // Update URL when page changes
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("pn", currentPage.toString());
    window.history.replaceState({}, "", url.toString());
    setPageInputValue(displayPageNumber(pageData, currentPage));
  }, [currentPage, pageData]);

  // Scroll to top on page change
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [pageData]);

  // Close word popover and reset translation on page change
  useEffect(() => {
    setSelectedWord(null);
    setTranslation(null);
  }, [currentPage]);

  // Keyboard navigation
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
  });

  const goToPrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage((p) => p - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage((p) => p + 1);
    }
  };

  const goBack = () => {
    router.back();
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

  const [pdfLoading, setPdfLoading] = useState(false);

  const handleOpenPdf = useCallback(async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/books/${bookMetadata.id}/pages/${currentPage}/pdf`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank", "noopener");
        trackBookEvent(bookMetadata.id, "pdf_open", currentPage);
      }
    } catch {
      // Silent failure — button just stops loading
    } finally {
      setPdfLoading(false);
    }
  }, [bookMetadata.id, currentPage, pdfLoading]);

  // Auto-translate effect: fetches translation when toggle is on, with 1s debounce
  useEffect(() => {
    if (!autoTranslate || !pageData) return;

    const page = currentPage;

    // Check cache first
    const cached = translationCacheRef.current.get(page);
    if (cached) {
      setTranslation(cached);
      return;
    }

    let cancelled = false;
    setIsTranslating(true);

    const timer = setTimeout(async () => {
      try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
        const lang = locale === "ar" ? "en" : locale;
        const res = await fetch(`/api/pages/${bookMetadata.id}/${page}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
          body: JSON.stringify({ lang, model: config.pageTranslationModel }),
        });
        if (!res.ok) throw new Error("Translation failed");
        const data = await res.json();
        if (!data.paragraphs || data.paragraphs.length === 0) {
          throw new Error("No translatable content");
        }
        // Always cache, even if user navigated away
        translationCacheRef.current.set(page, data.paragraphs);
        if (!cancelled) {
          setTranslation(data.paragraphs);
        }
      } catch {
        if (!cancelled) {
          setTranslation(null);
        }
      } finally {
        if (!cancelled) {
          setIsTranslating(false);
        }
      }
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setIsTranslating(false);
    };
  }, [currentPage, autoTranslate, pageData, locale, bookMetadata.id, config.pageTranslationModel]);

  const isDark = resolvedTheme === "dark";

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Word hover styles (injected because content uses dangerouslySetInnerHTML) */}
      {wordTapEnabled && <style>{`.word { cursor: pointer; border-radius: 2px; } .word:hover { background-color: rgba(128, 128, 128, 0.15); }`}</style>}
      {/* Header */}
      <div className="flex items-center gap-2 md:gap-3 border-b bg-background px-2 md:px-4 py-2 md:py-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0">
          <ArrowLeft className="h-5 w-5 rtl:scale-x-[-1]" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-sm md:text-base">
            {expandHonorifics(bookMetadata.title)}
          </h1>
          <p className="truncate text-xs md:text-sm text-muted-foreground hidden sm:block">
            {bookMetadata.titleLatin}
          </p>
        </div>
        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          {isTranslating && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full animate-in fade-in">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="hidden sm:inline">{t("reader.translate")}…</span>
            </span>
          )}
          {pageData && pageData.volumeNumber > 1 && (
            <span className="text-xs md:text-sm text-muted-foreground hidden sm:inline">
              {t("reader.volume")} {pageData.volumeNumber}
            </span>
          )}

          <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1">
            <span className="text-xs md:text-sm text-muted-foreground hidden sm:inline">
              {t("reader.page")}
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={pageInputValue}
              onChange={(e) => setPageInputValue(e.target.value)}
              onBlur={handlePageInputSubmit}
              className="w-10 md:w-12 text-xs md:text-sm text-muted-foreground text-center bg-transparent border-b border-border focus:border-primary focus:outline-none"
            />
            <span className="text-xs md:text-sm text-muted-foreground hidden md:inline">
              {t("reader.of")} {maxPrintedPage}
            </span>
          </form>

          <div className="flex items-center gap-1 md:gap-2 ml-1 md:ml-3" dir="ltr">
            <Button
              variant="outline"
              onClick={goToNextPage}
              disabled={currentPage >= totalPages - 1}
              title={t("reader.nextPage")}
              className="transition-transform active:scale-95 h-8 px-2 md:h-9 md:px-3"
            >
              <ChevronLeft className="h-4 w-4 md:h-5 md:w-5" />
              <span className="text-xs md:text-sm">{t("reader.next")}</span>
            </Button>
            <Button
              variant="outline"
              onClick={goToPrevPage}
              disabled={currentPage <= 0}
              title={t("reader.prevPage")}
              className="transition-transform active:scale-95 h-8 px-2 md:h-9 md:px-3"
            >
              <span className="text-xs md:text-sm">{t("reader.prev")}</span>
              <ChevronRight className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowSidebar(!showSidebar)}
              title={t("reader.chapters")}
              className="transition-transform active:scale-95 h-8 w-8 md:h-9 md:w-9"
            >
              <EllipsisVertical className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Sidebar overlay */}
      {showSidebar && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Options panel */}
      <div
        dir="rtl"
        className={`absolute top-14 md:top-20 right-2 md:right-4 w-[calc(100vw-1rem)] sm:w-72 max-h-[calc(100vh-4rem)] md:max-h-[calc(100vh-6rem)] bg-background rounded-lg border shadow-xl z-30 flex flex-col transition-all duration-200 ${
          showSidebar
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Links section */}
        <div className="p-3 space-y-1">
          <Link
            href={`/authors/${bookMetadata.authorId}`}
            className="w-full px-3 py-2 rounded-md hover:bg-muted text-sm transition-colors flex items-center gap-2"
            onClick={() => setShowSidebar(false)}
          >
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{t("reader.author")}: {expandHonorifics(bookMetadata.author)}</span>
          </Link>
          {pageData?.pdfUrl ? (
            <button
              onClick={() => {
                handleOpenPdf();
                setShowSidebar(false);
              }}
              disabled={pdfLoading}
              className="w-full px-3 py-2 rounded-md hover:bg-muted text-sm transition-colors flex items-center gap-2"
            >
              {pdfLoading
                ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span>{t("reader.openPdf")}</span>
            </button>
          ) : (
            <div className="w-full px-3 py-2 text-sm flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4 shrink-0" />
              <span>{t("reader.pdfNotAvailable")}</span>
            </div>
          )}

          {/* Font size */}
          <div className="w-full px-3 py-2 text-sm flex items-center justify-between">
            <span>{t("reader.fontSize")}</span>
            <div className="flex items-center gap-2" dir="ltr">
              <button
                onClick={() => setFontSize((s) => Math.max(0.8, +(s - 0.1).toFixed(1)))}
                className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-muted transition-colors"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-10 text-center text-muted-foreground">{Math.round(fontSize * 100)}%</span>
              <button
                onClick={() => setFontSize((s) => Math.min(2.0, +(s + 0.1).toFixed(1)))}
                className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-muted transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Word tap toggle */}
          <button
            onClick={() => {
              setWordTapEnabled((v) => !v);
              setSelectedWord(null);
            }}
            className="w-full px-3 py-2 text-sm flex items-center justify-between hover:bg-muted rounded-md transition-colors"
          >
            <span>{t("reader.wordTap")}</span>
            <div
              className={`w-9 h-5 rounded-full transition-colors relative ${wordTapEnabled ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"}`}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white dark:bg-gray-900 shadow-sm transition-all ${wordTapEnabled ? "right-0.5" : "right-[calc(100%-1.125rem)]"}`}
              />
            </div>
          </button>

          {/* Auto-translate toggle */}
          <button
            onClick={() => setAutoTranslate((v) => !v)}
            className="w-full px-3 py-2 text-sm flex items-center justify-between hover:bg-muted rounded-md transition-colors"
          >
            <span className="flex items-center gap-2">
              {isTranslating
                ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                : <Languages className="h-4 w-4 shrink-0 text-muted-foreground" />}
              {t("reader.translate")}
            </span>
            <div
              className={`w-9 h-5 rounded-full transition-colors relative ${autoTranslate ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"}`}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white dark:bg-gray-900 shadow-sm transition-all ${autoTranslate ? "right-0.5" : "right-[calc(100%-1.125rem)]"}`}
              />
            </div>
          </button>
        </div>

        {/* Table of Contents section */}
        {toc.length > 0 && (
          <>
            <div className="px-3 pb-1">
              <div className="border-t" />
              <h2 className="font-semibold text-sm mt-2">{t("reader.chapters")}</h2>
            </div>

            <div className="flex-1 overflow-auto p-3 pt-0">
              <div className="space-y-1">
                {toc.map((entry, index) => {
                  const depth = entry.level;
                  const bullets = ["●", "○", "▪", "◦", "▸"];
                  const bullet = depth > 0 ? bullets[Math.min(depth - 1, bullets.length - 1)] : "";

                  return (
                    <button
                      key={index}
                      onClick={() => {
                        setCurrentPage(entry.page);
                        setShowSidebar(false);
                      }}
                      className="w-full px-3 py-2 rounded-md hover:bg-muted text-sm transition-colors flex items-center gap-2"
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
      </div>

      {/* Content area */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto"
        dir="rtl"
        onClick={handleContentClick}
      >
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && !isLoading && (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">{error}</p>
          </div>
        )}

        {pageData && !isLoading && (
          <div
            className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-10"
            style={{
              fontFamily:
                '"Naskh", "Amiri", "Scheherazade New", "Traditional Arabic", "Arabic Typesetting", "Geeza Pro", sans-serif',
              lineHeight: 2.0,
              fontSize: `${fontSize}rem`,
              color: isDark ? "#fafaf9" : "#0a0a0a",
            }}
            dangerouslySetInnerHTML={{
              __html: formatContentHtml(
                pageData.contentHtml,
                wordTapEnabled,
                autoTranslate && translation && translation.length > 0 ? translation : undefined,
                `font-family:system-ui,-apple-system,sans-serif;font-size:${fontSize * 0.85}rem;color:${isDark ? "#b0b0b0" : "#555"};line-height:1.7;margin:0.2em 0 0.8em;border-inline-start:3px solid ${isDark ? "#444" : "#ddd"};padding-inline-start:0.75em`,
              ),
            }}
          />
        )}
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
