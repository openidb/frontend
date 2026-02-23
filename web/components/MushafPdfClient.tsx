"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const TOTAL_PDF_PAGES = 640;

export function MushafPdfClient() {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1); // PDF page (1-indexed)
  const [totalPages, setTotalPages] = useState(TOTAL_PDF_PAGES);
  const [loading, setLoading] = useState(true);
  const [pdfReady, setPdfReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pageInput, setPageInput] = useState("");

  const leftCanvasRef = useRef<HTMLCanvasElement>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const renderIdRef = useRef(0); // prevent stale renders

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Book spread logic:
  // Page 1 (cover) = single page
  // After that, pairs: (2,3), (4,5), ...
  // RTL: right canvas = lower page number, left canvas = higher
  const getSpread = useCallback(
    (page: number): [number, number | null] => {
      if (isMobile) return [page, null];
      if (page === 1) return [1, null];
      const even = page % 2 === 0 ? page : page - 1;
      const right = even;
      const left = even + 1 <= totalPages ? even + 1 : null;
      return [right, left];
    },
    [isMobile, totalPages]
  );

  // Load PDF
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const doc = await pdfjsLib.getDocument({
          url: "/api/quran/mushaf/pdf/stream",
          cMapUrl: "/cmaps/",
          cMapPacked: true,
          enableXfa: false,
          disableAutoFetch: true,
          disableStream: false,
        }).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
        setPdfReady(true);
      } catch {
        // fail silently
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Render pages
  useEffect(() => {
    if (!pdfReady) return;
    const id = ++renderIdRef.current;

    const render = async () => {
      const doc = pdfDocRef.current;
      if (!doc) return;
      setLoading(true);

      const [rightPage, leftPage] = getSpread(currentPage);

      const renderToCanvas = async (
        pageNum: number,
        canvas: HTMLCanvasElement | null
      ) => {
        if (!canvas || id !== renderIdRef.current) return;
        const page = await doc.getPage(pageNum);
        const container = containerRef.current;
        if (!container || id !== renderIdRef.current) return;

        const containerHeight = container.clientHeight - 32;
        const viewport = page.getViewport({ scale: 1 });
        const scale = containerHeight / viewport.height;
        const scaled = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;

        canvas.width = scaled.width * dpr;
        canvas.height = scaled.height * dpr;
        canvas.style.width = `${scaled.width}px`;
        canvas.style.height = `${scaled.height}px`;

        const ctx = canvas.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        await page.render({
          canvas,
          canvasContext: ctx,
          viewport: scaled,
        } as any).promise;
      };

      try {
        if (isMobile) {
          // Single page — use left canvas
          await renderToCanvas(rightPage, leftCanvasRef.current);
          if (rightCanvasRef.current) {
            rightCanvasRef.current.width = 0;
            rightCanvasRef.current.height = 0;
          }
        } else {
          // Two-page spread
          await renderToCanvas(rightPage, rightCanvasRef.current);
          if (leftPage) {
            await renderToCanvas(leftPage, leftCanvasRef.current);
          } else if (leftCanvasRef.current) {
            leftCanvasRef.current.width = 0;
            leftCanvasRef.current.height = 0;
          }
        }
      } catch {
        // render error
      }

      if (id === renderIdRef.current) setLoading(false);
    };

    render();
  }, [currentPage, pdfReady, isMobile, getSpread]);

  // Re-render on resize
  useEffect(() => {
    if (!pdfReady) return;
    const handler = () => {
      renderIdRef.current++;
      setLoading(true);
      // Small delay to let layout settle
      setTimeout(() => {
        if (pdfDocRef.current) {
          // trigger re-render by toggling a dep
          setCurrentPage((p) => p);
        }
      }, 100);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [pdfReady]);

  // Navigation
  const step = isMobile ? 1 : 2;

  const goNext = useCallback(() => {
    setCurrentPage((p) => {
      if (p === 1) return 2; // cover → first spread
      const next = p + step;
      return next <= totalPages ? (next % 2 === 0 ? next : next - 1) : p;
    });
  }, [step, totalPages]);

  const goPrev = useCallback(() => {
    setCurrentPage((p) => {
      if (p <= 1) return 1;
      if (p === 2) return 1; // back to cover
      const prev = p - step;
      return prev >= 2 ? (prev % 2 === 0 ? prev : prev - 1) : 1;
    });
  }, [step]);

  // Keyboard (RTL: left = forward/higher, right = back/lower)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") goNext();
      if (e.key === "ArrowRight") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev]);

  // Swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      touchStartRef.current = null;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
        if (dx < 0) goNext();
        else goPrev();
      }
    },
    [goNext, goPrev]
  );

  const handlePageSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const target = Number(pageInput);
      if (target >= 1 && target <= totalPages) {
        setCurrentPage(isMobile ? target : target <= 1 ? 1 : target % 2 === 0 ? target : target - 1);
        setPageInput("");
      }
    },
    [pageInput, totalPages, isMobile]
  );

  const [rightPage, leftPage] = getSpread(currentPage);
  const displayRange = leftPage ? `${rightPage}-${leftPage}` : String(rightPage);
  const canGoNext = isMobile ? currentPage < totalPages : (currentPage === 1 ? true : currentPage + step <= totalPages);
  const canGoPrev = currentPage > 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-800 select-none">
      {/* Close button */}
      <button
        onClick={() => router.push("/mushaf/1")}
        className="absolute top-3 left-3 z-20 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Main viewer area */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center relative overflow-hidden"
        dir="rtl"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Loading spinner */}
        {(loading || !pdfReady) && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* Left chevron (= next in RTL) */}
        <button
          onClick={goNext}
          disabled={!canGoNext}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white disabled:opacity-0 transition-all"
          aria-label="Next page"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        {/* Right chevron (= prev in RTL) */}
        <button
          onClick={goPrev}
          disabled={!canGoPrev}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white disabled:opacity-0 transition-all"
          aria-label="Previous page"
        >
          <ChevronRight className="h-6 w-6" />
        </button>

        {/* Canvases */}
        <div className="flex items-center justify-center gap-1 h-full py-4">
          {!isMobile && (
            <canvas
              ref={rightCanvasRef}
              className="bg-white shadow-lg"
              style={{
                opacity: loading ? 0.3 : 1,
                transition: "opacity 0.15s",
              }}
            />
          )}
          <canvas
            ref={leftCanvasRef}
            className="bg-white shadow-lg"
            style={{
              opacity: loading ? 0.3 : 1,
              transition: "opacity 0.15s",
            }}
          />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="shrink-0 flex items-center justify-center gap-4 px-4 py-2.5 bg-neutral-900/90 text-white text-sm">
        <form onSubmit={handlePageSubmit} className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={totalPages}
            placeholder={displayRange}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            className="w-16 text-center bg-neutral-700 text-white rounded px-2 py-1 text-sm border-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-1 focus:ring-white/30"
            aria-label="Go to page"
          />
          <span className="text-neutral-400">/ {totalPages}</span>
        </form>
      </div>
    </div>
  );
}
