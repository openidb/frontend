"use client";

import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "@/lib/theme";

export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      theme={resolvedTheme as "light" | "dark"}
      position="bottom-right"
      toastOptions={{
        className: "border border-border bg-background text-foreground",
      }}
    />
  );
}
