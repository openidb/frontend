"use client";

import { usePathname } from "next/navigation";
import { useReducedMotion } from "@/lib/use-reduced-motion";

export default function Template({ children }: { children: React.ReactNode }) {
  const prefersReducedMotion = useReducedMotion();
  const pathname = usePathname();

  // Skip fade-in for full-screen fixed pages — an opacity < 1 ancestor
  // creates a containing block in WebKit, breaking position:fixed children
  const isFullscreen = pathname.startsWith("/reader/") || pathname.startsWith("/audiobook/") || pathname.startsWith("/mushaf/");

  if (prefersReducedMotion || isFullscreen) {
    return <>{children}</>;
  }

  return (
    <div className="animate-fade-in">
      {children}
    </div>
  );
}
