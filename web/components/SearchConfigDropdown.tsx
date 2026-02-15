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
import type { SearchConfig } from "@/lib/config/search-defaults";

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
        variant="ghost"
        size="icon"
        className="group/gear h-10 w-10 md:h-12 md:w-12 rounded-lg hover:bg-muted shrink-0"
      >
        <Settings2 className="h-4 w-4 md:h-5 md:w-5 transition-transform duration-200 group-hover/gear:rotate-90" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="group/gear h-10 w-10 md:h-12 md:w-12 rounded-lg hover:bg-muted shrink-0"
          aria-label={t("searchConfig.contentTypes")}
        >
          <Settings2 className="h-4 w-4 md:h-5 md:w-5 transition-transform duration-200 group-hover/gear:rotate-90" />
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
