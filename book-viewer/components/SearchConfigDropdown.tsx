"use client";

import { useState, useEffect } from "react";
import { Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

export type RerankerType = "gpt-oss-20b" | "gpt-oss-120b" | "gemini-flash" | "jina" | "qwen4b" | "none";

// Shared type for translation display options
export type TranslationDisplayOption =
  | "none" | "transliteration"
  | "en" | "fr" | "id" | "ur" | "es" | "zh" | "pt" | "ru" | "ja" | "ko" | "it" | "bn";

// Quran translation options (12 languages, matching app UI languages except Arabic)
export const QURAN_TRANSLATIONS: { code: string; edition: string; name: string }[] = [
  { code: "none", edition: "", name: "None" },
  { code: "en", edition: "eng-mustafakhattaba", name: "English - Dr. Mustafa Khattab" },
  { code: "fr", edition: "fra-muhammadhameedu", name: "French - Muhammad Hamidullah" },
  { code: "id", edition: "ind-indonesianislam", name: "Indonesian - Islamic Ministry" },
  { code: "ur", edition: "urd-fatehmuhammadja", name: "Urdu - Fateh Muhammad Jalandhry" },
  { code: "es", edition: "spa-muhammadisagarc", name: "Spanish - Isa Garcia" },
  { code: "zh", edition: "zho-majian", name: "Chinese - Ma Jian" },
  { code: "pt", edition: "por-samirelhayek", name: "Portuguese - Samir El-Hayek" },
  { code: "ru", edition: "rus-elmirkuliev", name: "Russian - Elmir Kuliev" },
  { code: "ja", edition: "jpn-ryoichimita", name: "Japanese - Ryoichi Mita" },
  { code: "ko", edition: "kor-hamidchoi", name: "Korean - Hamid Choi" },
  { code: "it", edition: "ita-hamzarobertopic", name: "Italian - Hamza Roberto Piccardo" },
  { code: "bn", edition: "ben-muhiuddinkhan", name: "Bengali - Muhiuddin Khan" },
];

// Shared options array for book title and TOC display dropdowns
export const TRANSLATION_DISPLAY_OPTIONS: { code: TranslationDisplayOption }[] = [
  { code: "none" },
  { code: "transliteration" },
  { code: "en" }, { code: "fr" }, { code: "id" }, { code: "ur" },
  { code: "es" }, { code: "zh" }, { code: "pt" }, { code: "ru" },
  { code: "ja" }, { code: "ko" }, { code: "it" }, { code: "bn" },
];

export interface SearchConfig {
  includeQuran: boolean;
  includeHadith: boolean;
  includeBooks: boolean;
  reranker: RerankerType;
  similarityCutoff: number;
  preRerankLimit: number;
  postRerankLimit: number;
  fuzzyEnabled: boolean;
  fuzzyThreshold: number;
  // Books display options
  bookTitleDisplay: TranslationDisplayOption;  // Replaces showTransliterations
  showPublicationDates: boolean;
  // Translation settings
  autoTranslation: boolean; // When true, use UI language for translations
  quranTranslation: string; // Language code ("en", "ur", "fr", etc.) or "none"
  hadithTranslation: "none" | "en"; // Hadith translation (English only for now)
}

export const defaultSearchConfig: SearchConfig = {
  includeQuran: true,
  includeHadith: true,
  includeBooks: true,
  reranker: "none",
  similarityCutoff: 0.6,
  preRerankLimit: 70,
  postRerankLimit: 10,
  fuzzyEnabled: true,
  fuzzyThreshold: 0.3,
  // Books display options
  bookTitleDisplay: "transliteration",  // Default maintains current behavior
  showPublicationDates: true,
  // Translation settings - auto uses UI language, quranTranslation is override
  autoTranslation: true,
  quranTranslation: "en",
  hadithTranslation: "en",  // Default to English
};

export const rerankerOptions: { value: RerankerType; label: string; description: string }[] = [
  { value: "none", label: "None", description: "Fast (default)" },
  { value: "gpt-oss-120b", label: "OpenAI/GPT-OSS 120B", description: "Highest quality, slower" },
  { value: "gemini-flash", label: "Gemini Flash", description: "High quality reasoning" },
  { value: "jina", label: "Jina Reranker", description: "Fast neural reranker" },
];

interface SearchConfigDropdownProps {
  config: SearchConfig;
  onChange: (config: SearchConfig) => void;
}

export function SearchConfigDropdown({ config, onChange }: SearchConfigDropdownProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateConfig = (updates: Partial<SearchConfig>) => {
    onChange({ ...config, ...updates });
  };

  // Render a placeholder button during SSR to avoid hydration mismatch
  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="h-10 w-10 md:h-12 md:w-12 border-border hover:bg-muted shrink-0"
      >
        <Settings2 className="h-4 w-4 md:h-5 md:w-5" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 md:h-12 md:w-12 border-border hover:bg-muted shrink-0"
        >
          <Settings2 className="h-4 w-4 md:h-5 md:w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-48 bg-popover border border-border"
        align="end"
      >
        <DropdownMenuLabel>{t("searchConfig.contentTypes")}</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={config.includeQuran}
          onCheckedChange={(checked) => updateConfig({ includeQuran: checked })}
          onSelect={(e) => e.preventDefault()}
          className="hover:bg-accent"
        >
          {t("searchConfig.quranVerses")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={config.includeHadith}
          onCheckedChange={(checked) => updateConfig({ includeHadith: checked })}
          onSelect={(e) => e.preventDefault()}
          className="hover:bg-accent"
        >
          {t("searchConfig.hadiths")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={config.includeBooks}
          onCheckedChange={(checked) => updateConfig({ includeBooks: checked })}
          onSelect={(e) => e.preventDefault()}
          className="hover:bg-accent"
        >
          {t("searchConfig.books")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
