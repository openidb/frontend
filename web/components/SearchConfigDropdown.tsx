"use client";

import { useState, useEffect } from "react";
import { Settings2, Check, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import type { SearchConfig } from "@/lib/config/search-defaults";
import { HADITH_COLLECTIONS } from "@/lib/config/search-defaults";

interface SearchConfigDropdownProps {
  config: SearchConfig;
  onChange: (config: SearchConfig) => void;
}

export function SearchConfigDropdown({ config, onChange }: SearchConfigDropdownProps) {
  const { t, locale } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [collectionsExpanded, setCollectionsExpanded] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateConfig = (updates: Partial<SearchConfig>) => {
    onChange({ ...config, ...updates });
  };

  const items = [
    { key: "includeQuran" as const, label: t("searchConfig.quranVerses") },
    { key: "includeHadith" as const, label: t("searchConfig.hadiths") },
  ];

  const primaryCollections = HADITH_COLLECTIONS.filter(c => c.group === "primary");
  const otherCollections = HADITH_COLLECTIONS.filter(c => c.group === "other");

  const selectedSlugs = new Set(config.hadithCollections);
  const allSelected = config.hadithCollections.length === 0;

  const toggleCollection = (slug: string) => {
    if (allSelected) {
      // Switching from "all" to specific: select all except this one
      const allSlugs = HADITH_COLLECTIONS.map(c => c.slug).filter(s => s !== slug);
      updateConfig({ hadithCollections: allSlugs });
    } else if (selectedSlugs.has(slug)) {
      const updated = config.hadithCollections.filter(s => s !== slug);
      // If removing this makes the list empty, reset to "all"
      updateConfig({ hadithCollections: updated });
    } else {
      const updated = [...config.hadithCollections, slug];
      // If all are now selected, reset to empty (= all)
      if (updated.length === HADITH_COLLECTIONS.length) {
        updateConfig({ hadithCollections: [] });
      } else {
        updateConfig({ hadithCollections: updated });
      }
    }
  };

  const selectAll = () => {
    // Reset to empty = all collections
    updateConfig({ hadithCollections: [] });
  };

  const isCollectionChecked = (slug: string) => allSelected || selectedSlugs.has(slug);

  const getCollectionName = (c: { nameEnglish: string; nameArabic: string }) =>
    locale === "ar" ? c.nameArabic : c.nameEnglish;

  const filterLabel = allSelected
    ? t("searchConfig.allCollections")
    : `${config.hadithCollections.length}/${HADITH_COLLECTIONS.length}`;

  // Render a placeholder button during SSR to avoid hydration mismatch
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        className="h-9 px-3 rounded-lg hover:bg-muted shrink-0 text-muted-foreground text-sm gap-1"
      >
        {t("searchConfig.contentTypes")}
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 px-3 rounded-lg hover:bg-muted shrink-0 text-muted-foreground text-sm gap-1"
          aria-label={t("searchConfig.contentTypes")}
        >
          {t("searchConfig.contentTypes")}
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-[16rem] rounded-xl border bg-popover/95 backdrop-blur-sm text-popover-foreground shadow-lg shadow-black/5 p-1"
        align="end"
      >
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
        >
          <DropdownMenuLabel className="py-1.5 px-2 text-sm font-semibold">
            {t("searchConfig.contentTypes")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {items.map((item) => {
            const isChecked = config[item.key];
            return (
              <div key={item.key}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    updateConfig({ [item.key]: !isChecked });
                  }}
                  className={cn(
                    "relative flex w-full cursor-default select-none items-center rounded-lg py-2 pl-8 pr-3 text-sm outline-none transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                    {isChecked && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 25 }}
                      >
                        <Check className="h-4 w-4" />
                      </motion.div>
                    )}
                  </span>
                  {item.label}
                </button>

                {/* Hadith collection filter sub-section */}
                {item.key === "includeHadith" && config.includeHadith && (
                  <div className="ml-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setCollectionsExpanded(!collectionsExpanded);
                      }}
                      className="flex w-full items-center gap-1.5 rounded-lg py-1.5 px-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", collectionsExpanded && "rotate-180")} />
                      <span>{t("searchConfig.filterCollections")}</span>
                      <span className="ml-auto shrink-0 text-xs opacity-60">{filterLabel}</span>
                    </button>

                    <AnimatePresence>
                      {collectionsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="max-h-[280px] overflow-y-auto py-1 space-y-1">
                            {/* Select All */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                selectAll();
                              }}
                              className={cn(
                                "relative flex w-full items-center rounded-md py-1 pl-6 pr-2 text-xs font-medium transition-colors",
                                allSelected
                                  ? "text-muted-foreground/60 cursor-default"
                                  : "hover:bg-accent hover:text-accent-foreground cursor-pointer",
                              )}
                            >
                              <span className="absolute left-1 flex h-3 w-3 items-center justify-center">
                                {allSelected && <Check className="h-3 w-3" />}
                              </span>
                              {t("searchConfig.allCollections")}
                            </button>

                            <DropdownMenuSeparator className="my-0.5" />

                            {/* Primary collections */}
                            <div className="px-2 pt-0.5 pb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                              {t("searchConfig.primaryCollections")}
                            </div>
                            {primaryCollections.map((col) => (
                              <CollectionCheckbox
                                key={col.slug}
                                name={getCollectionName(col)}
                                checked={isCollectionChecked(col.slug)}
                                onToggle={() => toggleCollection(col.slug)}
                              />
                            ))}

                            <DropdownMenuSeparator className="my-0.5" />

                            {/* Other collections */}
                            <div className="px-2 pt-0.5 pb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                              {t("searchConfig.otherCollections")}
                            </div>
                            {otherCollections.map((col) => (
                              <CollectionCheckbox
                                key={col.slug}
                                name={getCollectionName(col)}
                                checked={isCollectionChecked(col.slug)}
                                onToggle={() => toggleCollection(col.slug)}
                              />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            );
          })}
        </motion.div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CollectionCheckbox({ name, checked, onToggle }: { name: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onToggle();
      }}
      className="relative flex w-full items-center rounded-md py-1.5 pl-7 pr-3 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <span className="absolute left-1.5 flex h-3.5 w-3.5 items-center justify-center">
        {checked && <Check className="h-3.5 w-3.5 text-foreground/80" />}
      </span>
      <span className="truncate">{name}</span>
    </button>
  );
}
