"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, ChevronLeft, Loader2, Menu, FileText } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

interface BookMetadata {
  id: string;
  title: string;
  titleLatin: string;
  titleTranslated?: string | null;
  author: string;
  authorLatin: string;
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
  toc?: TocEntry[];
}

/**
 * Format Turath HTML content for display.
 * Turath content is mostly plain text with newlines and occasional
 * <span data-type="title"> tags for headings. Footnotes appear after
 * a "___" separator line with markers like (^١).
 */
function formatContentHtml(html: string): string {
  const lines = html.split(/\n/);
  const formatted: string[] = [];
  let inFootnotes = false;

  for (const line of lines) {
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
        '<div style="margin-top:2em;padding-top:1.5em;border-top:1px solid currentColor;opacity:0.65">' +
        '<p style="font-weight:bold;font-size:0.95em;margin-bottom:0.8em">الهوامش</p>'
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
      // Title spans → styled headings (no border)
      // Pull any content before or after the span into the heading
      const styled = withMarkers
        .replace(
          /^(.*?)<span\s+data-type=['"]title['"][^>]*(?:id=['"][^'"]*['"])?\s*>/gi,
          '<h3 style="font-size:1.3em;font-weight:bold;margin:1.2em 0 0.6em;color:inherit">$1'
        )
        .replace(/<\/span>(.*)$/i, '$1</h3>');
      formatted.push(styled);
    } else {
      formatted.push(`<p style="margin:0.4em 0">${withMarkers}</p>`);
    }
  }

  // Close footnotes div if opened
  if (inFootnotes) {
    formatted.push('</div>');
  }

  return formatted.join('\n');
}

export function HtmlReader({ bookMetadata, initialPageNumber, totalPages, toc = [] }: HtmlReaderProps) {
  const router = useRouter();
  const { t, dir } = useTranslation();
  const { resolvedTheme } = useTheme();
  const contentRef = useRef<HTMLDivElement>(null);
  const [showSidebar, setShowSidebar] = useState(false);

  const [currentPage, setCurrentPage] = useState<number>(
    initialPageNumber ? parseInt(initialPageNumber, 10) : 0
  );
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageInputValue, setPageInputValue] = useState(
    initialPageNumber || "0"
  );

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
    setPageInputValue(
      pageData?.urlPageIndex || pageData?.printedPageNumber?.toString() || currentPage.toString()
    );
  }, [currentPage, pageData]);

  // Scroll to top on page change
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [pageData]);

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

  // Handle clicks on [data-page] links in content (e.g. TOC entries on overview page)
  const handleContentClick = useCallback((e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest("[data-page]") as HTMLElement | null;
    if (target) {
      e.preventDefault();
      const page = parseInt(target.dataset.page || "", 10);
      if (!isNaN(page) && page >= 0 && page < totalPages) {
        setCurrentPage(page);
      }
    }
  }, [totalPages]);

  const handlePageInputSubmit = (e: React.FormEvent | React.FocusEvent) => {
    e.preventDefault();
    const num = parseInt(pageInputValue, 10);
    if (!isNaN(num) && num >= 0 && num < totalPages) {
      setCurrentPage(num);
    } else {
      // Reset to current
      setPageInputValue(
        pageData?.printedPageNumber?.toString() || currentPage.toString()
      );
    }
  };

  const [pdfLoading, setPdfLoading] = useState(false);

  const handleOpenPdf = useCallback(async () => {
    if (!pageData?.pdfUrl || pdfLoading) return;
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/books/${bookMetadata.id}/pages/${currentPage}/pdf`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank", "noopener");
      }
    } catch {
      // Silent failure — button just stops loading
    } finally {
      setPdfLoading(false);
    }
  }, [bookMetadata.id, currentPage, pageData?.pdfUrl, pdfLoading]);

  const isDark = resolvedTheme === "dark";

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 md:gap-3 border-b bg-background px-2 md:px-4 py-2 md:py-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0">
          <ArrowLeft className="h-5 w-5 rtl:scale-x-[-1]" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-sm md:text-base">
            {bookMetadata.title}
          </h1>
          <p className="truncate text-xs md:text-sm text-muted-foreground hidden sm:block">
            {bookMetadata.titleLatin}
          </p>
        </div>
        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          {/* Page info */}
          {pageData && (
            <span className="text-xs text-muted-foreground hidden md:inline">
              {pageData.volumeNumber > 1 && `vol. ${pageData.volumeNumber} · `}
              {pageData.printedPageNumber != null && `p. ${pageData.printedPageNumber}`}
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
              {t("reader.of")} {totalPages}
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
            {pageData?.pdfUrl && (
              <Button
                variant="outline"
                size="icon"
                onClick={handleOpenPdf}
                disabled={pdfLoading}
                title={t("reader.pdf")}
                className="transition-transform active:scale-95 h-8 w-8 md:h-9 md:w-9"
              >
                {pdfLoading
                  ? <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" />
                  : <FileText className="h-4 w-4 md:h-5 md:w-5" />}
              </Button>
            )}
            {toc.length > 0 && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowSidebar(!showSidebar)}
                title={t("reader.chapters")}
                className="transition-transform active:scale-95 h-8 w-8 md:h-9 md:w-9"
              >
                <Menu className="h-4 w-4 md:h-5 md:w-5" />
              </Button>
            )}
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

      {/* Chapters sidebar */}
      <div
        dir="rtl"
        className={`absolute top-14 md:top-20 right-2 md:right-4 w-[calc(100vw-1rem)] sm:w-72 max-h-[calc(100vh-4rem)] md:max-h-[calc(100vh-6rem)] bg-background rounded-lg border shadow-xl z-30 flex flex-col transition-all duration-200 ${
          showSidebar
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="p-3 border-b">
          <h2 className="font-semibold">{t("reader.chapters")}</h2>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {toc.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("reader.noChapters")}
            </p>
          ) : (
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
          )}
        </div>
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
                '"Amiri", "Scheherazade New", "Traditional Arabic", "Arabic Typesetting", "Geeza Pro", sans-serif',
              lineHeight: 2.0,
              fontSize: "1.1rem",
              color: isDark ? "#fafaf9" : "#0a0a0a",
            }}
            dangerouslySetInnerHTML={{ __html: formatContentHtml(pageData.contentHtml) }}
          />
        )}
      </div>
    </div>
  );
}
