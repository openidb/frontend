"use client";

import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import type { SearchConfig } from "@/lib/config/search-defaults";
import { HADITH_COLLECTIONS } from "@/lib/config/search-defaults";

interface SearchFiltersPanelProps {
  config: SearchConfig;
  onChange: (config: SearchConfig) => void;
}

export function SearchFiltersPanel({ config, onChange }: SearchFiltersPanelProps) {
  const { t, locale } = useTranslation();

  const updateConfig = (updates: Partial<SearchConfig>) => {
    onChange({ ...config, ...updates });
  };

  const primaryCollections = HADITH_COLLECTIONS.filter(c => c.group === "primary");
  const otherCollections = HADITH_COLLECTIONS.filter(c => c.group === "other");

  const selectedSlugs = new Set(config.hadithCollections);
  const allSelected = config.hadithCollections.length === 0;

  const toggleCollection = (slug: string) => {
    if (allSelected) {
      const allSlugs = HADITH_COLLECTIONS.map(c => c.slug).filter(s => s !== slug);
      updateConfig({ hadithCollections: allSlugs });
    } else if (selectedSlugs.has(slug)) {
      const updated = config.hadithCollections.filter(s => s !== slug);
      updateConfig({ hadithCollections: updated });
    } else {
      const updated = [...config.hadithCollections, slug];
      if (updated.length === HADITH_COLLECTIONS.length) {
        updateConfig({ hadithCollections: [] });
      } else {
        updateConfig({ hadithCollections: updated });
      }
    }
  };

  const selectAll = () => {
    updateConfig({ hadithCollections: [] });
  };

  const isCollectionChecked = (slug: string) => allSelected || selectedSlugs.has(slug);

  const getCollectionName = (c: { nameEnglish: string; nameArabic: string }) =>
    locale === "ar" ? c.nameArabic : c.nameEnglish;

  const filterLabel = allSelected
    ? t("searchConfig.allCollections")
    : `${config.hadithCollections.length}/${HADITH_COLLECTIONS.length}`;

  return (
    <div className="space-y-6">
      {/* Content Types */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          {t("searchConfig.contentTypes")}
        </h3>
        <div className="space-y-1">
          <FilterToggle
            label={t("searchConfig.quranVerses")}
            checked={config.includeQuran}
            onToggle={() => updateConfig({ includeQuran: !config.includeQuran })}
          />
          <FilterToggle
            label={t("searchConfig.hadiths")}
            checked={config.includeHadith}
            onToggle={() => updateConfig({ includeHadith: !config.includeHadith })}
          />
        </div>
      </div>

      {/* Hadith Collections — shown when hadiths are included */}
      {config.includeHadith && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">
              {t("searchConfig.filterCollections")}
            </h3>
            <span className="text-xs text-muted-foreground">{filterLabel}</span>
          </div>

          {/* Select All */}
          <div className="mb-2">
            <CollectionCheckbox
              name={t("searchConfig.allCollections")}
              checked={allSelected}
              onToggle={selectAll}
              bold
            />
          </div>

          <div className="border-t border-border/50 pt-2 space-y-3">
            {/* Primary collections */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1.5 px-1">
                {t("searchConfig.primaryCollections")}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5">
                {primaryCollections.map((col) => (
                  <CollectionCheckbox
                    key={col.slug}
                    name={getCollectionName(col)}
                    checked={isCollectionChecked(col.slug)}
                    onToggle={() => toggleCollection(col.slug)}
                  />
                ))}
              </div>
            </div>

            {/* Other collections */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1.5 px-1">
                {t("searchConfig.otherCollections")}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5">
                {otherCollections.map((col) => (
                  <CollectionCheckbox
                    key={col.slug}
                    name={getCollectionName(col)}
                    checked={isCollectionChecked(col.slug)}
                    onToggle={() => toggleCollection(col.slug)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterToggle({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="relative flex w-full items-center rounded-lg py-2.5 pl-9 pr-3 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <span className="absolute left-2.5 flex h-4 w-4 items-center justify-center">
        {checked && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
          >
            <Check className="h-4 w-4" />
          </motion.div>
        )}
      </span>
      {label}
    </button>
  );
}

function CollectionCheckbox({ name, checked, onToggle, bold }: { name: string; checked: boolean; onToggle: () => void; bold?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "relative flex w-full items-center rounded-md py-1.5 pl-7 pr-3 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
        bold && "font-medium"
      )}
    >
      <span className="absolute left-1.5 flex h-3.5 w-3.5 items-center justify-center">
        {checked && <Check className="h-3.5 w-3.5 text-foreground/80" />}
      </span>
      <span className="truncate">{name}</span>
    </button>
  );
}
