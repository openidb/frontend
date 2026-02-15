"use client";

import { PrefetchLink } from "./PrefetchLink";
import { BookOpen, Users, Search, Settings2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { LanguageSwitcher, LanguageSwitcherCompact } from "./LanguageSwitcher";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/search", icon: Search, labelKey: "nav.search" as const },
  { href: "/", icon: BookOpen, labelKey: "nav.books" as const },
  { href: "/authors", icon: Users, labelKey: "nav.authors" as const },
  { href: "/config", icon: Settings2, labelKey: "nav.config" as const },
];

const iconVariants = {
  rest: { scale: 1 },
  hover: { scale: 1.08 },
  tap: { scale: 0.95 },
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function DesktopNavigation() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();

  return (
    <aside className="hidden md:flex w-48 border-e bg-background p-4 shrink-0 flex-col">
      {/* Logo */}
      <PrefetchLink href="/search" className="flex items-center justify-center gap-1.5 mb-4">
        <span
          className="text-[2.6rem] font-bold leading-[1] self-center"
          style={{ fontFamily: "var(--font-montserrat), sans-serif", color: "#37C1C4" }}
        >
          OI
        </span>
        <div
          className="flex flex-col text-[0.6rem] font-semibold uppercase leading-tight tracking-wide text-muted-foreground -mt-1"
          style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
        >
          <span>Open</span>
          <span>Islamic</span>
          <span>Database</span>
        </div>
      </PrefetchLink>

      <nav className="space-y-2 flex-1">
        {navItems.map(({ href, icon: Icon, labelKey }) => {
          const active = isActive(pathname, href);
          return (
            <motion.div
              key={href}
              initial="rest"
              whileHover={prefersReducedMotion ? undefined : "hover"}
              whileTap={prefersReducedMotion ? undefined : "tap"}
              animate="rest"
            >
              <PrefetchLink
                href={href}
                className={cn(
                  "relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-muted",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {active && (
                  <span className="absolute inset-0 bg-muted rounded-md" />
                )}
                <motion.span
                  className="relative inline-flex"
                  variants={prefersReducedMotion ? undefined : iconVariants}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                >
                  <Icon className="h-4 w-4" />
                </motion.span>
                <span className="relative">{t(labelKey)}</span>
              </PrefetchLink>
            </motion.div>
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
  const prefersReducedMotion = useReducedMotion();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t flex justify-around items-center h-16 z-50">
      {navItems.map(({ href, icon: Icon, labelKey }) => {
        const active = isActive(pathname, href);
        return (
          <motion.div
            key={href}
            initial="rest"
            whileHover={prefersReducedMotion ? undefined : "hover"}
            whileTap={prefersReducedMotion ? undefined : "tap"}
            animate="rest"
          >
            <PrefetchLink
              href={href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 py-2 px-4 transition-colors duration-150 hover:text-foreground",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {active && (
                <span className="absolute inset-0 bg-muted rounded-md" />
              )}
              <motion.span
                className="relative inline-flex"
                variants={prefersReducedMotion ? undefined : iconVariants}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
              >
                <Icon className="h-5 w-5" />
              </motion.span>
              <span className="text-xs relative">{t(labelKey)}</span>
            </PrefetchLink>
          </motion.div>
        );
      })}
    </nav>
  );
}
