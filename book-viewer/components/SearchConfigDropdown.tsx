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

export type RerankerType = "gpt-oss" | "gpt-oss-120b" | "qwen4b" | "jina" | "none";

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
  showTransliterations: boolean;
  showPublicationDates: boolean;
}

export const defaultSearchConfig: SearchConfig = {
  includeQuran: true,
  includeHadith: true,
  includeBooks: true,
  reranker: "gpt-oss-120b",
  similarityCutoff: 0.15,
  preRerankLimit: 70,
  postRerankLimit: 10,
  fuzzyEnabled: true,
  fuzzyThreshold: 0.3,
  // Books display options
  showTransliterations: true,
  showPublicationDates: true,
};

export const rerankerOptions: { value: RerankerType; label: string; description: string }[] = [
  { value: "gpt-oss-120b", label: "GPT-OSS 120B", description: "Highest quality (Recommended)" },
  { value: "gpt-oss", label: "GPT-OSS 20B", description: "High quality, faster" },
  { value: "qwen4b", label: "Qwen 4B", description: "Fast, cross-lingual" },
  { value: "jina", label: "Jina", description: "Fastest" },
  { value: "none", label: "None", description: "Skip reranking" },
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
        className="w-64 bg-background border border-border"
        align="end"
      >
        <DropdownMenuLabel>{t("searchConfig.contentTypes")}</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={config.includeQuran}
          onCheckedChange={(checked) => updateConfig({ includeQuran: checked })}
          onSelect={(e) => e.preventDefault()}
        >
          {t("searchConfig.quranVerses")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={config.includeHadith}
          onCheckedChange={(checked) => updateConfig({ includeHadith: checked })}
          onSelect={(e) => e.preventDefault()}
        >
          {t("searchConfig.hadiths")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={config.includeBooks}
          onCheckedChange={(checked) => updateConfig({ includeBooks: checked })}
          onSelect={(e) => e.preventDefault()}
        >
          {t("searchConfig.books")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
