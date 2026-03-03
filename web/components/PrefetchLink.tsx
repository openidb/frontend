"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ComponentProps, useCallback, useRef } from "react";

interface PrefetchLinkProps extends ComponentProps<typeof Link> {
  prefetchDelay?: number;
  /** Additional API URLs to fetch on hover (warms the browser HTTP cache) */
  prefetchData?: string | string[];
}

export function PrefetchLink({
  href,
  prefetchDelay = 100,
  prefetchData,
  onMouseEnter,
  onMouseLeave,
  ...props
}: PrefetchLinkProps) {
  const router = useRouter();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prefetchedDataRef = useRef<Set<string>>(new Set());

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (typeof href === "string") {
          router.prefetch(href);
        }
        // Prefetch API data URLs to warm browser cache
        if (prefetchData) {
          const urls = Array.isArray(prefetchData) ? prefetchData : [prefetchData];
          for (const url of urls) {
            if (!prefetchedDataRef.current.has(url)) {
              prefetchedDataRef.current.add(url);
              fetch(url, { priority: "low" }).catch(() => {
                prefetchedDataRef.current.delete(url);
              });
            }
          }
        }
      }, prefetchDelay);
      onMouseEnter?.(e);
    },
    [href, prefetchDelay, router, onMouseEnter, prefetchData]
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      onMouseLeave?.(e);
    },
    [onMouseLeave]
  );

  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    />
  );
}
