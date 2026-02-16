"use client";

import { useState, useEffect } from "react";
import { Globe } from "lucide-react";
import { motion } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation, LOCALES, type Locale } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get current locale info
  const currentLocale = LOCALES.find((l) => l.code === locale) || LOCALES[0];

  // Render placeholder during SSR to avoid hydration mismatch
  if (!mounted) {
    return (
      <button
        className="inline-flex w-full items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium"
        style={{ color: "#31b9c9" }}
      >
        <Globe className="h-4 w-4" />
        <span>English</span>
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex w-full items-center justify-start gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          style={{ color: "#31b9c9" }}
          aria-label={t("language.selector")}
        >
          <Globe className="h-4 w-4" />
          <span>{currentLocale.nativeName}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-48 bg-popover/95 backdrop-blur-sm border border-border rounded-xl shadow-lg shadow-black/5 max-h-80 overflow-y-auto p-1"
        align="start"
      >
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
        >
          {LOCALES.map((loc) => (
            <DropdownMenuItem
              key={loc.code}
              onClick={() => setLocale(loc.code as Locale)}
              className={`cursor-pointer rounded-lg transition-colors duration-150 ${locale === loc.code ? "bg-accent" : ""}`}
            >
              <span className="flex-1">{loc.nativeName}</span>
              {locale === loc.code && (
                <span className="text-primary text-xs">✓</span>
              )}
            </DropdownMenuItem>
          ))}
        </motion.div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Compact version for mobile header
export function LanguageSwitcherCompact() {
  const { locale, setLocale } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground">
        <Globe className="h-4 w-4" />
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center justify-center h-8 w-8 rounded-md transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label="Language">
          <Globe className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-48 bg-popover/95 backdrop-blur-sm border border-border rounded-xl shadow-lg shadow-black/5 max-h-80 overflow-y-auto p-1"
        align="end"
      >
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
        >
          {LOCALES.map((loc) => (
            <DropdownMenuItem
              key={loc.code}
              onClick={() => setLocale(loc.code as Locale)}
              className={`cursor-pointer rounded-lg transition-colors duration-150 ${locale === loc.code ? "bg-accent" : ""}`}
            >
              <span className="flex-1">{loc.nativeName}</span>
              {locale === loc.code && (
                <span className="text-primary text-xs">✓</span>
              )}
            </DropdownMenuItem>
          ))}
        </motion.div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
