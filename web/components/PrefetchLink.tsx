"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ComponentProps, useCallback, useRef } from "react";

interface PrefetchLinkProps extends ComponentProps<typeof Link> {
  prefetchDelay?: number;
}

export function PrefetchLink({
  href,
  prefetchDelay = 100,
  onMouseEnter,
  onMouseLeave,
  ...props
}: PrefetchLinkProps) {
  const router = useRouter();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (typeof href === "string") {
          router.prefetch(href);
        }
      }, prefetchDelay);
      onMouseEnter?.(e);
    },
    [href, prefetchDelay, router, onMouseEnter]
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
