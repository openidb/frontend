import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sanitizes Elasticsearch highlight snippets for safe use with dangerouslySetInnerHTML.
 * Only bare <mark> and </mark> tags survive; everything else (including HTML entities
 * that could decode to executable markup) is escaped.
 */
export function sanitizeHighlight(html: string): string {
  // 1. Replace bare <mark> and </mark> with null-byte placeholders
  let s = html
    .replace(/<mark\s*>/gi, "\x00MARK\x00")
    .replace(/<\/mark\s*>/gi, "\x00/MARK\x00");
  // 2. Strip ALL remaining HTML tags
  s = s.replace(/<[^>]*>/g, "");
  // 3. Escape HTML special chars (neutralizes entity-encoded tags)
  s = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  // 4. Restore safe <mark> tags from placeholders
  s = s
    .replace(/\x00MARK\x00/g, "<mark>")
    .replace(/\x00\/MARK\x00/g, "</mark>");
  return s;
}
