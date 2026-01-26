"use client";

import { useState, useEffect } from "react";
import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
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
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 px-3 py-2 text-sm font-medium"
        style={{ color: "#31b9c9" }}
      >
        <Globe className="h-4 w-4" />
        <span>English</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 px-3 py-2 text-sm font-medium hover:bg-muted"
          style={{ color: "#31b9c9" }}
        >
          <Globe className="h-4 w-4" />
          <span>{currentLocale.nativeName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-48 bg-background border border-border max-h-80 overflow-y-auto"
        align="start"
      >
        {LOCALES.map((loc) => (
          <DropdownMenuItem
            key={loc.code}
            onClick={() => setLocale(loc.code as Locale)}
            className={`cursor-pointer ${locale === loc.code ? "bg-muted" : ""}`}
          >
            <span className="flex-1">{loc.nativeName}</span>
            {locale === loc.code && (
              <span className="text-primary">✓</span>
            )}
          </DropdownMenuItem>
        ))}
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
      <Button variant="ghost" size="icon" className="h-8 w-8">
        <Globe className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Globe className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-48 bg-background border border-border max-h-80 overflow-y-auto"
        align="end"
      >
        {LOCALES.map((loc) => (
          <DropdownMenuItem
            key={loc.code}
            onClick={() => setLocale(loc.code as Locale)}
            className={`cursor-pointer ${locale === loc.code ? "bg-muted" : ""}`}
          >
            <span className="flex-1">{loc.nativeName}</span>
            {locale === loc.code && (
              <span className="text-primary">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
