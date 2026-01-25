"use client";

import Link from "next/link";
import { BookOpen, Users, Search, Settings2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { LanguageSwitcher, LanguageSwitcherCompact } from "./LanguageSwitcher";

export function DesktopNavigation() {
  const { t } = useTranslation();

  return (
    <aside className="hidden md:flex w-48 border-e bg-background p-4 shrink-0 flex-col">
      {/* Logo */}
      <Link href="/search" className="flex items-center gap-2 mt-2 mb-6 px-2">
        <svg className="h-8 w-8" viewBox="0 0 144 144" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="144" height="144" rx="26" fill="#336F5A"/>
          <path d="M44 54 Q58 44 72 50 Q86 44 100 54 V98 Q86 90 72 96 Q58 90 44 98 Z" fill="none" stroke="#FFFFFF" strokeWidth="10" strokeLinejoin="round" strokeLinecap="round"/>
          <path d="M72 50 V96" fill="none" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round"/>
        </svg>
        <span className="text-xl font-bold">Sanad</span>
      </Link>

      <nav className="space-y-2 flex-1">
        <Link
          href="/search"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <Search className="h-4 w-4" />
          {t("nav.search")}
        </Link>
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <BookOpen className="h-4 w-4" />
          {t("nav.books")}
        </Link>
        <Link
          href="/authors"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <Users className="h-4 w-4" />
          {t("nav.authors")}
        </Link>
        <Link
          href="/config"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <Settings2 className="h-4 w-4" />
          {t("nav.config")}
        </Link>
      </nav>

      {/* Language Switcher at bottom */}
      <div className="pt-4 border-t">
        <LanguageSwitcher />
      </div>
    </aside>
  );
}

export function MobileNavigation() {
  const { t } = useTranslation();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t flex justify-around items-center h-16 z-50">
      <Link
        href="/search"
        className="flex flex-col items-center justify-center gap-1 py-2 px-4 text-muted-foreground hover:text-foreground"
      >
        <Search className="h-5 w-5" />
        <span className="text-xs">{t("nav.search")}</span>
      </Link>
      <Link
        href="/"
        className="flex flex-col items-center justify-center gap-1 py-2 px-4 text-muted-foreground hover:text-foreground"
      >
        <BookOpen className="h-5 w-5" />
        <span className="text-xs">{t("nav.books")}</span>
      </Link>
      <Link
        href="/authors"
        className="flex flex-col items-center justify-center gap-1 py-2 px-4 text-muted-foreground hover:text-foreground"
      >
        <Users className="h-5 w-5" />
        <span className="text-xs">{t("nav.authors")}</span>
      </Link>
      <Link
        href="/config"
        className="flex flex-col items-center justify-center gap-1 py-2 px-4 text-muted-foreground hover:text-foreground"
      >
        <Settings2 className="h-5 w-5" />
        <span className="text-xs">{t("nav.config")}</span>
      </Link>
    </nav>
  );
}
