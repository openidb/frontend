"use client";

import Link from "next/link";
import { BookOpen, Users, Search, Settings2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { LanguageSwitcher, LanguageSwitcherCompact } from "./LanguageSwitcher";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/search", icon: Search, labelKey: "nav.search" as const, iconClass: "nav-icon-search" },
  { href: "/", icon: BookOpen, labelKey: "nav.books" as const, iconClass: "nav-icon-books" },
  { href: "/authors", icon: Users, labelKey: "nav.authors" as const, iconClass: "nav-icon-authors" },
  { href: "/config", icon: Settings2, labelKey: "nav.config" as const, iconClass: "nav-icon-config" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function DesktopNavigation() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Clear pending state when navigation completes
  useEffect(() => { setPendingHref(null); }, [pathname]);

  // Prefetch all nav pages on mount
  useEffect(() => {
    navItems.forEach(({ href }) => router.prefetch(href));
  }, [router]);

  const activeHref = pendingHref ?? pathname;

  const handleNav = useCallback((e: React.MouseEvent, href: string) => {
    e.preventDefault();
    if (href === pathname) return;
    setPendingHref(href);
    router.push(href);
  }, [pathname, router]);

  return (
    <aside className="hidden md:flex w-48 border-e bg-background p-4 shrink-0 flex-col">
      {/* Logo */}
      <Link href="/search" dir="ltr" className="flex items-center justify-center gap-2 mb-4">
        <span
          className="text-[2.5rem] font-bold leading-none"
          style={{ fontFamily: "var(--font-montserrat), sans-serif", color: "#37C1C4" }}
        >
          OI
        </span>
        <div
          className="flex flex-col text-[0.6rem] font-semibold uppercase leading-[1.35] tracking-wide text-muted-foreground"
          style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
        >
          <span>Open</span>
          <span>Islamic</span>
          <span>Database</span>
        </div>
      </Link>

      <nav className="space-y-2 flex-1">
        {navItems.map(({ href, icon: Icon, labelKey, iconClass }) => {
          const active = isActive(activeHref, href);
          return (
            <a
              key={href}
              href={href}
              onClick={(e) => handleNav(e, href)}
              className={cn(
                "nav-link relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-muted touch-action-manipulation",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {active && (
                <span className="absolute inset-0 bg-muted rounded-md" />
              )}
              <span className={cn("relative inline-flex transition-transform duration-200", iconClass)}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="relative">{t(labelKey)}</span>
            </a>
          );
        })}
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
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Clear pending state when navigation completes
  useEffect(() => { setPendingHref(null); }, [pathname]);

  // Prefetch all nav pages on mount
  useEffect(() => {
    navItems.forEach(({ href }) => router.prefetch(href));
  }, [router]);

  const activeHref = pendingHref ?? pathname;

  const handleNav = useCallback((e: React.MouseEvent, href: string) => {
    e.preventDefault();
    if (href === pathname) return;
    setPendingHref(href);
    router.push(href);
  }, [pathname, router]);

  // Hide mobile nav when in the book reader
  const isReaderPage = pathname.startsWith("/reader/");
  if (isReaderPage) return null;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t flex justify-around items-center h-16 min-h-[4rem] z-50 pb-[env(safe-area-inset-bottom)]">
      {navItems.map(({ href, icon: Icon, labelKey, iconClass }) => {
        const active = isActive(activeHref, href);
        return (
          <a
            key={href}
            href={href}
            onClick={(e) => handleNav(e, href)}
            className={cn(
              "nav-link relative flex flex-col items-center justify-center gap-1 py-2 px-4 min-w-[3.5rem] transition-colors duration-150 hover:text-foreground touch-action-manipulation",
              active ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {active && (
              <span className="absolute inset-0 bg-muted rounded-md" />
            )}
            <span className={cn("relative inline-flex transition-transform duration-200", iconClass)}>
              <Icon className="h-6 w-6" />
            </span>
            <span className="text-[0.7rem] relative">{t(labelKey)}</span>
          </a>
        );
      })}
    </nav>
  );
}
