"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ePub, { Book, Rendition } from "epubjs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, ChevronLeft, Menu } from "lucide-react";

interface BookMetadata {
  id: string;
  title: string;
  titleLatin: string;
  author: string;
  authorLatin: string;
  datePublished: string;
  filename: string;
}

interface EpubReaderProps {
  bookMetadata: BookMetadata;
}

export function EpubReader({ bookMetadata }: EpubReaderProps) {
  const router = useRouter();
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookRef = useRef<Book | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [currentSection, setCurrentSection] = useState(0);
  const [totalSections, setTotalSections] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [chapters, setChapters] = useState<any[]>([]);
  const [pageInputValue, setPageInputValue] = useState("");
  const [pageList, setPageList] = useState<any[]>([]);
  const [currentPageLabel, setCurrentPageLabel] = useState("");
  const [totalPages, setTotalPages] = useState(0);

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

      console.log("Creating rendition with dimensions:", width, height);

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
        style.textContent = `
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
        `;
        contents.document.head.appendChild(style);
      });

      // Display and wait for it to finish
      renditionInstance.display().then(() => {
        console.log("Initial display complete");
        setIsReady(true);

        // Add RTL support after content is rendered
        renditionInstance.themes.default({
          "body": {
            "direction": "rtl !important",
            "text-align": "right !important",
          },
          "p": {
            "direction": "rtl !important",
            "text-align": "right !important",
          },
        });
      }).catch((err) => {
        console.error("Display error:", err);
      });

      // Listen for layout events to ensure pages are rendered
      renditionInstance.on("rendered", () => {
        console.log("Section rendered");
      });

      renditionInstance.on("relocated", (location: any) => {
        console.log("Relocated to:", location);

        // Update section counter
        if (location.start) {
          // Use the index from the location
          const currentIndex = (location.start.index ?? 0) + 1;
          setCurrentSection(currentIndex);

          // Try to find the current page label from page list
          // The page list has pages with their corresponding CFI locations
          // We need to find which page corresponds to the current location
          if (pageList.length > 0) {
            // For now, use section index to find page
            // This is a simplified approach - ideally we'd compare CFIs
            const pageIndex = Math.min(currentIndex - 1, pageList.length - 1);
            const page = pageList[pageIndex];
            if (page && page.label) {
              setCurrentPageLabel(page.label);
              setPageInputValue(page.label);
            } else {
              setCurrentPageLabel(currentIndex.toString());
              setPageInputValue(currentIndex.toString());
            }
          } else {
            setCurrentPageLabel(currentIndex.toString());
            setPageInputValue(currentIndex.toString());
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
        // EPub.js sometimes includes these in the toc array
        const filteredToc = navigation.toc.filter((item: any) => {
          const label = item.label?.toLowerCase() || '';
          // Filter out "Guide", "Pages", and entries that are just numbers (page numbers)
          return label !== 'guide' &&
                 label !== 'pages' &&
                 label !== 'صفحات' &&
                 !/^\d+$/.test(label);  // Exclude entries that are just numbers
        });

        console.log("Original TOC length:", navigation.toc.length);
        console.log("Filtered TOC length:", filteredToc.length);
        setChapters(filteredToc);

        // Get page list (actual page numbers from the book)
        if (navigation.pageList && navigation.pageList.length > 0) {
          console.log("Page list found:", navigation.pageList);
          setPageList(navigation.pageList);
          setTotalPages(navigation.pageList.length);
        } else {
          console.log("No page list found, using section count");
          setPageList([]);
          setTotalPages(0);
        }
      });

    }).catch((err) => {
      console.error("Book ready error:", err);
    });

    // Handle resize with debouncing
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (renditionRef.current && viewerElement) {
          const newWidth = viewerElement.clientWidth;
          const newHeight = viewerElement.clientHeight;
          console.log("Resizing to:", newWidth, newHeight);
          renditionRef.current.resize(newWidth, newHeight);
        }
      }, 150);
    };

    // Handle keyboard navigation
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!renditionRef.current || !isReady) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        renditionRef.current.next();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        renditionRef.current.prev();
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("keydown", handleKeyPress);

    // Cleanup
    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("keydown", handleKeyPress);

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

  const goBack = () => {
    router.push("/");
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
    console.log("goToNextPage called:", { currentSection, totalSections, isReady });
    if (renditionRef.current && bookRef.current && isReady && currentSection < totalSections) {
      bookRef.current.loaded.spine.then((spine: any) => {
        const section = spine.get(currentSection);
        console.log("Attempting to navigate to section:", currentSection, section);
        if (section && renditionRef.current) {
          console.log("Displaying section href:", section.href);
          renditionRef.current.display(section.href);
        }
      });
    } else {
      console.log("Navigation blocked - conditions not met");
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

  const renderChapters = (items: any[], depth: number = 0): JSX.Element[] => {
    return items.map((item, index) => {
      const hasSubitems = item.subitems && item.subitems.length > 0;

      return (
        <div key={`${depth}-${index}`}>
          <button
            onClick={() => goToChapter(item.href)}
            className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 text-sm transition-colors"
            style={{ paddingRight: `${depth * 12 + 12}px` }}
          >
            {item.label}
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
      const pageIndex = pageList.findIndex((page: any) => page.label === pageInputValue);
      if (pageIndex !== -1) {
        const page = pageList[pageIndex];
        if (page && page.href) {
          renditionRef.current.display(page.href);
        }
      } else {
        // Try parsing as number
        const pageNum = parseInt(pageInputValue, 10);
        if (!isNaN(pageNum)) {
          // Find page with this label
          const foundPage = pageList.find((page: any) => page.label === pageNum.toString());
          if (foundPage && foundPage.href) {
            renditionRef.current.display(foundPage.href);
          } else {
            // Reset to current page if invalid
            setPageInputValue(currentPageLabel || currentSection.toString());
          }
        } else {
          // Reset to current page if invalid
          setPageInputValue(currentPageLabel || currentSection.toString());
        }
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
    <div className="fixed inset-0 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 border-b bg-white px-4 py-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={goBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{bookMetadata.title}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {bookMetadata.titleLatin}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalSections > 0 && (
            <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">Page</span>
              <input
                type="text"
                inputMode="numeric"
                value={pageInputValue}
                onChange={handlePageInputChange}
                onBlur={handlePageInputSubmit}
                className="w-12 text-sm text-muted-foreground text-center bg-transparent border-b border-gray-300 focus:border-gray-500 focus:outline-none"
              />
              <span className="text-sm text-muted-foreground">
                {pageList.length > 0
                  ? `(of ${pageList[pageList.length - 1]?.label || totalSections})`
                  : `of ${totalSections}`}
              </span>
            </form>
          )}
          <div className="flex items-center gap-2 ml-3">
            <Button
              variant="outline"
              onClick={goToNextPage}
              title="Next page"
              className="transition-transform active:scale-95 h-9 w-12"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              onClick={goToPrevPage}
              title="Previous page"
              className="transition-transform active:scale-95 h-9 w-12"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleSidebar}
              title="Chapters"
              className="transition-transform active:scale-95"
            >
              <Menu className="h-5 w-5" />
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
        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
          <p className="text-muted-foreground">Loading book...</p>
        </div>
      )}

      {/* Sidebar */}
      <div
        className={`absolute top-20 right-4 w-72 max-h-[calc(100vh-6rem)] bg-white rounded-lg border shadow-xl z-30 flex flex-col transition-all duration-200 ${
          showSidebar
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="p-3 border-b">
          <h2 className="font-semibold">Chapters</h2>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {chapters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No chapters available</p>
          ) : (
            <div className="space-y-1">
              {renderChapters(chapters)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
