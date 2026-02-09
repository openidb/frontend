import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Strips all HTML tags except <mark> and </mark> from a string.
 * Used to sanitize Elasticsearch highlight snippets before rendering
 * via dangerouslySetInnerHTML.
 */
export function sanitizeHighlight(html: string): string {
  return html.replace(/<\/?(?!mark\b)[^>]*>/gi, "")
}
