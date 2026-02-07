"use client";

import { useEffect, useRef, useState, ReactNode, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import ePub, { Book, Rendition } from "epubjs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, ChevronLeft, Menu, Languages, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { defaultSearchConfig, TranslationDisplayOption } from "@/components/SearchConfigDropdown";
import { WordDefinitionPopover } from "@/components/WordDefinitionPopover";

interface TocEntry {
  id: number;
  chapterTitle: string;
  pageNumber: number;
  volumeNumber: number;
  orderIndex: number;
  parentId: number | null;
}

interface BookMetadata {
  id: string;
  title: string;
  titleLatin: string;
  titleTranslated?: string | null;
  author: string;
  authorLatin: string;
  datePublished: string;
  filename: string;
  toc: TocEntry[];
}

interface EpubReaderProps {
  bookMetadata: BookMetadata;
  initialPage?: string;       // Page label (urlPageIndex) - may have duplicates in multi-volume books
  initialPageNumber?: string; // Unique sequential page number - maps to EPUB file name
}

const STORAGE_KEY = "searchConfig";

export function EpubReader({ bookMetadata, initialPage, initialPageNumber }: EpubReaderProps) {
  const router = useRouter();
  const { t, dir, locale } = useTranslation();
  const { resolvedTheme } = useTheme();
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookRef = useRef<Book | null>(null);
  const currentHrefRef = useRef<string>("");  // Track current href to prevent unnecessary updates
  const prefetchedSectionsRef = useRef<Set<number>>(new Set());
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTargetRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef<boolean>(false);
  const longPressFeedbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressFeedbackRef = useRef<HTMLElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [currentSection, setCurrentSection] = useState(0);
  const [totalSections, setTotalSections] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [chapters, setChapters] = useState<any[]>([]);
  const [pageInputValue, setPageInputValue] = useState("");
  const [pageList, setPageList] = useState<any[]>([]);
  const [currentPageLabel, setCurrentPageLabel] = useState("");
  const [totalPages, setTotalPages] = useState(0);
  const [hasNavigatedToInitialPage, setHasNavigatedToInitialPage] = useState(false);
  const [bookTitleDisplay, setBookTitleDisplay] = useState<TranslationDisplayOption>(defaultSearchConfig.bookTitleDisplay);
  const [autoTranslation, setAutoTranslation] = useState(defaultSearchConfig.autoTranslation);
  const [pageTranslationModel, setPageTranslationModel] = useState(defaultSearchConfig.pageTranslationModel);
  const [selectedWord, setSelectedWord] = useState<{
    word: string;
    position: { x: number; y: number };
  } | null>(null);

  // Translation state
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationVisible, setTranslationVisible] = useState(false);
  const translationCacheRef = useRef<Map<string, { index: number; translation: string }[]>>(new Map());

  // Client-side fetched translations
  const [fetchedTitleTranslation, setFetchedTitleTranslation] = useState<string | null>(null);

  // Load display config from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.bookTitleDisplay) {
          setBookTitleDisplay(parsed.bookTitleDisplay);
        }
        if (typeof parsed.autoTranslation === "boolean") {
          setAutoTranslation(parsed.autoTranslation);
        }
        if (parsed.pageTranslationModel) {
          setPageTranslationModel(parsed.pageTranslationModel);
        }
      } catch {
        // Invalid JSON, use defaults
      }
    }
  }, []);

  // Get effective display settings (auto defaults to transliteration)
  const effectiveBookTitleDisplay = useMemo(() => {
    if (autoTranslation) {
      return "transliteration";
    }
    return bookTitleDisplay;
  }, [autoTranslation, bookTitleDisplay]);

  // Fetch translations client-side when language settings change
  useEffect(() => {
    const fetchTranslations = async () => {
      const needsTitleTranslation = effectiveBookTitleDisplay !== "none" && effectiveBookTitleDisplay !== "transliteration";

      if (!needsTitleTranslation) {
        setFetchedTitleTranslation(null);
        return;
      }

      try {
        const response = await fetch(`/api/books/${bookMetadata.id}?lang=${effectiveBookTitleDisplay}`);
        if (response.ok) {
          const data = await response.json();
          const book = data.book;

          if (book?.titleTranslated) {
            setFetchedTitleTranslation(book.titleTranslated);
          } else {
            setFetchedTitleTranslation(null);
          }
        }
      } catch (error) {
        console.error("Failed to fetch translations:", error);
      }
    };

    fetchTranslations();
  }, [bookMetadata.id, effectiveBookTitleDisplay]);

  // Helper to get secondary book title
  const getSecondaryTitle = (): string | null => {
    if (effectiveBookTitleDisplay === "none") {
      return null;
    }
    if (effectiveBookTitleDisplay === "transliteration") {
      return bookMetadata.titleLatin;
    }
    // For language translations, use fetched translation, prop, or fall back to titleLatin
    return fetchedTitleTranslation || bookMetadata.titleTranslated || bookMetadata.titleLatin;
  };

  useEffect(() => {
    const viewerElement = viewerRef.current;
    if (!viewerElement) return;

    const bookPath = `/books/${bookMetadata.filename}`;
    const bookInstance = ePub(bookPath);
    bookRef.current = bookInstance;

    // Wait for book to be ready
    bookInstance.ready.then(() => {
      if (!viewerElement) return;

      // Force layout calculation
      const width = viewerElement.clientWidth;
      const height = viewerElement.clientHeight;


      const renditionInstance = bookInstance.renderTo(viewerElement, {
        width: width,
        height: height,
        spread: "none",
        flow: "scrolled-doc",
        allowScriptedContent: true,
      });

      renditionRef.current = renditionInstance;

      // Inject normalization CSS with diacritics support
      renditionInstance.hooks.content.register((contents: any) => {
        const style = contents.document.createElement("style");

        // Base styles for all books
        const cssContent = `
          * {
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          html, body {
            height: auto !important;
            overflow-x: hidden !important;
            max-width: 100% !important;
          }
          body {
            overflow: visible !important;
            margin: 0 !important;
            padding: 20px !important;
            font-family: "Amiri", "Scheherazade New", "Traditional Arabic", "Arabic Typesetting", "Geeza Pro", sans-serif !important;
            line-height: 2.0 !important;
            font-feature-settings: "liga" 1, "calt" 1 !important;
            -webkit-font-smoothing: antialiased !important;
            -moz-osx-font-smoothing: grayscale !important;
          }
          section {
            display: block !important;
          }
          img, svg {
            max-width: 100% !important;
            height: auto !important;
          }
          p {
            line-height: 2.0 !important;
            letter-spacing: 0.01em !important;
            margin: 0.8em 0 !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
          }

          /* Long-press feedback animation */
          @keyframes long-press-pulse {
            0% {
              transform: translate(-50%, -50%) scale(0.5);
              opacity: 0.6;
            }
            100% {
              transform: translate(-50%, -50%) scale(1.5);
              opacity: 0;
            }
          }

          .long-press-feedback {
            position: fixed;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            pointer-events: none;
            z-index: 9999;
            background: radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, rgba(59, 130, 246, 0) 70%);
            animation: long-press-pulse 0.4s ease-out infinite;
          }
        `;

        style.textContent = cssContent;
        contents.document.head.appendChild(style);

        // Add a spacer div at the bottom for scroll padding
        const spacer = contents.document.createElement("div");
        spacer.style.cssText = "height: 100px; width: 100%; background: transparent;";
        contents.document.body.appendChild(spacer);

        // Long-press handler for word definitions
        const LONG_PRESS_DURATION = 300; // ms

        const showWordDefinition = (clientX: number, clientY: number) => {
          // Get the iframe element to calculate offset
          const iframe = viewerElement?.querySelector("iframe");
          if (!iframe) return;

          const iframeRect = iframe.getBoundingClientRect();
          const contentWindow = contents.window;

          // Get element at point
          const target = contents.document.elementFromPoint(clientX, clientY) as Node;
          if (!target) return;

          // Only proceed if pointing at text content
          if (target.nodeType !== Node.TEXT_NODE &&
              !(target as Element).closest?.('p, span, div, h1, h2, h3, h4, h5, h6, li, a')) {
            return;
          }

          // Get selection at point
          const selection = contentWindow.getSelection();
          if (!selection) return;

          // Clear any existing selection first
          selection.removeAllRanges();

          // Create a range at the position
          const range = contents.document.caretRangeFromPoint(clientX, clientY);
          if (!range) return;

          // Expand selection to word boundaries
          selection.addRange(range);
          selection.modify("move", "backward", "word");
          selection.modify("extend", "forward", "word");

          const word = selection.toString().trim();

          // Check if we got a valid word (Arabic characters)
          // Arabic Unicode range: \u0600-\u06FF (basic Arabic)
          // Extended ranges: \u0750-\u077F, \u08A0-\u08FF, \uFB50-\uFDFF, \uFE70-\uFEFF
          const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/;
          if (!word || !arabicRegex.test(word)) {
            selection.removeAllRanges();
            return;
          }

          // Get the actual word's bounding rect for positioning
          const wordRange = selection.getRangeAt(0);
          const wordRect = wordRange.getBoundingClientRect();

          // Check if the point was actually near the word (within ~10px tolerance)
          // This prevents triggering on empty space that snaps to distant words
          const tolerance = 10;
          const pointNearWord =
            clientX >= wordRect.left - tolerance &&
            clientX <= wordRect.right + tolerance &&
            clientY >= wordRect.top - tolerance &&
            clientY <= wordRect.bottom + tolerance;

          if (!pointNearWord) {
            selection.removeAllRanges();
            return;
          }

          // Clean up selection
          selection.removeAllRanges();

          // Position popover centered below the word
          const x = wordRect.left + wordRect.width / 2 + iframeRect.left;
          const y = wordRect.bottom + iframeRect.top + 8; // 8px gap below word

          setSelectedWord({
            word,
            position: { x, y },
          });
        };

        const removeFeedback = () => {
          if (longPressFeedbackTimerRef.current) {
            clearTimeout(longPressFeedbackTimerRef.current);
            longPressFeedbackTimerRef.current = null;
          }
          if (longPressFeedbackRef.current) {
            longPressFeedbackRef.current.remove();
            longPressFeedbackRef.current = null;
          }
        };

        const handlePointerDown = (e: MouseEvent | TouchEvent) => {
          // Clear any existing popover and feedback
          setSelectedWord(null);
          removeFeedback();

          const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
          const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

          longPressTargetRef.current = { x: clientX, y: clientY };

          // Show visual feedback after a short delay (150ms)
          longPressFeedbackTimerRef.current = setTimeout(() => {
            const feedback = contents.document.createElement("div");
            feedback.className = "long-press-feedback";
            feedback.style.left = `${clientX}px`;
            feedback.style.top = `${clientY}px`;
            contents.document.body.appendChild(feedback);
            longPressFeedbackRef.current = feedback;
          }, 150);

          longPressTimerRef.current = setTimeout(() => {
            removeFeedback(); // Remove feedback when showing popover
            if (longPressTargetRef.current) {
              showWordDefinition(longPressTargetRef.current.x, longPressTargetRef.current.y);
              longPressTriggeredRef.current = true; // Mark that long-press was triggered
            }
            longPressTargetRef.current = null;
          }, LONG_PRESS_DURATION);
        };

        const handlePointerUp = () => {
          removeFeedback();
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          longPressTargetRef.current = null;
        };

        const handlePointerMove = (e: MouseEvent | TouchEvent) => {
          if (!longPressTargetRef.current) return;

          const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
          const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

          // Cancel if moved more than 10px (prevents accidental triggers while scrolling)
          const dx = clientX - longPressTargetRef.current.x;
          const dy = clientY - longPressTargetRef.current.y;
          if (Math.sqrt(dx * dx + dy * dy) > 10) {
            handlePointerUp();
          }
        };

        // Prevent click from firing after a successful long-press
        const handleClick = (e: MouseEvent) => {
          if (longPressTriggeredRef.current) {
            e.preventDefault();
            e.stopPropagation();
            longPressTriggeredRef.current = false;
          }
        };

        // Register event listeners for long-press detection
        contents.document.addEventListener("mousedown", handlePointerDown);
        contents.document.addEventListener("mouseup", handlePointerUp);
        contents.document.addEventListener("mouseleave", handlePointerUp);
        contents.document.addEventListener("mousemove", handlePointerMove);
        contents.document.addEventListener("touchstart", handlePointerDown);
        contents.document.addEventListener("touchend", handlePointerUp);
        contents.document.addEventListener("touchmove", handlePointerMove);
        contents.document.addEventListener("touchcancel", handlePointerUp);
        contents.document.addEventListener("click", handleClick, true); // Use capture to intercept before link navigation
      });

      // Register light and dark themes
      renditionInstance.themes.register("light", {
        "body": {
          "direction": "rtl !important",
          "text-align": "right !important",
          "background-color": "#fdfcfa !important",
          "color": "#0a0a0a !important",
        },
        "p": {
          "direction": "rtl !important",
          "text-align": "right !important",
          "color": "#0a0a0a !important",
        },
        "span": {
          "color": "#0a0a0a !important",
        },
        "div": {
          "color": "#0a0a0a !important",
        },
      });

      renditionInstance.themes.register("dark", {
        "body": {
          "direction": "rtl !important",
          "text-align": "right !important",
          "background-color": "#191a1a !important",
          "color": "#fafaf9 !important",
        },
        "p": {
          "direction": "rtl !important",
          "text-align": "right !important",
          "color": "#fafaf9 !important",
        },
        "span": {
          "color": "#fafaf9 !important",
        },
        "div": {
          "color": "#fafaf9 !important",
        },
      });

      // Display and wait for it to finish
      renditionInstance.display().then(() => {
        setIsReady(true);
      }).catch((err) => {
        console.error("Display error:", err);
      });

      renditionInstance.on("relocated", (location: any) => {

        // Update section counter
        if (location.start) {
          // Use the index from the location
          const currentIndex = (location.start.index ?? 0) + 1;
          setCurrentSection(currentIndex);

          // Extract the href from the current location
          const currentHref = location.start.href;

          // Only update page number if we've actually moved to a different file
          if (currentHref !== currentHrefRef.current) {
            currentHrefRef.current = currentHref;

            // Extract just the filename for matching (handles path differences)
            const currentFilename = currentHref.split('/').pop() || currentHref;

            // Update URL with page number (for bookmarking/refresh persistence)
            // This is outside pageList check since we extract page number directly from href
            const pageMatch = currentFilename.match(/page_(\d+)\.xhtml/);
            if (pageMatch) {
              const pageNum = parseInt(pageMatch[1], 10);
              const url = new URL(window.location.href);
              url.searchParams.set("pn", pageNum.toString());
              // Remove legacy 'page' param if present
              url.searchParams.delete("page");
              window.history.replaceState({}, "", url.toString());
            }

            // Try to find the current page label from page list
            // Match by href to get the correct printed page number
            if (pageList.length > 0) {
              // Find the page in the page list that matches this href
              const foundPage = pageList.find((page: any) => {
                const pageFilename = page.href.split('/').pop() || page.href;
                return pageFilename === currentFilename;
              });

              if (foundPage && foundPage.label) {
                setCurrentPageLabel(foundPage.label);
                setPageInputValue(foundPage.label);
              } else {
                // Fallback: No matching page in page-list (e.g., page 0 overview)
                setCurrentPageLabel("i");  // Roman numeral for overview/intro pages
                setPageInputValue("i");
              }
            } else {
              // No page list loaded yet, use "i" for first page, otherwise section index
              if (currentIndex === 1) {
                setCurrentPageLabel("i");
                setPageInputValue("i");
              } else {
                setCurrentPageLabel(currentIndex.toString());
                setPageInputValue(currentIndex.toString());
              }
            }
          }
        }
      });

      // Get total sections from the book
      bookInstance.loaded.spine.then((spine: any) => {
        setTotalSections(spine.length);
      });

      // Get table of contents
      bookInstance.loaded.navigation.then((navigation: any) => {
        // Filter out page-list and guide entries from TOC
        const filteredToc = navigation.toc.filter((item: any) => {
          const label = item.label?.toLowerCase() || '';
          return label !== 'guide' &&
                 label !== 'pages' &&
                 label !== 'صفحات' &&
                 !/^\d+$/.test(label);
        });
        setChapters(filteredToc);

        // EPub.js doesn't automatically parse page-list nav elements
        parsePageList(bookInstance);
      });

      // Manually parse page-list from nav.xhtml
      async function parsePageList(book: Book) {
        try {
          const navPath = 'EPUB/nav.xhtml';
          const response = await fetch(`/books/${bookMetadata.filename}`);
          if (!response.ok) return;

          const blob = await response.blob();
          const JSZip = (await import('jszip')).default;
          const zip = await JSZip.loadAsync(blob);

          const navFile = zip.file(navPath);
          if (!navFile) {
            // Try alternative paths
            const altPaths = ['nav.xhtml', 'OEBPS/nav.xhtml', 'OPS/nav.xhtml'];
            for (const altPath of altPaths) {
              const altFile = zip.file(altPath);
              if (altFile) {
                const navContent = await altFile.async('text');
                parseNavContent(navContent);
                return;
              }
            }
            return;
          }

          const navContent = await navFile.async('text');
          parseNavContent(navContent);

        } catch (error) {
          console.error("Error parsing page-list:", error);
          setPageList([]);
          setTotalPages(0);
        }
      }

      function parseNavContent(navContent: string) {
        const parser = new DOMParser();
        const navDoc = parser.parseFromString(navContent, 'application/xhtml+xml');

        // Find page-list nav element with multiple selectors for namespace handling
        const pageListNav = navDoc.querySelector('nav#page-list') ||
                            navDoc.querySelector('nav[id="page-list"]') ||
                            navDoc.querySelector('nav[epub\\:type="page-list"]') ||
                            navDoc.querySelector('nav[*|type="page-list"]');

        if (pageListNav) {
          const pageLinks = pageListNav.querySelectorAll('a');
          const pages = Array.from(pageLinks).map(link => ({
            label: link.textContent || '',
            href: link.getAttribute('href') || ''
          }));
          setPageList(pages);
          setTotalPages(pages.length);
        } else {
          setPageList([]);
          setTotalPages(0);
        }
      }

    }).catch((err) => {
      console.error("Book ready error:", err);
    });

    // Handle resize with debouncing
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (renditionRef.current && viewerElement) {
          renditionRef.current.resize(viewerElement.clientWidth, viewerElement.clientHeight);
        }
      }, 150);
    };

    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResize);

      // Clean up long-press state
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (longPressFeedbackTimerRef.current) {
        clearTimeout(longPressFeedbackTimerRef.current);
        longPressFeedbackTimerRef.current = null;
      }
      if (longPressFeedbackRef.current) {
        longPressFeedbackRef.current.remove();
        longPressFeedbackRef.current = null;
      }
      longPressTargetRef.current = null;
      longPressTriggeredRef.current = false;

      if (renditionRef.current) {
        renditionRef.current.destroy();
        renditionRef.current = null;
      }

      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
      }
    };
  }, []); // Empty deps - only initialize once

  // Prefetch next sections for smoother navigation
  const prefetchNextSections = useCallback(async (currentIndex: number, count = 3) => {
    if (!bookRef.current) return;

    try {
      const spine: any = await bookRef.current.loaded.spine;
      for (let i = 1; i <= count; i++) {
        const targetIndex = currentIndex + i;
        if (targetIndex >= spine.length || prefetchedSectionsRef.current.has(targetIndex)) continue;

        const section = spine.get(targetIndex);
        if (section) {
          await section.load(bookRef.current.load.bind(bookRef.current));
          prefetchedSectionsRef.current.add(targetIndex);
        }
      }
    } catch (error) {
      console.debug("Prefetch failed:", error);
    }
  }, []);

  // Trigger prefetch after navigation
  useEffect(() => {
    if (isReady && currentSection > 0) {
      const prefetch = () => prefetchNextSections(currentSection - 1, 3);
      if ("requestIdleCallback" in window) {
        (window as any).requestIdleCallback(prefetch, { timeout: 2000 });
      } else {
        setTimeout(prefetch, 100);
      }
    }
  }, [currentSection, isReady, prefetchNextSections]);

  // Clear prefetch cache on book change
  useEffect(() => {
    prefetchedSectionsRef.current.clear();
  }, [bookMetadata.filename]);

  // Handle keyboard navigation - language-aware
  // In RTL languages (Arabic, Urdu): ArrowLeft = next, ArrowRight = prev
  // In LTR languages: ArrowLeft = prev, ArrowRight = next
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!renditionRef.current || !isReady) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (dir === "rtl") {
          renditionRef.current.next();
        } else {
          renditionRef.current.prev();
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (dir === "rtl") {
          renditionRef.current.prev();
        } else {
          renditionRef.current.next();
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [dir, isReady]);

  // Apply theme to EPUB reader when theme changes
  useEffect(() => {
    if (renditionRef.current && isReady) {
      renditionRef.current.themes.select(resolvedTheme);
    }
  }, [resolvedTheme, isReady]);

  // Update page number when pageList becomes available
  useEffect(() => {
    if (pageList.length > 0 && renditionRef.current && currentSection > 0) {
      const location = renditionRef.current.currentLocation() as any;
      if (location && location.start) {
        const currentHref = location.start.href;
        const currentFilename = currentHref.split('/').pop() || currentHref;

        const foundPage = pageList.find((page: any) => {
          const pageFilename = page.href.split('/').pop() || page.href;
          return pageFilename === currentFilename;
        });

        if (foundPage && foundPage.label) {
          setCurrentPageLabel(foundPage.label);
          setPageInputValue(foundPage.label);
        } else {
          setCurrentPageLabel("i");
          setPageInputValue("i");
        }
      }
    }
  }, [pageList, currentSection]);

  // Navigate to initial page from URL query parameter
  // Priority: initialPageNumber (unique) > initialPage (label, may have duplicates)
  useEffect(() => {
    if (hasNavigatedToInitialPage || !renditionRef.current || !isReady) {
      return;
    }

    // If initialPageNumber is provided, construct the href directly
    // This is the preferred method as it's unambiguous (no duplicates)
    if (initialPageNumber) {
      const pageNum = parseInt(initialPageNumber, 10);
      if (!isNaN(pageNum)) {
        // EPUB files are named like page_0967.xhtml (zero-padded to 4 digits)
        const paddedNum = pageNum.toString().padStart(4, '0');
        const directHref = `page_${paddedNum}.xhtml`;
        renditionRef.current.display(directHref);
        setHasNavigatedToInitialPage(true);
        return;
      }
    }

    // Fall back to label-based navigation if initialPage is provided
    // Note: This may open the wrong page in multi-volume books with duplicate labels
    if (initialPage && pageList.length > 0) {
      // Try multiple matching strategies:
      // 1. Exact match
      // 2. Strip leading zeros (e.g., "0057" -> "57")
      // 3. Parse as number and match (e.g., "57" matches "57")
      let foundPage = pageList.find((page: any) => page.label === initialPage);

      if (!foundPage) {
        // Try stripping leading zeros from initialPage
        const strippedPage = initialPage.replace(/^0+/, '') || '0';
        foundPage = pageList.find((page: any) => page.label === strippedPage);
      }

      if (!foundPage) {
        // Try parsing as number
        const pageNum = parseInt(initialPage, 10);
        if (!isNaN(pageNum)) {
          foundPage = pageList.find((page: any) => page.label === pageNum.toString());
        }
      }

      // Handle "i" for first page
      if (!foundPage && initialPage.toLowerCase() === 'i') {
        foundPage = pageList.find((page: any) => page.label === 'i');
      }

      if (foundPage && foundPage.href) {
        renditionRef.current.display(foundPage.href);
      }
      setHasNavigatedToInitialPage(true);
    }
  }, [initialPage, initialPageNumber, pageList, isReady, hasNavigatedToInitialPage]);

  // Get translation target language from interface language
  const getTranslationLanguage = useCallback(() => {
    // Use interface language if it's a supported translation language
    const supportedLangs = ["en", "fr", "id", "ur", "es", "zh", "pt", "ru", "ja", "ko", "it", "bn"];
    if (supportedLangs.includes(locale)) {
      return locale;
    }
    return "en";
  }, [locale]);

  // Remove translation elements from the iframe
  const removeTranslations = useCallback(() => {
    const iframe = viewerRef.current?.querySelector("iframe");
    if (!iframe?.contentDocument) return;

    const translationElements = iframe.contentDocument.querySelectorAll(".paragraph-translation");
    translationElements.forEach((el) => el.remove());
  }, []);

  // Inject translations into the iframe DOM
  const injectTranslations = useCallback((translations: { index: number; translation: string }[]) => {
    const iframe = viewerRef.current?.querySelector("iframe");
    if (!iframe?.contentDocument) return;

    const paragraphs = iframe.contentDocument.querySelectorAll("p");

    // Determine text direction for translation (Urdu is RTL, others are LTR)
    const translationLang = getTranslationLanguage();
    const isTranslationRtl = translationLang === "ur";

    translations.forEach(({ index, translation }) => {
      const paragraph = paragraphs[index];
      if (!paragraph || !translation) return;

      // Create translation element
      const translationDiv = iframe.contentDocument!.createElement("div");
      translationDiv.className = "paragraph-translation";
      translationDiv.textContent = translation;
      translationDiv.style.cssText = `
        font-size: 0.9em;
        opacity: 0.75;
        margin-top: 4px;
        margin-bottom: 16px;
        padding-${isTranslationRtl ? "right" : "left"}: 8px;
        border-${isTranslationRtl ? "right" : "left"}: 2px solid currentColor;
        direction: ${isTranslationRtl ? "rtl" : "ltr"};
        text-align: ${isTranslationRtl ? "right" : "left"};
      `;

      // Insert after the paragraph
      paragraph.parentNode?.insertBefore(translationDiv, paragraph.nextSibling);
    });
  }, [getTranslationLanguage]);

  // Handle translate button click
  const handleTranslate = useCallback(async () => {
    // Toggle off if already showing
    if (translationVisible) {
      removeTranslations();
      setTranslationVisible(false);
      return;
    }

    // Get current page number from href
    const currentHref = currentHrefRef.current;
    if (!currentHref) return;

    // Extract page number from href (e.g., "page_0057.xhtml" -> 57)
    const pageMatch = currentHref.match(/page_(\d+)\.xhtml/);
    if (!pageMatch) return;

    const pageNum = parseInt(pageMatch[1], 10);
    const lang = getTranslationLanguage();
    const cacheKey = `${bookMetadata.id}-${pageNum}-${lang}`;

    // Check cache first
    const cached = translationCacheRef.current.get(cacheKey);
    if (cached) {
      injectTranslations(cached);
      setTranslationVisible(true);
      return;
    }

    // Fetch translations from API
    setIsTranslating(true);
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
      const response = await fetch(`/api/pages/${bookMetadata.id}/${pageNum}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ lang, model: pageTranslationModel }),
      });

      if (!response.ok) {
        throw new Error("Translation failed");
      }

      const data = await response.json();
      const translations = data.paragraphs || [];

      // Cache the result
      translationCacheRef.current.set(cacheKey, translations);

      // Inject translations
      injectTranslations(translations);
      setTranslationVisible(true);
    } catch (error) {
      console.error("Translation error:", error);
    } finally {
      setIsTranslating(false);
    }
  }, [translationVisible, bookMetadata.id, getTranslationLanguage, injectTranslations, removeTranslations, pageTranslationModel]);

  // Clear translations when navigating to a different page
  useEffect(() => {
    if (translationVisible) {
      removeTranslations();
      setTranslationVisible(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSection]);

  const goBack = () => {
    router.back();
  };

  const goToPrevPage = () => {
    if (renditionRef.current && bookRef.current && isReady && currentSection > 1) {
      bookRef.current.loaded.spine.then((spine: any) => {
        const section = spine.get(currentSection - 2);
        if (section && renditionRef.current) {
          renditionRef.current.display(section.href);
        }
      });
    }
  };

  const goToNextPage = () => {
    if (renditionRef.current && bookRef.current && isReady && currentSection < totalSections) {
      bookRef.current.loaded.spine.then((spine: any) => {
        const section = spine.get(currentSection);
        if (section && renditionRef.current) {
          renditionRef.current.display(section.href);
        }
      });
    }
  };

  const goToChapter = (href: string) => {
    if (renditionRef.current) {
      renditionRef.current.display(href);
      setShowSidebar(false);
    }
  };

  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };

  // Navigate to a page by page number
  const goToPage = (pageNumber: number) => {
    if (renditionRef.current && bookRef.current) {
      // EPUB files are named like page_0001.xhtml (zero-padded to 4 digits)
      const paddedNum = pageNumber.toString().padStart(4, '0');
      const href = `page_${paddedNum}.xhtml`;
      renditionRef.current.display(href);
      setShowSidebar(false);
    }
  };

  // Render database TOC entries (flat structure with parentId for hierarchy)
  const renderDatabaseToc = (entries: TocEntry[]): ReactNode[] => {
    // Build a hierarchy from flat entries
    const topLevel = entries.filter(e => e.parentId === null);
    const childMap = new Map<number, TocEntry[]>();

    entries.forEach(entry => {
      if (entry.parentId !== null) {
        const children = childMap.get(entry.parentId) || [];
        children.push(entry);
        childMap.set(entry.parentId, children);
      }
    });

    const renderEntry = (entry: TocEntry, depth: number = 0): ReactNode => {
      const children = childMap.get(entry.id) || [];
      // Bullet markers for different depth levels
      const bullets = ["●", "○", "▪", "◦", "▸"];
      const bullet = depth > 0 ? bullets[Math.min(depth - 1, bullets.length - 1)] : "";

      return (
        <div key={entry.id}>
          <button
            onClick={() => goToPage(entry.pageNumber)}
            className="w-full px-3 py-2 rounded-md hover:bg-muted text-sm transition-colors flex items-center gap-2"
            style={{ paddingInlineStart: `${depth * 16 + 12}px` }}
          >
            {bullet && <span className="text-muted-foreground text-xs">{bullet}</span>}
            <span>{entry.chapterTitle}</span>
          </button>
          {children.length > 0 && (
            <div>
              {children.map(child => renderEntry(child, depth + 1))}
            </div>
          )}
        </div>
      );
    };

    return topLevel.map(entry => renderEntry(entry));
  };

  const renderChapters = (items: any[], depth: number = 0): ReactNode[] => {
    // Bullet markers for different depth levels
    const bullets = ["●", "○", "▪", "◦", "▸"];
    const bullet = depth > 0 ? bullets[Math.min(depth - 1, bullets.length - 1)] : "";

    return items.map((item, index) => {
      const hasSubitems = item.subitems && item.subitems.length > 0;

      return (
        <div key={`${depth}-${index}`}>
          <button
            onClick={() => goToChapter(item.href)}
            className="w-full px-3 py-2 rounded-md hover:bg-muted text-sm transition-colors flex items-center gap-2"
            style={{ paddingInlineStart: `${depth * 16 + 12}px` }}
          >
            {bullet && <span className="text-muted-foreground text-xs">{bullet}</span>}
            <span>{item.label}</span>
          </button>
          {hasSubitems && (
            <div>
              {renderChapters(item.subitems, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInputValue(e.target.value);
  };

  const handlePageInputSubmit = (e: React.FormEvent | React.FocusEvent) => {
    e.preventDefault();

    if (!renditionRef.current || !bookRef.current) return;

    // If we have a page list, try to find the page by label
    if (pageList.length > 0) {
      // Try multiple matching strategies:
      // 1. Exact match
      let foundPage = pageList.find((page: any) => page.label === pageInputValue);

      // 2. Strip leading zeros
      if (!foundPage) {
        const strippedPage = pageInputValue.replace(/^0+/, '') || '0';
        foundPage = pageList.find((page: any) => page.label === strippedPage);
      }

      // 3. Parse as number
      if (!foundPage) {
        const pageNum = parseInt(pageInputValue, 10);
        if (!isNaN(pageNum)) {
          foundPage = pageList.find((page: any) => page.label === pageNum.toString());
        }
      }

      // 4. Handle "i" for first page
      if (!foundPage && pageInputValue.toLowerCase() === 'i') {
        foundPage = pageList.find((page: any) => page.label === 'i');
      }

      if (foundPage && foundPage.href) {
        renditionRef.current.display(foundPage.href);
      } else {
        // Reset to current page if invalid
        setPageInputValue(currentPageLabel || currentSection.toString());
      }
    } else {
      // Fallback to section-based navigation
      const pageNum = parseInt(pageInputValue, 10);
      if (pageNum >= 1 && pageNum <= totalSections) {
        bookRef.current.loaded.spine.then((spine: any) => {
          const section = spine.get(pageNum - 1);
          if (section && renditionRef.current) {
            renditionRef.current.display(section.href);
          }
        });
      } else {
        // Reset to current page if invalid
        setPageInputValue(currentSection.toString());
      }
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 md:gap-3 border-b bg-background px-2 md:px-4 py-2 md:py-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0">
          <ArrowLeft className="h-5 w-5 rtl:scale-x-[-1]" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-sm md:text-base">{bookMetadata.title}</h1>
          {getSecondaryTitle() && (
            <p className="truncate text-xs md:text-sm text-muted-foreground hidden sm:block">
              {getSecondaryTitle()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          {totalSections > 0 && (
            <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1">
              <span className="text-xs md:text-sm text-muted-foreground hidden sm:inline">{t("reader.page")}</span>
              <input
                type="text"
                inputMode="numeric"
                value={pageInputValue}
                onChange={handlePageInputChange}
                onBlur={handlePageInputSubmit}
                className="w-10 md:w-12 text-xs md:text-sm text-muted-foreground text-center bg-transparent border-b border-border focus:border-primary focus:outline-none"
              />
              <span className="text-xs md:text-sm text-muted-foreground hidden md:inline">
                {pageList.length > 0
                  ? `(${t("reader.of")} ${pageList[pageList.length - 1]?.label || totalSections})`
                  : `${t("reader.of")} ${totalSections}`}
              </span>
            </form>
          )}
          <div className="flex items-center gap-1 md:gap-2 ml-1 md:ml-3" dir="ltr">
            <Button
              variant="outline"
              onClick={goToNextPage}
              title={t("reader.nextPage")}
              className="transition-transform active:scale-95 h-8 px-2 md:h-9 md:px-3"
            >
              <ChevronLeft className="h-4 w-4 md:h-5 md:w-5" />
              <span className="text-xs md:text-sm">{t("reader.next")}</span>
            </Button>
            <Button
              variant="outline"
              onClick={goToPrevPage}
              title={t("reader.prevPage")}
              className="transition-transform active:scale-95 h-8 px-2 md:h-9 md:px-3"
            >
              <span className="text-xs md:text-sm">{t("reader.prev")}</span>
              <ChevronRight className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleTranslate}
              disabled={isTranslating}
              title={translationVisible ? t("reader.hideTranslation") : t("reader.translate")}
              className={`transition-transform active:scale-95 h-8 w-8 md:h-9 md:w-9 ${translationVisible ? "bg-primary/10" : ""}`}
            >
              {isTranslating ? (
                <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" />
              ) : (
                <Languages className="h-4 w-4 md:h-5 md:w-5" />
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleSidebar}
              title={t("reader.chapters")}
              className="transition-transform active:scale-95 h-8 w-8 md:h-9 md:w-9"
            >
              <Menu className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* EPUB Viewer */}
      <div
        ref={viewerRef}
        className="flex-1 min-h-0 relative"
        style={{
          position: "relative"
        }}
      />

      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
          <p className="text-muted-foreground">{t("reader.loadingBook")}</p>
        </div>
      )}

      {/* Sidebar */}
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
          {/* Prefer database TOC over EPUB navigation */}
          {bookMetadata.toc && bookMetadata.toc.length > 0 ? (
            <div className="space-y-1">
              {renderDatabaseToc(bookMetadata.toc)}
            </div>
          ) : chapters.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("reader.noChapters")}
            </p>
          ) : (
            <div className="space-y-1">
              {renderChapters(chapters)}
            </div>
          )}
        </div>
      </div>

      {/* Word Definition Popover */}
      {selectedWord && (
        <WordDefinitionPopover
          word={selectedWord.word}
          position={selectedWord.position}
          onClose={() => setSelectedWord(null)}
        />
      )}
    </div>
  );
}
