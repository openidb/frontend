"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, X, Loader2 } from "lucide-react";

const TOTAL_MUSHAF_PAGES = 604;

export function MushafPdfClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPage = Math.min(Math.max(Number(searchParams.get("page")) || 1, 1), TOTAL_MUSHAF_PAGES);
  const [mushafPage, setMushafPage] = useState(initialPage);
  const [loading, setLoading] = useState(true);
  const [pageInput, setPageInput] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const imageUrl = `/api/quran/mushaf/page-image/${mushafPage}`;

  // Prefetch adjacent pages
  useEffect(() => {
    const prefetch = (p: number) => {
      if (p >= 1 && p <= TOTAL_MUSHAF_PAGES) {
        const img = new Image();
        img.src = `/api/quran/mushaf/page-image/${p}`;
      }
    };
    prefetch(mushafPage + 1);
    prefetch(mushafPage - 1);
  }, [mushafPage]);

  // Navigation
  const goNext = useCallback(() => {
    setMushafPage((p) => (p < TOTAL_MUSHAF_PAGES ? p + 1 : p));
    setLoading(true);
  }, []);

  const goPrev = useCallback(() => {
    setMushafPage((p) => (p > 1 ? p - 1 : p));
    setLoading(true);
  }, []);

  // Keyboard (RTL: left = forward/higher page, right = back/lower page)
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
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
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
    [goNext, goPrev],
  );

  const handlePageSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const target = Number(pageInput);
      if (target >= 1 && target <= TOTAL_MUSHAF_PAGES) {
        setMushafPage(target);
        setLoading(true);
        setPageInput("");
      }
    },
    [pageInput],
  );

  const canGoNext = mushafPage < TOTAL_MUSHAF_PAGES;
  const canGoPrev = mushafPage > 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-800 select-none">
      {/* Close button */}
      <button
        onClick={() => router.back()}
        className="absolute top-3 left-3 z-20 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Main viewer area */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Loading spinner */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <Loader2 className="w-10 h-10 text-white/60 animate-spin" />
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

        {/* Page image */}
        <img
          key={mushafPage}
          src={imageUrl}
          alt={`Mushaf page ${mushafPage}`}
          className="max-h-full max-w-full object-contain shadow-lg transition-opacity duration-150"
          style={{ opacity: loading ? 0.3 : 1 }}
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
          draggable={false}
        />
      </div>

      {/* Bottom bar — shows mushaf page number (1-604) */}
      <div className="shrink-0 flex items-center justify-center gap-4 px-4 py-2.5 bg-neutral-900/90 text-white text-sm">
        <form onSubmit={handlePageSubmit} className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={TOTAL_MUSHAF_PAGES}
            placeholder={String(mushafPage)}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            className="w-16 text-center bg-neutral-700 text-white rounded px-2 py-1 text-sm border-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:outline-none focus:ring-1 focus:ring-white/30"
            aria-label="Go to page"
          />
          <span className="text-neutral-400">/ {TOTAL_MUSHAF_PAGES}</span>
        </form>
      </div>
    </div>
  );
}
