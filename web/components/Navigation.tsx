"use client";

import { PrefetchLink } from "./PrefetchLink";
import { BookOpen, Users, Search, Settings2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { LanguageSwitcher, LanguageSwitcherCompact } from "./LanguageSwitcher";

export function DesktopNavigation() {
  const { t } = useTranslation();

  return (
    <aside className="hidden md:flex w-48 border-e bg-background p-4 shrink-0 flex-col">
      {/* Logo */}
      <PrefetchLink href="/search" className="block mb-4 ps-9">
        <span
          className="text-4xl text-brand"
          style={{ fontFamily: "'Aref Ruqaa', serif" }}
        >
          سَبِيل
        </span>
      </PrefetchLink>

      <nav className="space-y-2 flex-1">
        <PrefetchLink
          href="/search"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <Search className="h-4 w-4" />
          {t("nav.search")}
        </PrefetchLink>
        <PrefetchLink
          href="/"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <BookOpen className="h-4 w-4" />
          {t("nav.books")}
        </PrefetchLink>
        <PrefetchLink
          href="/authors"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <Users className="h-4 w-4" />
          {t("nav.authors")}
        </PrefetchLink>
        <PrefetchLink
          href="/config"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <Settings2 className="h-4 w-4" />
          {t("nav.config")}
        </PrefetchLink>
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
      <PrefetchLink
        href="/search"
        className="flex flex-col items-center justify-center gap-1 py-2 px-4 text-muted-foreground hover:text-foreground"
      >
        <Search className="h-5 w-5" />
        <span className="text-xs">{t("nav.search")}</span>
      </PrefetchLink>
      <PrefetchLink
        href="/"
        className="flex flex-col items-center justify-center gap-1 py-2 px-4 text-muted-foreground hover:text-foreground"
      >
        <BookOpen className="h-5 w-5" />
        <span className="text-xs">{t("nav.books")}</span>
      </PrefetchLink>
      <PrefetchLink
        href="/authors"
        className="flex flex-col items-center justify-center gap-1 py-2 px-4 text-muted-foreground hover:text-foreground"
      >
        <Users className="h-5 w-5" />
        <span className="text-xs">{t("nav.authors")}</span>
      </PrefetchLink>
      <PrefetchLink
        href="/config"
        className="flex flex-col items-center justify-center gap-1 py-2 px-4 text-muted-foreground hover:text-foreground"
      >
        <Settings2 className="h-5 w-5" />
        <span className="text-xs">{t("nav.config")}</span>
      </PrefetchLink>
    </nav>
  );
}
