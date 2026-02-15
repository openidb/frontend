"use client";

import { useEffect, useRef, useCallback, useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Copy, Loader2, BookOpen } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { PrefetchLink } from "./PrefetchLink";
import type { LookupResult } from "@/lib/types/dictionary";

interface WordDefinitionPopoverProps {
  word: string;
  /** position.x = horizontal center of word, position.y = top of word rect */
  position: { x: number; y: number; wordBottom: number };
  onClose: () => void;
}

const POPOVER_WIDTH = 320;
const PADDING = 8;
const HEADER_HEIGHT = 56; // reader header bar

export function WordDefinitionPopover({
  word,
  position,
  onClose,
}: WordDefinitionPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState(false);
  const [placed, setPlaced] = useState<{ left: number; top: number } | null>(null);

  // Fetch dictionary definition
  useEffect(() => {
    if (!word) return;

    let cancelled = false;
    setLoading(true);
    setError(false);
    setResult(null);

    fetch(`/api/dictionary/${encodeURIComponent(word)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: LookupResult) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [word]);

  // Measure the popover after every render and position it
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const popH = rect.height;
    const popW = rect.width || POPOVER_WIDTH;

    const gap = 6; // space between word and popover edge
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: center on word, clamp within viewport
    let left = position.x - popW / 2;
    if (left + popW > vw - PADDING) left = vw - popW - PADDING;
    if (left < PADDING) left = PADDING;

    // Vertical: prefer above the word so we don't cover unread text
    const spaceAbove = position.y - HEADER_HEIGHT;
    const spaceBelow = vh - position.wordBottom;

    let top: number;
    if (spaceAbove >= popH + gap) {
      // Enough room above → place above word
      top = position.y - popH - gap;
    } else if (spaceBelow >= popH + gap) {
      // Place below word
      top = position.wordBottom + gap;
    } else {
      // Not enough room either side — place in whichever has more space, clamped
      if (spaceAbove >= spaceBelow) {
        top = Math.max(HEADER_HEIGHT + PADDING, position.y - popH - gap);
      } else {
        top = Math.min(vh - popH - PADDING, position.wordBottom + gap);
      }
    }

    // Final clamp
    if (top < HEADER_HEIGHT + PADDING) top = HEADER_HEIGHT + PADDING;
    if (top + popH > vh - PADDING) top = vh - popH - PADDING;

    setPlaced({ left, top });
  }, [position, loading, result, error]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    // Delay adding listener to prevent immediate close from the click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(word);
    onClose();
  }, [word, onClose]);

  const hasDefinitions = result && result.definitions.length > 0;

  const popoverContent = (
    <div
      ref={popoverRef}
      dir="rtl"
      className="fixed z-50 rounded-lg border bg-popover text-popover-foreground shadow-lg"
      style={{
        width: POPOVER_WIDTH,
        maxHeight: `calc(100vh - ${HEADER_HEIGHT + PADDING * 2}px)`,
        // Before measurement, render invisibly to get real height
        ...(placed
          ? { left: placed.left, top: placed.top, opacity: 1 }
          : { left: position.x - POPOVER_WIDTH / 2, top: -9999, opacity: 0 }),
      }}
    >
      {/* Word display */}
      <div className="px-4 pt-3 pb-2 text-center font-semibold text-lg border-b border-border">
        {word}
      </div>

      {/* Dictionary content */}
      <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && (error || !hasDefinitions) && (
          <div className="px-4 py-4 text-center text-sm text-muted-foreground">
            {t("reader.dictionary.notFound")}
          </div>
        )}

        {!loading && hasDefinitions && (
          <div className="px-3 py-2 space-y-3">
            {result.matchStrategy === "root_resolved" && (
              <p className="text-xs text-muted-foreground text-center">
                {t("reader.dictionary.rootMatch")}
              </p>
            )}
            {result.definitions.map((def) => (
              <div key={`${def.source.id}-${def.id}`} className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {def.source.nameArabic}
                </p>
                {def.headword !== word && (
                  <p className="text-sm font-medium">{def.headword}</p>
                )}
                <p className="text-sm leading-relaxed line-clamp-4">
                  {def.definition}
                </p>
                {def.bookId && def.startPage != null && (
                  <PrefetchLink
                    href={`/reader/${def.bookId}?pn=${def.startPage}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    onClick={onClose}
                  >
                    <BookOpen className="h-3 w-3" />
                    {t("reader.dictionary.viewFull")}
                  </PrefetchLink>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Copy button - fixed at bottom */}
      <div className="border-t border-border">
        <button
          onClick={handleCopy}
          className="flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-sm hover:bg-muted transition-colors rounded-b-lg"
        >
          <Copy className="h-4 w-4" />
          <span>{t("reader.copyWord")}</span>
        </button>
      </div>
    </div>
  );

  return createPortal(popoverContent, document.body);
}
