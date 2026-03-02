"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "@/lib/i18n";

type ContentType = "all" | "quran" | "hadith";

interface ContentTypeSegmentProps {
  includeQuran: boolean;
  includeHadith: boolean;
  onChange: (includeQuran: boolean, includeHadith: boolean) => void;
}

export function ContentTypeSegment({ includeQuran, includeHadith, onChange }: ContentTypeSegmentProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<ContentType, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const active: ContentType | null =
    includeQuran && includeHadith ? "all" :
    includeQuran && !includeHadith ? "quran" :
    !includeQuran && includeHadith ? "hadith" :
    null;

  const measureIndicator = useCallback(() => {
    if (!active || !containerRef.current) {
      setIndicator(null);
      return;
    }
    const btn = buttonRefs.current.get(active);
    if (!btn) return;
    setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [active]);

  useEffect(() => {
    measureIndicator();
  }, [measureIndicator]);

  useEffect(() => {
    const observer = new ResizeObserver(measureIndicator);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [measureIndicator]);

  const handleClick = (type: ContentType) => {
    switch (type) {
      case "all":
        onChange(true, true);
        break;
      case "quran":
        onChange(true, false);
        break;
      case "hadith":
        onChange(false, true);
        break;
    }
  };

  const options: { value: ContentType; label: string }[] = [
    { value: "all", label: t("search.contentTypeAll") },
    { value: "quran", label: t("search.contentTypeQuran") },
    { value: "hadith", label: t("search.contentTypeHadith") },
  ];

  return (
    <div className="px-3 pb-2 pt-0.5">
      <div
        ref={containerRef}
        role="radiogroup"
        aria-label={t("searchConfig.contentTypes")}
        className="relative inline-flex items-center bg-muted/80 p-0.5 rounded-lg"
      >
        {indicator && (
          <motion.div
            className="absolute top-0.5 bottom-0.5 rounded-md bg-brand"
            initial={false}
            animate={{ left: indicator.left, width: indicator.width }}
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
          />
        )}
        {options.map(({ value, label }) => (
          <button
            key={value}
            ref={(el) => { if (el) buttonRefs.current.set(value, el); }}
            role="radio"
            aria-checked={active === value}
            onClick={() => handleClick(value)}
            className={`relative z-10 px-3.5 py-1 text-xs font-medium rounded-md transition-colors duration-150 ${
              active === value
                ? "text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
