"use client";

import { useState, useEffect } from "react";
import { Settings2, Check } from "lucide-react";
import { motion } from "framer-motion";
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

  const items = [
    { key: "includeQuran" as const, label: t("searchConfig.quranVerses") },
    { key: "includeHadith" as const, label: t("searchConfig.hadiths") },
  ];

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
        className="min-w-[12rem] rounded-xl border bg-popover/95 backdrop-blur-sm text-popover-foreground shadow-lg shadow-black/5 p-1"
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
              <button
                key={item.key}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  updateConfig({ [item.key]: !isChecked });
                }}
                className={cn(
                  "relative flex w-full cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm outline-none transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
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
            );
          })}
        </motion.div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
