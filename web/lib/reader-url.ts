/**
 * Centralized utility for building reader URLs.
 * Ensures consistent encoding and parameter usage across the codebase.
 */

/** Build a URL to the book reader with optional page number */
export function buildReaderUrl(bookId: string, pageNumber?: number | string): string {
  const encoded = encodeURIComponent(bookId);
  if (pageNumber != null) {
    return `/reader/${encoded}?pn=${pageNumber}`;
  }
  return `/reader/${encoded}`;
}
